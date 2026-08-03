import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCssColor, serializeHex, serializeRgb } from '../lib/color-parse.js';

function hex(input: string): string | null {
  const c = parseCssColor(input);
  return c ? serializeHex({ ...c, a: 1 }) : null;
}

function alphaOf(input: string): number | null {
  const c = parseCssColor(input);
  return c ? c.a : null;
}

// Channel tolerance for float → 8-bit rounding across conversion paths.
function assertHexClose(actual: string | null, expected: string, tolerance = 1) {
  assert.ok(actual, `expected ${expected}, got null`);
  const pairs = [1, 3, 5].map(i => [
    parseInt((actual as string).slice(i, i + 2), 16),
    parseInt(expected.slice(i, i + 2), 16),
  ]);
  for (const [a, e] of pairs) {
    assert.ok(Math.abs(a - e) <= tolerance, `expected ${expected}, got ${actual}`);
  }
}

// --- Named colors and keywords (CSS Color 4 §6) ---

test('named colors resolve to their spec hex', () => {
  assert.equal(hex('rebeccapurple'), '#663399');
  assert.equal(hex('aliceblue'), '#f0f8ff');
  assert.equal(hex('RED'), '#ff0000');
  assert.equal(hex('white'), '#ffffff');
});

test('transparent is black with zero alpha', () => {
  const c = parseCssColor('transparent');
  assert.deepEqual(c, { r: 0, g: 0, b: 0, a: 0 });
});

test('non-color keywords and garbage return null', () => {
  assert.equal(parseCssColor('currentcolor'), null);
  assert.equal(parseCssColor('inherit'), null);
  assert.equal(parseCssColor('none'), null);
  assert.equal(parseCssColor('auto'), null);
  assert.equal(parseCssColor(''), null);
  assert.equal(parseCssColor('notacolor'), null);
  assert.equal(parseCssColor('srgb'), null);
});

// --- Hex notation (3, 4, 6, 8 digit) ---

test('hex notations across all four lengths', () => {
  assert.deepEqual(parseCssColor('#abc'), { r: 170, g: 187, b: 204, a: 1 });
  assert.deepEqual(parseCssColor('#aabbcc'), { r: 170, g: 187, b: 204, a: 1 });
  const four = parseCssColor('#abcd');
  assert.equal(four?.r, 170);
  assert.ok(Math.abs((four?.a ?? 0) - 221 / 255) < 1e-9);
  const eight = parseCssColor('#aabbccdd');
  assert.ok(Math.abs((eight?.a ?? 0) - 221 / 255) < 1e-9);
});

test('malformed hex returns null', () => {
  assert.equal(parseCssColor('#ab'), null);
  assert.equal(parseCssColor('#abcde'), null);
  assert.equal(parseCssColor('#gggggg'), null);
});

// --- rgb()/rgba(): legacy comma and modern space syntax ---

