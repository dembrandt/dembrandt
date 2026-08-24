import type {
  VoiceFragment,
  VoiceLexicalMetrics,
  VoiceMetrics,
  VoicePageType,
  VoiceRole,
  VoiceStructuralMetrics,
} from '../types.js';

/**
 * Only signals that are counted from a closed word class or computed by a
 * published formula. Anything resting on a curated word list is interpretation,
 * and belongs to the layer that reads `fragments`.
 */

/** Languages the Flesch formula models. */
const FLESCH_LANGS = new Set(['en']);

/** Languages whose pronoun sets are covered. */
const LEXICON_LANGS = new Set(['en']);

const FIRST_PERSON = /\b(we|us|our|ours|ourselves)\b/gi;
const SECOND_PERSON = /\b(you|your|yours|yourself)\b/gi;
const THIRD_PERSON = /\b(they|them|their|theirs|themselves|it|its)\b/gi;

// Headings are labels, not sentences, and skew every sentence statistic.
const HEADING_ROLES: ReadonlySet<VoiceRole> = new Set<VoiceRole>([
  'hero-h1',
  'section-h2',
  'error-404-h1',
]);

const SENTENCE_ROLES: ReadonlySet<VoiceRole> = new Set<VoiceRole>([
  'meta-description',
  'hero-body',
  'section-body-lede',
  'value-prop',
  'claim',
  'social-proof',
  'differentiator',
  'error-404-body',
]);

/** Vocabulary-level metrics read headings too; sentence-level ones do not. */
const PROSE_ROLES: ReadonlySet<VoiceRole> = new Set<VoiceRole>([
  ...HEADING_ROLES,
  ...SENTENCE_ROLES,
]);

/** Below this, emit nothing. Calibrated on English pages; Finnish yields ~40% fewer words. */
export const WORD_FLOOR = 150;

/** Below this, sentence statistics are noisy and metrics carry `lowSample`. */
export const LOW_SAMPLE_WORDS = 300;

/** Guard against a pathological page rather than a tuned budget. */
export const WORD_CAP = 800;

export const PAGE_TYPE_CAP: Record<VoicePageType, number> = {
  landing: WORD_CAP,
  product: WORD_CAP,
  news: 600,
  contact: 400,
  docs: 400,
  other: 600,
};

/** Drop order when over budget: lowest weight goes first. */
const ROLE_WEIGHT: Record<VoiceRole, number> = {
  'hero-h1': 100,
  'meta-description': 95,
  'hero-body': 90,
  cta: 85,
  'value-prop': 80,
  'error-404-h1': 78,
  'error-404-body': 75,
  'form-placeholder': 70,
  'form-label': 68,
  claim: 65,
  differentiator: 60,
  'meta-title': 55,
  'section-h2': 50,
  'section-body-lede': 45,
  'social-proof': 40,
  'nav-label': 30,
  'footer-legal': 10,
};

export const countWords = (text: string): number =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

export const totalWords = (fragments: VoiceFragment[]): number =>
  fragments.reduce((sum, f) => sum + countWords(f.text), 0);

export function applyBudget(fragments: VoiceFragment[], pageType: VoicePageType): VoiceFragment[] {
  const cap = PAGE_TYPE_CAP[pageType];
  if (totalWords(fragments) <= cap) return fragments;

  const ranked = [...fragments].sort(
    (a, b) => (ROLE_WEIGHT[b.role] ?? 0) - (ROLE_WEIGHT[a.role] ?? 0) || a.order - b.order,
  );

  const kept: VoiceFragment[] = [];
  let used = 0;
  for (const f of ranked) {
    const words = countWords(f.text);
    if (used + words > cap) continue;
    kept.push(f);
    used += words;
  }

  return kept.sort(
    (a, b) => (ROLE_WEIGHT[b.role] ?? 0) - (ROLE_WEIGHT[a.role] ?? 0) || a.order - b.order,
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

/** Vowel-group heuristic, approximate; used only for ratios. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zäöåüé]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouyäöå]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

const ratio = (hits: number, total: number): number =>
  total === 0 ? 0 : Number((hits / total).toFixed(4));

const matchCount = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

export function computeMetrics(fragments: VoiceFragment[], lang: string): VoiceMetrics {
  const corpus = fragments.filter((f) => PROSE_ROLES.has(f.role)).map((f) => f.text).join(' ');
  const words = corpus.trim() ? corpus.trim().split(/\s+/) : [];
  const wordCount = words.length;

  const sentenceCorpus = fragments
    .filter((f) => SENTENCE_ROLES.has(f.role))
    .map((f) => f.text)
    .join(' ');
  const sentences = splitSentences(sentenceCorpus);
  const sentenceLengths = sentences.map(countWords);
  const sentenceCount = sentences.length;

  const sentenceWordCount = sentenceLengths.reduce((sum, n) => sum + n, 0);
  const mean = sentenceCount === 0 ? 0 : sentenceWordCount / sentenceCount;
  const variance =
    sentenceCount < 2
      ? 0
      : sentenceLengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (sentenceCount - 1);

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSyllablesPerWord = wordCount === 0 ? 0 : syllables / wordCount;
  const longWords = words.filter((w) => countSyllables(w) > 3).length;

  const structural: VoiceStructuralMetrics = {
    wordCount,
    sentenceCount,
    meanSentenceLength: Number(mean.toFixed(2)),
    sentenceLengthStdev: Number(Math.sqrt(variance).toFixed(2)),
    exclamationRatio: ratio(sentences.filter((s) => s.includes('!')).length, sentenceCount),
    questionRatio: ratio(sentences.filter((s) => s.includes('?')).length, sentenceCount),
    longWordRatio: ratio(longWords, wordCount),
    avgSyllablesPerWord: Number(avgSyllablesPerWord.toFixed(3)),
    lowSample: wordCount < LOW_SAMPLE_WORDS,
  };

  const base = lang.split('-')[0]?.toLowerCase() ?? '';
  if (!LEXICON_LANGS.has(base)) {
    return { structural, lexical: null, lang: lang || 'unknown' };
  }

  const lexical: VoiceLexicalMetrics = {
    personPronounRatio: {
      first: ratio(matchCount(corpus, FIRST_PERSON), wordCount),
      second: ratio(matchCount(corpus, SECOND_PERSON), wordCount),
      third: ratio(matchCount(corpus, THIRD_PERSON), wordCount),
    },
    readability:
      FLESCH_LANGS.has(base) && sentenceCount > 0 && wordCount > 0
        ? Number((206.835 - 1.015 * mean - 84.6 * avgSyllablesPerWord).toFixed(2))
        : null,
  };

  return { structural, lexical, lang: lang || 'unknown' };
}
