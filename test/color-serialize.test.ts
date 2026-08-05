import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rgbToLch, rgbToOklch, formatLch, formatOklch, convertColor, formatColor, isColorFormat, COLOR_FORMATS } from '../lib/colors.js';
import { parseCssColor } from '../lib/color-parse.js';

// Pins the serialisation half of the colour engine: rgbToLch / rgbToOklch and
// their CSS formatters. Parsing is covered by color-parse.test.ts; these are the
// emitters a --color-format flag would select between, so their current output
// is fixed here before anything is wired on top of it.

test('rgbToOklch: sRGB red matches the reference OKLCH triple', () => {
  const red = rgbToOklch(255, 0, 0);
  assert.ok(Math.abs(red.l - 0.62796) < 1e-4, String(red.l));
  assert.ok(Math.abs(red.c - 0.25768) < 1e-4, String(red.c));
  assert.ok(Math.abs(red.h - 29.2339) < 1e-3, String(red.h));
});

test('rgbToOklch: white is L=1 C=0, black is all zero', () => {
  const white = rgbToOklch(255, 255, 255);
  assert.ok(Math.abs(white.l - 1) < 1e-6, String(white.l));
  assert.ok(white.c < 1e-6, String(white.c));

  assert.deepEqual(rgbToOklch(0, 0, 0), { l: 0, c: 0, h: 0 });
});

test('rgbToOklch: mid grey is achromatic with a residual float hue', () => {
  // Documented quirk, not a defect: atan2 on denormal a/b yields a stable but
  // meaningless hue for neutrals. Harmless because chroma rounds to 0, so the
  // emitted string is oklch(59.99% 0 89.88) and the hue channel is inert.
  const grey = rgbToOklch(128, 128, 128);
  assert.ok(grey.c < 1e-6, String(grey.c));
  assert.equal(formatOklch(grey), 'oklch(59.99% 0 89.88)');
});

test('formatOklch: lightness as percent, chroma to 3dp, hue to 2dp', () => {
  assert.equal(formatOklch({ l: 0.6279553606, c: 0.2576833077, h: 29.2338851 }), 'oklch(62.8% 0.258 29.23)');
  assert.equal(formatOklch({ l: 0.8781060522, c: 0.1687623350, h: 91.8567430 }), 'oklch(87.81% 0.169 91.86)');
});

test('formatOklch: alpha emitted only below 1', () => {
  const red = rgbToOklch(255, 0, 0);
  assert.equal(formatOklch(red, 0.5), 'oklch(62.8% 0.258 29.23 / 0.5)');
  assert.equal(formatOklch(red, 1), 'oklch(62.8% 0.258 29.23)');
  assert.equal(formatOklch(red), 'oklch(62.8% 0.258 29.23)');
});

test('formatLch: alpha emitted only below 1', () => {
  const red = rgbToLch(255, 0, 0);
  assert.equal(formatLch(red, 0.5), 'lch(54.29% 106.85 40.86 / 0.5)');
  assert.equal(formatLch(red, 1), 'lch(54.29% 106.85 40.86)');
});

test('rgbToLch: black and white anchor the L axis', () => {
  const black = rgbToLch(0, 0, 0);
  assert.ok(Math.abs(black.l) < 1e-6, String(black.l));
  const white = rgbToLch(255, 255, 255);
  assert.ok(Math.abs(white.l - 100) < 1e-3, String(white.l));
  assert.ok(white.c < 0.05, String(white.c));
});

test('emitted oklch() re-parses to within 3 channel steps of the source', () => {
  // Rounding in formatOklch (L 2dp, C 3dp) is lossy: a serialise/parse cycle can
  // shift a channel by up to 3/255. Pinned as a bound, because it is the reason
  // hex must stay the identity key even when oklch is the emitted form.
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    const r = (i * 97) % 256, g = (i * 53) % 256, b = (i * 29) % 256;
    const back = parseCssColor(formatOklch(rgbToOklch(r, g, b)));
    assert.ok(back, `unparseable at ${r},${g},${b}`);
    worst = Math.max(worst, Math.abs(back.r - r), Math.abs(back.g - g), Math.abs(back.b - b));
  }
  assert.ok(worst <= 3, `max channel drift ${worst}`);
});

test('emitted lch() re-parses to within 3 channel steps of the source', () => {
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    const r = (i * 89) % 256, g = (i * 41) % 256, b = (i * 17) % 256;
    const back = parseCssColor(formatLch(rgbToLch(r, g, b)));
    assert.ok(back, `unparseable at ${r},${g},${b}`);
    worst = Math.max(worst, Math.abs(back.r - r), Math.abs(back.g - g), Math.abs(back.b - b));
  }
  assert.ok(worst <= 3, `max channel drift ${worst}`);
});