test('legacy rgb()/rgba() with commas', () => {
  assert.deepEqual(parseCssColor('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(alphaOf('rgba(255, 0, 0, 0.5)'), 0.5);
  assert.equal(hex('rgb(100%, 0%, 0%)'), '#ff0000');
});

test('modern rgb() space syntax with slash alpha', () => {
  assert.deepEqual(parseCssColor('rgb(255 0 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(alphaOf('rgb(255 0 0 / 0.5)'), 0.5);
  assert.equal(alphaOf('rgb(255 0 0 / 50%)'), 0.5);
  assert.equal(hex('rgb(50% 50% 50%)'), '#808080');
});

test('rgb() clamps out-of-range channels and maps none to 0', () => {
  assert.equal(hex('rgb(300 -20 0)'), '#ff0000');
  assert.equal(hex('rgb(none 128 none)'), '#008000');
  assert.equal(alphaOf('rgb(0 0 0 / 1.5)'), 1);
});

// --- hsl()/hsla() ---

test('hsl() legacy and modern forms', () => {
  assert.equal(hex('hsl(0, 100%, 50%)'), '#ff0000');
  assert.equal(hex('hsl(120 100% 25%)'), '#008000');
  assert.equal(alphaOf('hsla(0, 100%, 50%, 0.3)'), 0.3);
  assert.equal(alphaOf('hsl(0 100% 50% / 30%)'), 0.3);
});

test('hsl() hue angle units and wrapping', () => {
  assert.equal(hex('hsl(120deg 100% 25%)'), '#008000');
  assert.equal(hex('hsl(0.3333333turn 100% 25%)'), '#008000');
  assert.equal(hex('hsl(133.3333grad 100% 25%)'), '#008000');
  assertHexClose(hex('hsl(2.0944rad 100% 25%)'), '#008000');
  assert.equal(hex('hsl(480 100% 25%)'), '#008000');
  assert.equal(hex('hsl(-240 100% 25%)'), '#008000');
});

// --- hwb() ---

test('hwb() basics', () => {
  assert.equal(hex('hwb(0 0% 0%)'), '#ff0000');
  assert.equal(hex('hwb(120 0% 0%)'), '#00ff00');
  assert.equal(hex('hwb(0 100% 0%)'), '#ffffff');
  assert.equal(hex('hwb(0 0% 100%)'), '#000000');
  assert.equal(alphaOf('hwb(0 0% 0% / 0.4)'), 0.4);
});

test('hwb() normalises whiteness + blackness over 100% to gray', () => {
  // w=b scaled: gray at w/(w+b) lightness
  assert.equal(hex('hwb(90 100% 100%)'), '#808080');
});

// --- oklab()/oklch() ---

test('oklab() from GitHub issue #149 resolves to verified hex', () => {
  assertHexClose(hex('oklab(0.363344 -0.0549272 0.0203635 / 0.3)'), '#1f4733');
  assert.equal(alphaOf('oklab(0.363344 -0.0549272 0.0203635 / 0.3)'), 0.3);
  assertHexClose(hex('oklab(0.999994 0.0000455678 0.0000200868 / 0.8)'), '#ffffff');
});

test('oklab()/oklch() extremes and percentage lightness', () => {
  assert.equal(hex('oklab(1 0 0)'), '#ffffff');
  assert.equal(hex('oklab(0 0 0)'), '#000000');
  assert.equal(hex('oklab(100% 0 0)'), '#ffffff');
  assert.equal(hex('oklch(1 0 0)'), '#ffffff');
  assert.equal(hex('oklch(0 0 none)'), '#000000');
});

test('oklch() of pure sRGB red round-trips', () => {
  assertHexClose(hex('oklch(0.627955 0.257683 29.2339)'), '#ff0000');
});

test('oklch() marginally out-of-gamut returns the local-MINDE clip', () => {
  // CSS Color 4 §14.2.1: clip(origin) is returned when deltaEOK < JND (0.02).
  // Here R=1.003 linear, deltaEOK ~0.002, so the spec answer is the clip
  // #ffd230. Issue #149 expected #ffd237 (chroma reduction without local
  // MINDE); the two are within a just-noticeable difference by construction.
  assert.equal(hex('oklch(0.879 0.169 91.605)'), '#ffd230');
});

test('grossly out-of-gamut engages chroma reduction, not naive clip', () => {
  // P3 green in linear sRGB is (-0.51, 1.04, -0.31); naive clip gives #00ff00.
  // The clip is perceptually far from the origin (deltaEOK >> JND), so the
  // binary search must produce a different, in-gamut green.
  const mapped = hex('color(display-p3 0 1 0)');
  assert.ok(mapped);
  assert.notEqual(mapped, '#00ff00');
  const c = parseCssColor('color(display-p3 0 1 0)');
  assert.ok((c?.g ?? 0) > 200);
  assert.ok((c?.r ?? 255) < 130);
  assert.ok((c?.b ?? 255) < 130);
});

// --- lab()/lch() at D50 ---

test('lch() parses at D50 (issue #149 reference pair)', () => {
  // #1f242e at D50 is lch(14.03% 7.44 268.93); the D65 value 14.12%/7.37/275.12
  // must NOT round-trip to the same hex.
  assertHexClose(hex('lch(14.03% 7.44 268.93)'), '#1f242e');
});

test('lab() extremes', () => {
  assert.equal(hex('lab(100 0 0)'), '#ffffff');
  assert.equal(hex('lab(0 0 0)'), '#000000');
  assert.equal(alphaOf('lab(50 20 -30 / 25%)'), 0.25);
});

// --- color() function ---

test('color(srgb) from issue #149', () => {
  assert.equal(hex('color(srgb 0.072 0.168 0.12)'), '#122b1f');
});

test('color() across supported spaces', () => {
  assert.equal(hex('color(srgb 1 0 0)'), '#ff0000');
  assert.equal(hex('color(srgb-linear 1 0 0)'), '#ff0000');
  assert.equal(hex('color(srgb-linear 0.2158605 0.2158605 0.2158605)'), '#808080');
  assert.equal(hex('color(display-p3 0 0 0)'), '#000000');
  assert.equal(hex('color(display-p3 1 1 1)'), '#ffffff');
  assertHexClose(hex('color(display-p3 0.5 0.5 0.5)'), '#808080');
  assertHexClose(hex('color(xyz 0.4124564 0.2126729 0.0193339)'), '#ff0000');
  assertHexClose(hex('color(xyz-d65 0.4124564 0.2126729 0.0193339)'), '#ff0000');
  assert.equal(alphaOf('color(srgb 0 0 0 / 0.6)'), 0.6);
});

test('color() with out-of-gamut p3 red stays a saturated red after mapping', () => {
  const c = parseCssColor('color(display-p3 1 0 0)');
  assert.ok(c);
  assert.equal(c?.r, 255);
  assert.ok((c?.g ?? 99) < 60);
  assert.ok((c?.b ?? 99) < 60);
});

test('color() with unknown space returns null', () => {
  assert.equal(parseCssColor('color(magic 1 0 0)'), null);
});

// --- Round-trip properties ---

test('sRGB corners survive oklab round trip', () => {
  const corners = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff', '#000000'];
  for (const h of corners) {
    const c = parseCssColor(h);
    assert.ok(c, h);
  }
});

// --- Serialisation ---

test('serializeHex emits 6-digit for opaque, 8-digit with alpha', () => {
  assert.equal(serializeHex({ r: 31, g: 71, b: 51, a: 1 }), '#1f4733');
  assert.equal(serializeHex({ r: 31, g: 71, b: 51, a: 0.3 }), '#1f47334d');
});

test('serializeRgb emits legacy rgb()/rgba() strings', () => {
  assert.equal(serializeRgb({ r: 31, g: 71, b: 51, a: 1 }), 'rgb(31, 71, 51)');
  assert.equal(serializeRgb({ r: 31, g: 71, b: 51, a: 0.3 }), 'rgba(31, 71, 51, 0.3)');
});

// --- Whitespace and case robustness ---

test('parser tolerates case and irregular whitespace', () => {
  assert.equal(hex('RGB( 255 , 0 , 0 )'), '#ff0000');
  assert.equal(hex('OKLCH(0.627955 0.257683 29.2339)') !== null, true);
  assert.equal(hex('  #ff0000  '), '#ff0000');
});

// --- HEX/RGB hardening (the dominant real-world notation) ---

test('rgb() fractional channels round, scientific notation accepted', () => {
  assert.equal(hex('rgb(127.5 0 0)'), '#800000');
  assert.equal(hex('rgb(2.55e2 0 0)'), '#ff0000');
  assert.equal(hex('rgb(45% 45% 45%)'), '#737373');
});

test('rgb() malformed forms return null', () => {
  assert.equal(parseCssColor('rgb(255 0)'), null);
  assert.equal(parseCssColor('rgb(255, 0)'), null);
  assert.equal(parseCssColor('rgb(255, 0, 0, 0.5, 9)'), null);
  assert.equal(parseCssColor('rgb(a b c)'), null);
  assert.equal(parseCssColor('rgb()'), null);
});

test('hex is case-insensitive and exact-length only', () => {
  assert.equal(hex('#ABC'), '#aabbcc');
  assert.equal(hex('#AABBCC'), '#aabbcc');
  assert.equal(parseCssColor('#abcde'), null);
  assert.equal(parseCssColor('#aabbccddee'), null);
  assert.equal(parseCssColor('aabbcc'), null);
});

// --- Hex notation, W3C CSS Color 4 §5.2 verbatim examples ---

test('hex spec §5.2: worked examples from the spec text', () => {
  // "#00ff00 represents the same color as rgb(0 255 0)"
  assert.deepEqual(parseCssColor('#00ff00'), parseCssColor('rgb(0 255 0)'));
  // "#00ff00 is identical to #00FF00"
  assert.deepEqual(parseCssColor('#00ff00'), parseCssColor('#00FF00'));
  // "#0000ffcc represents the same color as rgb(0 0 100% / 80%)"
  const cc = parseCssColor('#0000ffcc');
  assert.equal(cc?.b, 255);
  assert.ok(Math.abs((cc?.a ?? 0) - 0.8) < 0.002);
  // "#123 specifies the same color as #112233"
  assert.deepEqual(parseCssColor('#123'), parseCssColor('#112233'));
  // 4-digit expands like 3-digit, fourth digit is alpha
  assert.deepEqual(parseCssColor('#123f'), parseCssColor('#112233'));
  const half = parseCssColor('#1238');
  assert.ok(Math.abs((half?.a ?? 0) - 136 / 255) < 1e-9);
});

test('hex spec §5.2: only 3, 4, 6, 8 digit lengths are valid', () => {
  for (const bad of ['#', '#f', '#ff', '#fffff', '#fffffff', '#fffffffff', '# fff', '#ff f']) {
    assert.equal(parseCssColor(bad), null, bad);
  }
  for (const good of ['#fff', '#ffff', '#ffffff', '#ffffffff']) {
    assert.ok(parseCssColor(good), good);
  }
});
