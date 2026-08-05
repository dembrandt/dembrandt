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

function page(url, overrides: Record<string, unknown> = {}) {
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

test('merged meta gets a fresh snapshotId and aggregates readiness across pages', () => {
  const a = page('https://a.com/', {
    meta: { schemaVersion: '1.3.0', snapshotId: 'id-a', viewport: { width: 1920, height: 1080 }, fontsReady: true },
  });
  const b = page('https://a.com/pricing', {
    meta: { schemaVersion: '1.3.0', snapshotId: 'id-b', fontsReady: false, pendingFonts: ['Inter'], degraded: ['hover-focus'] },
  });

  const merged = mergeResults([a, b]);
  assert.ok(merged.meta.snapshotId, 'merged snapshot must have an id');
  assert.notEqual(merged.meta.snapshotId, 'id-a', 'merged artifact is a distinct snapshot');
  assert.equal(merged.meta.fontsReady, false, 'one fallback-rendered page taints the merged snapshot');
  assert.deepEqual(merged.meta.pendingFonts, ['Inter']);
  assert.deepEqual(merged.meta.degraded, ['hover-focus']);
  assert.deepEqual(merged.meta.viewport, { width: 1920, height: 1080 }, 'home meta fields survive');
});

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

test('mergeResults unions variable-font axes by axis, widening the range', () => {
  const home = page('https://a.test', {
    typography: { styles: [], sources: { variableAxes: [{ axis: 'wght', min: 400, max: 600, count: 2 }] } },
  });
  const second = page('https://a.test/pricing', {
    typography: { styles: [], sources: { variableAxes: [
      { axis: 'wght', min: 300, max: 700, count: 1 },
      { axis: 'slnt', min: -4, max: 0, count: 1 },
    ] } },
  });

  const merged = mergeResults([home, second]);
  const axes = merged.typography.sources.variableAxes;
  const wght = axes.find((a) => a.axis === 'wght');
  assert.equal(wght.min, 300);
  assert.equal(wght.max, 700);
  assert.equal(wght.count, 3);
  assert.ok(axes.find((a) => a.axis === 'slnt'));
});

test('mergeResults unions wcag pairs, deduping order-insensitive static pairs and summing counts', () => {
  const pair = (fg, bg, count) => ({ fg, bg, ratio: 4.6, aa: true, aaLarge: true, aaa: false, count });
  const home = page('https://a.test', {
    wcag: [pair('#000000', '#ffffff', 5), { fg: '#888888', bg: '#999999', ratio: 1.2, aa: false, aaLarge: false, aaa: false, state: 'hover', tag: 'a', source: 'state' }],
  });
  const second = page('https://a.test/pricing', {
    // Same static pair with fg/bg swapped -> same pair, counts sum.
    wcag: [pair('#ffffff', '#000000', 3), pair('#cc0000', '#ffffff', 2)],
  });

  const merged = mergeResults([home, second]);

  const statics = merged.wcag.filter((p) => !p.source);
  assert.equal(statics.length, 2);
  const bw = statics.find((p) => [p.fg, p.bg].sort().join('/') === '#000000/#ffffff');
  assert.equal(bw.count, 8);

  // State pairs survive the merge, appended after static pairs.
  const states = merged.wcag.filter((p) => p.source === 'state');
  assert.equal(states.length, 1);
  assert.equal(states[0].state, 'hover');
});

test('mergeResults omits wcag when no page ran the analysis', () => {
  const merged = mergeResults([page('https://a.test'), page('https://a.test/pricing')]);
  assert.equal('wcag' in merged, false);
});

test('mergeResults keeps rawColors per page in the pages array', () => {
  const raw = (hex) => [{ normalized: hex, color: hex, count: 1 }];
  const home = page('https://a.test', {
    colors: { palette: [], semantic: {}, cssVariables: {}, rawColors: raw('#111111') },
  });
  const second = page('https://a.test/pricing', {
    colors: { palette: [], semantic: {}, cssVariables: {}, rawColors: raw('#222222') },
  });

  const merged = mergeResults([home, second]);

  assert.equal(merged.pages[0].rawColors[0].normalized, '#111111');
  assert.equal(merged.pages[1].rawColors[0].normalized, '#222222');
  // Back-compat: colors.rawColors stays the first page's set.
  assert.equal(merged.colors.rawColors[0].normalized, '#111111');
  // No leak when the flag was off: plain pages entries carry no rawColors key.
  const plain = mergeResults([page('https://a.test'), page('https://a.test/x')]);
  assert.equal('rawColors' in plain.pages[0], false);
});

test('mergeResults sorts merged font urls so page order never reaches the output', () => {
  const home = page('https://a.test', {
    typography: { styles: [], sources: { urls: ['https://a.test/b.woff2', 'https://a.test/d.woff2'] } },
  });
  const second = page('https://a.test/pricing', {
    typography: { styles: [], sources: { urls: ['https://a.test/a.woff2', 'https://a.test/b.woff2'] } },
  });

  const forward = mergeResults([home, second]).typography.sources.urls;
  assert.deepEqual(forward, [
    'https://a.test/a.woff2',
    'https://a.test/b.woff2',
    'https://a.test/d.woff2',
  ]);
});

// ─── Per-category union rules ────────────────────────────────────────────────
// Everything below was previously unexercised: the crawl merge is the least
// visible code path in the CLI (one flag, no CI coverage) and the most trusted,
// since its output is what --save-output writes and what drift compares.

test('typography styles dedup on family|size|weight and count occurrences', () => {
  const style = (family, size, weight) => ({ context: 'body', family, size, weight });
  const a = page('https://a.com/', { typography: { styles: [style('Inter', '16px', '400')], sources: { googleFonts: ['Inter'] } } });
  const b = page('https://a.com/x', {
    typography: {
      styles: [style('Inter', '16px', '400'), style('Inter', '48px', '700')],
      sources: { googleFonts: ['Lora'], fontDisplay: 'swap' },
    },
  });

  const merged = mergeResults([a, b]);
  assert.equal(merged.typography.styles.length, 2, 'identical tuples collapse');
  const body = merged.typography.styles.find(s => s.size === '16px');
  assert.equal(body.count, 2, 'repeat across pages is counted');
  assert.deepEqual(merged.typography.sources.googleFonts, ['Inter', 'Lora'], 'font source arrays union');
  assert.equal(merged.typography.sources.fontDisplay, 'swap', 'a scalar the home page lacked is adopted');
});

test('spacing values union by px and sum counts', () => {
  const a = page('https://a.com/', { spacing: { scaleType: '8px', commonValues: [{ px: '16px', count: 4 }] } });
  const b = page('https://a.com/x', { spacing: { scaleType: '8px', commonValues: [{ px: '16px', count: 3 }, { px: '24px', count: 9 }] } });

  const merged = mergeResults([a, b]);
  assert.equal(merged.spacing.scaleType, '8px', 'home scale type wins');
  const px16 = merged.spacing.commonValues.find(v => v.px === '16px');
  assert.equal(px16.count, 7);
  assert.equal(merged.spacing.commonValues[0].px, '24px', 'sorted by count desc');
});

test('border radius confidence is recomputed from the aggregated count', () => {
  // A value that is low-confidence on every page can be high-confidence across
  // the site. This promotion is the whole point of crawling.
  const a = page('https://a.com/', { borderRadius: { values: [{ value: '8px', count: 6, confidence: 'low' }] } });
  const b = page('https://a.com/x', { borderRadius: { values: [{ value: '8px', count: 6, confidence: 'low' }] } });

  const merged = mergeResults([a, b]);
  const r = merged.borderRadius.values[0];
  assert.equal(r.count, 12);
  assert.equal(r.confidence, 'high', 'count > 10 promotes to high');
});

test('borders union on width|style|color, cap elements at 5 and promote confidence', () => {
  const combo = (count, elements) => ({ width: '1px', style: 'solid', color: '#242424', count, elements, confidence: 'low' });
  const a = page('https://a.com/', { borders: { combinations: [combo(3, ['div', 'span', 'a'])] } });
  const b = page('https://a.com/x', { borders: { combinations: [combo(9, ['section', 'footer', 'nav'])] } });

  const merged = mergeResults([a, b]);
  const c = merged.borders.combinations[0];
  assert.equal(c.count, 12);
  assert.equal(c.confidence, 'high');
  assert.equal(c.elements.length, 5, 'element list is capped');
});

test('shadows union on the shadow string and recompute confidence', () => {
  const a = page('https://a.com/', { shadows: [{ shadow: '0 1px 2px #000', count: 2, confidence: 'low' }] });
  const b = page('https://a.com/x', { shadows: [{ shadow: '0 1px 2px #000', count: 3, confidence: 'low' }, { shadow: '0 0 0 red', count: 1 }] });

  const merged = mergeResults([a, b]);
  assert.equal(merged.shadows.length, 2);
  assert.equal(merged.shadows[0].count, 5);
  assert.equal(merged.shadows[0].confidence, 'medium', 'count > 3 but <= 10');
});

test('components dedup by fingerprint and sum counts', () => {
  const btn = (bg) => ({ variant: 'primary', backgroundColor: bg, color: '#fff', borderRadius: '8px' });
  const a = page('https://a.com/', { components: { buttons: [btn('#1a73e8')], inputs: {}, links: [], badges: {} } });
  const b = page('https://a.com/x', { components: { buttons: [btn('#1a73e8'), btn('#ff0000')], inputs: {}, links: [], badges: {} } });

  const merged = mergeResults([a, b]);
  assert.equal(merged.components.buttons.length, 2, 'identical buttons collapse');
  assert.equal(merged.components.buttons[0].count, 2, 'the repeated variant leads');
});

test('grouped components keep their grouping keys through the merge', () => {
  const inputs = { text: [{ backgroundColor: '#fff', borderColor: '#ddd' }], checkbox: [{ backgroundColor: '#fff' }] };
  const badges = { all: [{ backgroundColor: '#ffd230' }], byVariant: { error: [{ backgroundColor: '#ff0000' }] } };
  const a = page('https://a.com/', { components: { buttons: [], links: [], inputs, badges } });
  const b = page('https://a.com/x', { components: { buttons: [], links: [], inputs, badges } });

  const merged = mergeResults([a, b]);
  assert.ok(Array.isArray(merged.components.inputs.text), 'text group survives');
  assert.ok(Array.isArray(merged.components.inputs.checkbox), 'checkbox group survives');
  assert.equal(merged.components.inputs.text[0].count, 2);
  assert.ok(Array.isArray(merged.components.badges.byVariant.error), 'nested byVariant group survives');
});

test('icon systems and frameworks dedup by name, first occurrence wins', () => {
  const a = page('https://a.com/', { iconSystem: [{ name: 'Heroicons', type: 'svg' }], frameworks: [{ name: 'Tailwind', confidence: 'high' }] });
  const b = page('https://a.com/x', { iconSystem: [{ name: 'Heroicons', type: 'font' }], frameworks: [{ name: 'Tailwind', confidence: 'low' }, { name: 'MUI' }] });

  const merged = mergeResults([a, b]);
  assert.equal(merged.iconSystem.length, 1);
  assert.equal(merged.iconSystem[0].type, 'svg', 'home page detection is kept');
  assert.deepEqual(merged.frameworks.map(f => f.name), ['Tailwind', 'MUI']);
});

test('motion unions durations by value, easings and animations by count', () => {
  const a = page('https://a.com/', {
    motion: { durations: [{ value: '150ms', ms: 150, count: 1 }], easings: [{ value: 'ease-out', count: 1 }], animations: [{ name: 'fade', count: 1 }], contexts: {}, interactiveDeltas: [] },
  });
  const b = page('https://a.com/x', {
    motion: { durations: [{ value: '150ms', ms: 150, count: 2 }, { value: '80ms', ms: 80, count: 1 }], easings: [{ value: 'ease-out', count: 4 }], animations: [{ name: 'fade', count: 2 }], contexts: {}, interactiveDeltas: [] },
  });

  const merged = mergeResults([a, b]);
  assert.deepEqual(merged.motion.durations.map(d => d.value), ['80ms', '150ms'], 'durations sort fastest first');
  assert.equal(merged.motion.durations.find(d => d.value === '150ms').count, 3);
  assert.equal(merged.motion.easings[0].count, 5);
  assert.equal(merged.motion.animations[0].count, 3);
});

test('wcag pairs dedup order-insensitively and state pairs stay separate', () => {
  const a = page('https://a.com/', { wcag: [{ fg: '#fff', bg: '#000', ratio: 21, aa: true, count: 2 }] });
  const b = page('https://a.com/x', {
    wcag: [
      { fg: '#000', bg: '#fff', ratio: 21, aa: true, count: 3 },
      { fg: '#fff', bg: '#000', ratio: 21, aa: true, count: 1, source: 'state', state: 'hover', tag: 'a' },
    ],
  });

  const merged = mergeResults([a, b]);
  const statics = merged.wcag.filter(p => !p.source);
  assert.equal(statics.length, 1, 'fg/bg swapped is the same pair');
  assert.equal(statics[0].count, 5);
  assert.equal(merged.wcag.filter(p => p.source === 'state').length, 1, 'state pair is not folded into the static one');
  assert.equal(merged.wcag[merged.wcag.length - 1].source, 'state', 'state pairs are appended last');
});

test('gradients union on the gradient string', () => {
  const g = { gradient: 'linear-gradient(#000, #fff)', type: 'linear-gradient', count: 1 };
  const merged = mergeResults([
    page('https://a.com/', { gradients: [{ ...g }] }),
    page('https://a.com/x', { gradients: [{ ...g }] }),
  ]);
  assert.equal(merged.gradients.length, 1);
  assert.equal(merged.gradients[0].count, 2);
});

test('a page missing whole sections does not break the merge', () => {
  // Pages fail individually during a crawl and are pushed with whatever the
  // guarded extractors returned, so absent sections are normal input here.
  const merged = mergeResults([
    page('https://a.com/'),
    { url: 'https://a.com/x', extractedAt: 't' },
  ] as never);
  assert.equal(merged.pages.length, 2, 'both pages are recorded');
  assert.ok(Array.isArray(merged.shadows));
  assert.ok(Array.isArray(merged.colors.palette));
  assert.ok(Array.isArray(merged.components.buttons));
});
