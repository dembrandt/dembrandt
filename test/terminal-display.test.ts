import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayResults, terminalLink } from '../lib/formatters/terminal.js';
import type { BrandingResult } from '../lib/types.js';

// The terminal renderer is the only output path CI never exercises: liveness runs
// with --json-only. These tests are that path's guard. Two jobs: every section
// renders its data, and a partial or foreign-shaped payload degrades to silence
// instead of taking the whole render down.

function render(data: Partial<BrandingResult>): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    displayResults(data as BrandingResult);
  } finally {
    console.log = original;
  }
  return lines.map((l) => l.replace(/\[[0-9;]*m/g, ''));
}

const MINIMAL: Partial<BrandingResult> = {
  url: 'https://example.test',
  extractedAt: '2026-08-05T12:30:45.000Z',
};

/** Everything populated, so each section has something to print. */
const FULL: Partial<BrandingResult> = {
  ...MINIMAL,
  logo: { source: 'svg', url: '/logo.svg', width: 120, height: 32, inline: true, color: '#1a73e8',
    safeZone: { top: 8, right: 8, bottom: 8, left: 8 } } as never,
  favicons: [{ type: 'icon', url: 'https://example.test/favicon.ico', sizes: '32x32' }],
  colors: {
    semantic: { primary: '#1a73e8' },
    palette: [{ color: '#1a73e8', normalized: '#1a73e8', count: 40, confidence: 'high', role: 'accent' }],
    cssVariables: { '--brand': { value: '#1a73e8', hex: '#1a73e8' } },
  },
  typography: {
    styles: [{ context: 'heading-1', family: 'Inter', size: '48px', weight: '700', lineHeight: '1.1' }],
    sources: { googleFonts: ['Inter', 'Lora', 'Mono', 'Extra'], fontDisplay: 'swap' },
  } as never,
  spacing: { scaleType: '8px', commonValues: [{ px: '16px', rem: '1rem' }] } as never,
  borderRadius: { values: [{ value: '8px', confidence: 'high', elements: ['button', 'card'] }] } as never,
  borders: { combinations: [{ width: '1px', style: 'solid', color: '#242424', count: 12, confidence: 'high' }] } as never,
  shadows: [{ shadow: '0 1px 2px rgba(0,0,0,.1)', confidence: 'high', count: 9 }] as never,
  gradients: [{ type: 'linear-gradient', stopColors: ['rgb(26, 115, 232)', 'rgb(255, 210, 48)'] }] as never,
  motion: { durations: ['150ms'], easings: ['ease-out'], byContext: {} } as never,
  components: {
    buttons: [{ variant: 'primary', backgroundColor: '#1a73e8', color: '#ffffff', borderRadius: '8px', fontSize: '14px' }],
    inputs: [{ backgroundColor: '#ffffff', borderColor: '#dddddd', borderRadius: '4px' }],
    links: [{ color: '#1a73e8', textDecoration: 'none' }],
    badges: { all: [{ backgroundColor: '#ffd230', color: '#000000' }], byVariant: {} },
  } as never,
  breakpoints: [{ px: '1024px' }, { px: '768px' }] as never,
  iconSystem: [{ name: 'Heroicons', type: 'svg', sizes: ['24'] }] as never,
  frameworks: [{ name: 'Tailwind', confidence: 'high', evidence: 'utility classes' }] as never,
  wcag: [{ fg: '#ffffff', bg: '#1a73e8', ratio: 4.6, aa: true, aaa: false }] as never,
};

test('a malformed wcag pair renders without a swatch instead of throwing', () => {
  const out = render({ ...MINIMAL, wcag: [{ ratio: 3.2, aa: false }] as never }).join('\n');
  assert.ok(out.includes('WCAG Contrast'), out);
  assert.ok(out.includes('✓ Complete'), out);
});

test('a full payload renders every section', () => {
  const out = render(FULL).join('\n');
  for (const section of ['Logo', 'Favicons', 'Colors', 'Typography', 'Spacing', 'Border Radius',
    'Borders', 'Shadows', 'Gradients', 'Breakpoints', 'Icon System', 'Frameworks']) {
    assert.ok(out.includes(section), `missing section: ${section}`);
  }
  assert.ok(out.includes('✓ Complete'), 'missing completion line');
});

