import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayResults } from '../lib/formatters/terminal.js';
import type { ColorFormat } from '../lib/colors.js';
import type { BrandingResult, Colors } from '../lib/types.js';

// --color-format is presentational: it selects the notation in the colour column
// and must not alter identity, dedup, or which colours are shown.

const COLORS: Colors = {
  semantic: { primary: 'rgb(26, 115, 232)' },
  palette: [
    {
      color: 'rgb(255, 210, 48)',
      normalized: '#ffd230',
      count: 12,
      confidence: 'high',
      role: 'accent',
      oklch: 'oklch(87.81% 0.169 91.86)',
      lch: 'lch(86.32% 78.47 85.7)',
    },
  ],
  cssVariables: {
    '--brand': {
      value: 'oklch(57.37% 0.195 257.86)',
      hex: '#1a73e8',
      oklch: 'oklch(57.37% 0.195 257.86)',
      lch: 'lch(48.77% 68.14 278.17)',
    },
  },
};

function render(colorFormat?: ColorFormat): string[] {
  const data: BrandingResult = {
    url: 'https://example.test',
    extractedAt: '2026-08-05T00:00:00.000Z',
    colors: COLORS,
    typography: { styles: [], sources: {} },
    spacing: { scaleType: 'unknown', commonValues: [] },
    borderRadius: { values: [] },
    borders: { combinations: [] },
    shadows: [],
    components: { buttons: [], inputs: [], links: [], badges: [] },
    breakpoints: [],
    iconSystem: [],
    frameworks: [],
  };
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    displayResults(data, colorFormat ? { colorFormat } : {});
  } finally {
    console.log = original;
  }
  // Strip ANSI so assertions read the plain text.
  return lines.map((l) => l.replace(/\[[0-9;]*m/g, ''));
}

const colorLines = (lines: string[]) => lines.filter((l) => l.includes('●'));

test('default rendering is hex', () => {
  const lines = colorLines(render());
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('#1a73e8'), lines[0]);
  assert.ok(lines[1].includes('#ffd230'), lines[1]);
});

test('oklch rendering replaces the primary column, not the row set', () => {
  const lines = colorLines(render('oklch'));
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('oklch(57.37% 0.195 257.86)'), lines[0]);
  assert.ok(lines[1].includes('oklch(87.81% 0.169 91.86)'), lines[1]);
});

test('lch rendering uses the precomputed lch on each entry', () => {
  const lines = colorLines(render('lch'));
  assert.ok(lines[0].includes('lch(48.77% 68.14 278.17)'), lines[0]);
  assert.ok(lines[1].includes('lch(86.32% 78.47 85.7)'), lines[1]);
});

test('rgb rendering swaps the secondary column to hex so no notation repeats', () => {
  const lines = colorLines(render('rgb'));
  assert.ok(lines[0].includes('rgb(26, 115, 232)'), lines[0]);
  assert.ok(lines[0].includes('#1a73e8'), lines[0]);
  // rgb must not be printed twice on the same row.
  assert.equal(lines[0].split('rgb(26, 115, 232)').length - 1, 1, lines[0]);
});

test('source rendering prefers the authored declaration over a computed value', () => {
  // The semantic primary and --brand collapse to the same hex, but only the
  // custom property carries the author's notation, so it must win the merge.
  const lines = colorLines(render('source'));
  assert.ok(lines[0].includes('oklch(57.37% 0.195 257.86)'), lines[0]);
  assert.ok(lines[0].includes('primary'), lines[0]);
  assert.ok(lines[0].includes('--brand'), lines[0]);
});

test('source falls back to hex for entries with no authored notation', () => {
  const lines = colorLines(render('source'));
  // The palette entry was only ever a computed rgb string; it degrades to that
  // rather than printing an empty column.
  assert.ok(/rgb\(255, 210, 48\)|#ffd230/.test(lines[1]), lines[1]);
});

test('every format yields the same row count and the same labels', () => {
  const formats: ColorFormat[] = ['hex', 'rgb', 'oklch', 'lch', 'source'];
  const rows = formats.map((f) => colorLines(render(f)));
  for (const r of rows) assert.equal(r.length, rows[0].length);
  for (const r of rows) {
    assert.ok(r[0].includes('primary'), r[0]);
    assert.ok(r[1].includes('accent'), r[1]);
  }
});

test('the label column stays aligned regardless of notation width', () => {
  for (const f of ['hex', 'oklch', 'lch', 'source'] as ColorFormat[]) {
    const lines = colorLines(render(f));
    const at = lines.map((l) => l.indexOf('primary') >= 0 ? l.indexOf('primary') : l.indexOf('accent'));
    assert.equal(at[0], at[1], `${f}: label columns at ${at.join(' vs ')}`);
  }
});

test('an unknown format degrades to hex instead of printing undefined', () => {
  const lines = colorLines(render('hsl' as ColorFormat));
  assert.ok(lines[0].includes('#1a73e8'), lines[0]);
  assert.ok(!lines[0].includes('undefined'), lines[0]);
});

test('rendering never mutates the extraction payload', () => {
  // The flag is presentational, so the JSON that drift and the ML features read
  // must be byte-identical before and after any render.
  const formats: ColorFormat[] = ['hex', 'rgb', 'oklch', 'lch', 'source'];
  for (const f of formats) {
    const before = JSON.stringify(COLORS);
    render(f);
    assert.equal(JSON.stringify(COLORS), before, `${f} mutated the payload`);
  }
});

test('derived hover states follow the selected notation', () => {
  const withHover: Colors = {
    ...COLORS,
    palette: [{ ...COLORS.palette[0], role: 'accent', hover: '#6f7e89' }],
  };
  const original = COLORS.palette;
  try {
    (COLORS as Colors).palette = withHover.palette;
    const oklch = colorLines(render('oklch')).find((l) => l.includes('hover:'));
    assert.ok(oklch, 'no hover row rendered');
    assert.ok(oklch.includes('hover:oklch('), oklch);
    // 'source' has no authored form for a derived value, so it degrades to hex
    // rather than inventing provenance.
    const src = colorLines(render('source')).find((l) => l.includes('hover:'));
    assert.ok(src && src.includes('hover:#6f7e89'), String(src));
  } finally {
    (COLORS as Colors).palette = original;
  }
});
