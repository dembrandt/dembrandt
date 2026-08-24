import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyBudget,
  computeMetrics,
  countSyllables,
  countWords,
  PAGE_TYPE_CAP,
  totalWords,
  WORD_CAP,
  WORD_FLOOR,
} from '../lib/voice/metrics.js';
import { classifyPageType } from '../lib/voice/page-type.js';
import type { VoiceFragment, VoiceRole } from '../lib/types.js';

// The metrics are the half of voice extraction that must stay reproducible:
// drift compares them run over run, so a heuristic that shifts silently turns
// into a false "the brand changed its tone" finding.

const frag = (role: VoiceRole, text: string, order = 0): VoiceFragment => ({ role, text, order });

test('countWords ignores surrounding and repeated whitespace', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('one'), 1);
  assert.equal(countWords('  two   words  '), 2);
});

test('countSyllables handles the short-word and silent-e cases', () => {
  assert.equal(countSyllables(''), 0);
  assert.equal(countSyllables('the'), 1);
  assert.equal(countSyllables('make'), 1);
  assert.equal(countSyllables('design'), 2);
  assert.ok(countSyllables('extraordinary') >= 4);
});

test('computeMetrics returns zeroed metrics for no fragments', () => {
  const m = computeMetrics([], 'en');
  assert.equal(m.structural.wordCount, 0);
  assert.equal(m.structural.sentenceCount, 0);
  assert.equal(m.structural.meanSentenceLength, 0);
  assert.equal(m.structural.sentenceLengthStdev, 0);
  // No division-by-zero leaking NaN into the output contract.
  for (const v of Object.values(m.lexical!.personPronounRatio)) assert.equal(v, 0);
  assert.equal(m.lexical!.readability, null);
});

test('a single sentence has zero stdev rather than NaN', () => {
  const m = computeMetrics([frag('hero-body', 'We build design tools for teams.')], 'en');
  assert.equal(m.structural.sentenceCount, 1);
  assert.equal(m.structural.sentenceLengthStdev, 0);
  assert.ok(Number.isFinite(m.structural.meanSentenceLength));
});

test('headings are excluded from sentence statistics', () => {
  // Headings are labels, not sentences. Counting them inflated sentenceCount and
  // dragged every sentence-level statistic toward heading length.
  const headingsOnly = computeMetrics(
    [frag('section-h2', 'Pricing'), frag('section-h2', 'Features'), frag('hero-h1', 'Model X200')],
    'en',
  );
  assert.equal(headingsOnly.structural.sentenceCount, 0);
  assert.equal(headingsOnly.structural.meanSentenceLength, 0);
  // They still count toward vocabulary-level measures.
  assert.ok(headingsOnly.structural.wordCount > 0);
});

test('lexical metrics are withheld entirely outside supported languages', () => {
  // A zero would read as a measured "no first-person voice" rather than "not
  // measured". Structural metrics are language-independent and still computed.
  const fi = computeMetrics([frag('hero-body', 'Rakennamme muotoilutyokaluja tiimeille. Se toimii hyvin.')], 'fi');
  assert.equal(fi.lexical, null);
  assert.ok(fi.structural.wordCount > 0);
  assert.equal(fi.structural.sentenceCount, 2);
  assert.equal(fi.lang, 'fi');
});

test('readability is null outside the languages the formula models', () => {
  const copy = [frag('hero-body', 'Rakennamme muotoilutyokaluja tiimeille. Se toimii hyvin.')];
  assert.equal(computeMetrics(copy, 'fi').lexical, null);
  assert.equal(computeMetrics(copy, 'fi-FI').lexical, null);
  // A wrong number would be worse than an absent one, so English must still produce one.
  assert.notEqual(computeMetrics(copy, 'en').lexical!.readability, null);
});

test('lang falls back to a marker instead of an empty string', () => {
  assert.equal(computeMetrics([frag('hero-h1', 'Ship faster.')], '').lang, 'unknown');
  assert.equal(computeMetrics([frag('hero-h1', 'Ship faster.')], 'en-GB').lang, 'en-GB');
});

test('pronoun stance separates first, second and third person', () => {
  const we = computeMetrics([frag('value-prop', 'We build our tools with our own team every day.')], 'en');
  assert.ok(we.lexical!.personPronounRatio.first > we.lexical!.personPronounRatio.second);

  const you = computeMetrics([frag('value-prop', 'You keep your tokens and your brand in your control.')], 'en');
  assert.ok(you.lexical!.personPronounRatio.second > you.lexical!.personPronounRatio.first);
});