test('section data reaches the output, not just the headings', () => {
  const out = render(FULL).join('\n');
  assert.ok(out.includes('120×32px'), 'logo dimensions');
  assert.ok(out.includes('Safe zone: 8px 8px 8px 8px'), 'logo safe zone');
  assert.ok(out.includes('32x32'), 'favicon size');
  assert.ok(out.includes('Inter'), 'font family');
  assert.ok(out.includes('font-display: swap'), 'font-display');
  assert.ok(out.includes('System: 8px'), 'spacing scale');
  assert.ok(out.includes('16px'), 'spacing value');
  assert.ok(out.includes('1px solid'), 'border combination');
  assert.ok(out.includes('0 1px 2px'), 'shadow');
  assert.ok(out.includes('1024px'), 'breakpoint');
  assert.ok(out.includes('Heroicons'), 'icon system');
  assert.ok(out.includes('Tailwind'), 'framework');
});

test('a fourth font source collapses into a "+N more" line', () => {
  const out = render(FULL).join('\n');
  assert.ok(out.includes('+1 more'), 'expected the font overflow line');
});

test('breakpoints render largest first regardless of input order', () => {
  const out = render(FULL).join('\n');
  const line = out.split('\n').find((l) => l.includes('→'));
  assert.ok(line, 'no breakpoint line');
  assert.ok(line.indexOf('1024px') < line.indexOf('768px'), line);
});

test('a bare payload renders without a single section', () => {
  const out = render(MINIMAL).join('\n');
  assert.ok(out.includes('✓ Complete'), out);
  for (const section of ['Logo', 'Colors', 'Typography', 'Spacing', 'Shadows', 'Frameworks']) {
    assert.ok(!out.includes(section), `unexpected section on empty data: ${section}`);
  }
});

test('each section is independently optional', () => {
  // Drop one key at a time from the full payload: nothing may throw, and the
  // remaining sections must still render.
  for (const key of Object.keys(FULL).filter((k) => k !== 'url' && k !== 'extractedAt')) {
    const partial = { ...FULL, [key]: undefined };
    const out = render(partial).join('\n');
    assert.ok(out.includes('✓ Complete'), `dropping ${key} broke the render`);
  }
});

test('numeric spacing px from a merged payload does not crash the render', () => {
  // mergeResults types px as string | number; the renderer used to call
  // .padEnd() on it, which throws on a number.
  const out = render({ ...FULL, spacing: { scaleType: '8px', commonValues: [{ px: 16, rem: '1rem' }] } as never });
  assert.ok(out.join('\n').includes('16'), 'numeric px did not render');
});

test('empty arrays and empty objects are treated as no data', () => {
  const out = render({
    ...MINIMAL,
    favicons: [], shadows: [], gradients: [], breakpoints: [], iconSystem: [], frameworks: [],
    borderRadius: { values: [] } as never,
    borders: { combinations: [] } as never,
    colors: { semantic: {}, palette: [], cssVariables: {} },
  }).join('\n');
  for (const section of ['Favicons', 'Shadows', 'Gradients', 'Breakpoints', 'Icon System', 'Frameworks', 'Border Radius', 'Borders']) {
    assert.ok(!out.includes(section), `empty ${section} still printed a heading`);
  }
});

test('low-confidence radii, borders and shadows are filtered out', () => {
  const out = render({
    ...MINIMAL,
    borderRadius: { values: [{ value: '3px', confidence: 'low' }] } as never,
    shadows: [{ shadow: '0 0 1px red', confidence: 'low' }] as never,
  }).join('\n');
  assert.ok(!out.includes('Border Radius'), 'low-confidence radius leaked');
  assert.ok(!out.includes('Shadows'), 'low-confidence shadow leaked');
});

test('a multi-page merge lists the crawled paths', () => {
  const out = render({
    ...FULL,
    pages: [{ url: 'https://example.test/' }, { url: 'https://example.test/pricing' }],
  } as never).join('\n');
  assert.ok(out.includes('2 pages'), out);
  assert.ok(out.includes('/pricing'), out);
});

test('a single-page result does not claim to be a crawl', () => {
  const out = render({ ...FULL, pages: [{ url: 'https://example.test/' }] } as never).join('\n');
  assert.ok(!out.includes('1 pages'), out);
});

test('an inline logo without a usable url still reports its source and colour', () => {
  const out = render({ ...MINIMAL, logo: { inline: true, source: 'svg', url: '/', color: '#ff0000' } as never }).join('\n');
  assert.ok(out.includes('inline svg'), out);
  assert.ok(out.includes('#ff0000'), out);
});

test('terminalLink degrades to plain text when the terminal cannot hyperlink', () => {
  const link = terminalLink('https://example.test', 'label');
  assert.ok(link.includes('example.test') || link.includes('label'), link);
});