test('convertColor emits all four notations for one input', () => {
  const c = convertColor('#1a73e8');
  assert.equal(c.hex, '#1a73e8');
  assert.equal(c.rgb, 'rgb(26, 115, 232)');
  assert.equal(c.oklch, 'oklch(57.37% 0.195 257.86)');
  assert.equal(c.lch, 'lch(48.77% 68.14 278.17)');
  assert.equal(c.hasAlpha, false);
});

test('convertColor carries alpha into every notation', () => {
  const c = convertColor('rgba(26, 115, 232, 0.4)');
  assert.equal(c.hex, '#1a73e8');
  assert.equal(c.rgb, 'rgba(26, 115, 232, 0.4)');
  assert.equal(c.oklch, 'oklch(57.37% 0.195 257.86 / 0.4)');
  assert.equal(c.lch, 'lch(48.77% 68.14 278.17 / 0.4)');
  assert.equal(c.hasAlpha, true);
});

test('convertColor: hex is alpha-stripped, so hex and rgb disagree on transparency', () => {
  // The hex field is the opaque identity used for dedup and drift; alpha lives
  // only in the rgb/lch/oklch forms and in hasAlpha.
  const c = convertColor('rgba(255, 0, 0, 0.25)');
  assert.equal(c.hex, '#ff0000');
  assert.equal(c.rgb, 'rgba(255, 0, 0, 0.25)');
  assert.equal(c.hasAlpha, true);
});

test('convertColor: notation of the input does not change the output', () => {
  const forms = ['#ff0000', 'red', 'rgb(255 0 0)', 'hsl(0 100% 50%)', 'oklch(62.8% 0.258 29.23)'];
  const emitted = forms.map((f) => convertColor(f));
  for (const c of emitted) {
    assert.ok(c, 'parse failed');
    assert.equal(c.hex, '#ff0000');
  }
  // Every input notation collapses to one identity, which is what lets a format
  // flag stay purely presentational.
  assert.equal(new Set(emitted.map((c) => c.oklch)).size, 1);
});

test('convertColor returns null rather than a partial record', () => {
  assert.equal(convertColor('currentcolor'), null);
  assert.equal(convertColor('var(--brand)'), null);
  assert.equal(convertColor(''), null);
});

test('formatColor renders each notation from one input', () => {
  assert.equal(formatColor('#1a73e8', 'hex'), '#1a73e8');
  assert.equal(formatColor('#1a73e8', 'rgb'), 'rgb(26, 115, 232)');
  assert.equal(formatColor('#1a73e8', 'oklch'), 'oklch(57.37% 0.195 257.86)');
  assert.equal(formatColor('#1a73e8', 'lch'), 'lch(48.77% 68.14 278.17)');
});

test('formatColor defaults to hex', () => {
  assert.equal(formatColor('rgb(26, 115, 232)'), '#1a73e8');
});

test('formatColor source returns the authored string untouched', () => {
  // Provenance mode: no parse, no normalisation, no gamut mapping. This is what
  // preserves a declared token like --brand: oklch(...) exactly as written.
  assert.equal(formatColor('oklch(57.37% 0.195 257.86)', 'source'), 'oklch(57.37% 0.195 257.86)');
  assert.equal(formatColor('#ABC', 'source'), '#ABC');
  assert.equal(formatColor('var(--brand)', 'source'), 'var(--brand)');
});

test('formatColor returns unparseable input verbatim instead of dropping it', () => {
  assert.equal(formatColor('currentcolor', 'oklch'), 'currentcolor');
  assert.equal(formatColor('var(--brand)', 'hex'), 'var(--brand)');
});

test('formatColor preserves alpha in every computed notation', () => {
  assert.equal(formatColor('rgba(26, 115, 232, 0.4)', 'rgb'), 'rgba(26, 115, 232, 0.4)');
  assert.equal(formatColor('rgba(26, 115, 232, 0.4)', 'oklch'), 'oklch(57.37% 0.195 257.86 / 0.4)');
  // hex is the opaque identity, so alpha is intentionally dropped there.
  assert.equal(formatColor('rgba(26, 115, 232, 0.4)', 'hex'), '#1a73e8');
});

test('every declared format is renderable and distinct where it should be', () => {
  const rendered = COLOR_FORMATS.map((f) => formatColor('#1a73e8', f));
  assert.equal(rendered.length, 5);
  for (const r of rendered) assert.ok(typeof r === 'string' && r.length > 0);
  // source and hex coincide only because the input was already hex.
  assert.equal(new Set(rendered).size, 4);
});

test('isColorFormat gates the CLI value', () => {
  for (const f of COLOR_FORMATS) assert.equal(isColorFormat(f), true);
  assert.equal(isColorFormat('HEX'), false);
  assert.equal(isColorFormat('hsl'), false);
  assert.equal(isColorFormat(''), false);
});