test('metrics ignore non-prose roles', () => {
  // Nav labels and placeholders are fragments, not sentences; counting them
  // would wreck sentence-length statistics.
  const withChrome = computeMetrics(
    [frag('hero-h1', 'Extract any design system.'), frag('nav-label', 'Pricing'), frag('form-placeholder', 'you@example.com')],
    'en',
  );
  const proseOnly = computeMetrics([frag('hero-h1', 'Extract any design system.')], 'en');
  assert.equal(withChrome.structural.wordCount, proseOnly.structural.wordCount);
});

test('punctuation ratios stay within [0,1] however many marks a sentence carries', () => {
  // Counting marks rather than sentences let a single "Now!! Really!!!" push the
  // ratio above 1, breaking the range the type documents.
  const shouty = computeMetrics(
    [frag('hero-body', 'Now!! Really!!! Absolutely!!!! You have to see this today.')],
    'en',
  );
  assert.ok(shouty.structural.exclamationRatio <= 1);
  assert.ok(shouty.structural.exclamationRatio > 0);

  const asking = computeMetrics([frag('hero-body', 'Why?? How?? What now, exactly?')], 'en');
  assert.ok(asking.structural.questionRatio <= 1);
});

test('metrics are reproducible for identical input', () => {
  const copy = [frag('hero-h1', 'Ship brand-faithful UI.'), frag('hero-body', 'We extract the real tokens from the rendered page, not the source.')];
  assert.deepEqual(computeMetrics(copy, 'en'), computeMetrics(copy, 'en'));
});

test('applyBudget is a no-op under the cap', () => {
  const copy = [frag('hero-h1', 'Short headline here.')];
  assert.equal(applyBudget(copy, 'landing'), copy);
});

test('applyBudget drops the lowest-weight roles first', () => {
  const filler = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
  const copy = [
    frag('footer-legal', filler(400)),
    frag('nav-label', filler(400)),
    frag('hero-h1', filler(200)),
  ];
  assert.ok(totalWords(copy) > PAGE_TYPE_CAP.landing);

  const kept = applyBudget(copy, 'landing');
  assert.ok(totalWords(kept) <= PAGE_TYPE_CAP.landing);
  const roles = kept.map((f) => f.role);
  assert.ok(roles.includes('hero-h1'), 'the highest-weight role must survive');
  assert.ok(!roles.includes('footer-legal'), 'the lowest-weight role goes first');
});

test('every page type caps at or below the global cap, and docs lowest', () => {
  for (const cap of Object.values(PAGE_TYPE_CAP)) assert.ok(cap <= WORD_CAP);
  // Docs prose is engineer-written, so it is weighted down deliberately.
  assert.ok(PAGE_TYPE_CAP.docs < PAGE_TYPE_CAP.landing);
  assert.ok(WORD_FLOOR < WORD_CAP);
});

test('classifyPageType reads the path before anything else', () => {
  const base = { headingCount: 5, formCount: 0, hasArticle: false };
  assert.equal(classifyPageType({ ...base, url: 'https://x.com' }), 'landing');
  assert.equal(classifyPageType({ ...base, url: 'https://x.com/' }), 'landing');
  assert.equal(classifyPageType({ ...base, url: 'https://x.com/docs/getting-started' }), 'docs');
  assert.equal(classifyPageType({ ...base, url: 'https://x.com/pricing' }), 'product');
  assert.equal(classifyPageType({ ...base, url: 'https://x.com/contact' }), 'contact');
  assert.equal(classifyPageType({ ...base, url: 'https://x.com/blog/a-post' }), 'news');
  assert.equal(classifyPageType({ ...base, url: 'https://x.com/something-else' }), 'other');
});

test('classifyPageType falls back to DOM signals and never throws on a bad url', () => {
  assert.equal(
    classifyPageType({ url: 'https://x.com/x', headingCount: 2, formCount: 0, hasArticle: true }),
    'news',
  );
  assert.equal(
    classifyPageType({ url: 'https://x.com/x', headingCount: 1, formCount: 1, hasArticle: false }),
    'contact',
  );
  assert.doesNotThrow(() => classifyPageType({ url: 'not a url', headingCount: 0, formCount: 0, hasArticle: false }));
});
