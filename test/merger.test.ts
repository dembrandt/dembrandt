import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeResults } from '../lib/merger.js';

/**
 * mergeResults feeds both the terminal display and the DTCG formatter. It is a
 * pure function, so it is tested directly with synthetic extraction results
 * rather than live pages. These assertions pin the union invariants: perceptual
 * dedup, pageCount, count summation, multi-page confidence boost, homepage-wins
 * semantics, and the pages provenance array.
 */

function page(url, overrides: any = {}) {
  return {
    url,
    extractedAt: `${url}-time`,
    siteName: 'Test',
    logo: { url: 'logo.svg' },
    favicons: [],
    colors: { palette: [], semantic: {}, cssVariables: {} },
    typography: { styles: [], sources: {} },
    spacing: { commonValues: [] },
    borderRadius: { values: [] },
    borders: { combinations: [] },
    shadows: [],
    gradients: [],
    motion: { durations: [], easings: [], animations: [], contexts: {}, interactiveDeltas: [] },
    components: { buttons: [], inputs: {}, links: [], badges: {} },
    breakpoints: [],
    iconSystem: [],
    frameworks: [],
    ...overrides,
  };
}

const color = (hex, count, confidence) => ({ normalized: hex, color: hex, count, confidence });

test('mergeResults throws on empty input', () => {
  assert.throws(() => mergeResults([]), /No results to merge/);
});

test('mergeResults returns a single result unchanged', () => {
  const only = page('https://a.test');
  assert.equal(mergeResults([only]), only);
});

test('mergeResults unions palette with perceptual dedup, pageCount and count', () => {
  const home = page('https://a.test', {
    colors: {
      palette: [color('#0066cc', 10, 'high'), color('#777777', 2, 'low')],
      semantic: { primary: '#0066cc' },
      cssVariables: {},
    },
  });
  const second = page('https://a.test/pricing', {
    colors: {
      // #0166cc is within deltaE 15 of #0066cc -> collapses.
      // #777777 repeats -> low confidence boosted by multi-page presence.
      // #cc0000 is page-only.
      palette: [color('#0166cc', 6, 'high'), color('#777777', 3, 'low'), color('#cc0000', 4, 'low')],
      semantic: { primary: '#cc0000', secondary: '#00aa00' },
      cssVariables: {},
    },
  });

  const merged = mergeResults([home, second]);
  const pal = merged.colors.palette;

  const blue = pal.find((c) => c.normalized === '#0066cc');
  assert.ok(blue, 'near-duplicate blues collapse to the higher-count canonical');
  assert.equal(blue.pageCount, 2);
  assert.equal(blue.count, 16);
  assert.equal(pal.some((c) => c.normalized === '#0166cc'), false);

  const gray = pal.find((c) => c.normalized === '#777777');
  assert.equal(gray.pageCount, 2);
  assert.equal(gray.count, 5);
  assert.equal(gray.confidence, 'medium'); // low -> medium because pageCount > 1

  const red = pal.find((c) => c.normalized === '#cc0000');
  assert.equal(red.pageCount, 1);
  assert.equal(red.confidence, 'low');

  // Homepage semantic wins; missing keys are filled from later pages.
  assert.equal(merged.colors.semantic.primary, '#0066cc');
  assert.equal(merged.colors.semantic.secondary, '#00aa00');
});

test('mergeResults dedupes typography by family/size/weight and sums spacing', () => {
  const style = (family, size, weight) => ({ family, size, weight });
  const home = page('https://a.test', {
    typography: { styles: [style('Inter', '16px', '400')], sources: {} },
    spacing: { commonValues: [{ px: '8px', count: 5 }] },
  });
  const second = page('https://a.test/x', {
    typography: { styles: [style('Inter', '16px', '400'), style('Inter', '24px', '700')], sources: {} },
    spacing: { commonValues: [{ px: '8px', count: 3 }, { px: '16px', count: 2 }] },
  });

  const merged = mergeResults([home, second]);

  assert.equal(merged.typography.styles.length, 2);
  const eight = merged.spacing.commonValues.find((v) => v.px === '8px');
  assert.equal(eight.count, 8);
  assert.ok(merged.spacing.commonValues.find((v) => v.px === '16px'));
});

test('mergeResults records per-page provenance in the pages array', () => {
  const merged = mergeResults([page('https://a.test'), page('https://a.test/pricing')]);
  assert.equal(merged.pages.length, 2);
  assert.deepEqual(
    merged.pages.map((p) => p.url),
    ['https://a.test', 'https://a.test/pricing'],
  );
});
