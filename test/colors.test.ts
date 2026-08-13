import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hexToRgb, relativeLuminance, computeWcag, convertColor, deltaE, deltaE2000 } from '../lib/colors.js';
import { capConfidenceByUsage } from '../lib/extractors/colors.js';

test('hexToRgb parses 6, 3, and 8 digit hex', () => {
  assert.deepEqual(hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('#abc'), { r: 170, g: 187, b: 204 });
  const withAlpha = hexToRgb('#ff000080');
  assert.equal(withAlpha.r, 255);
  assert.ok(Math.abs(withAlpha.a - 128 / 255) < 1e-9);
});

test('hexToRgb returns null for non-hex or malformed input', () => {
  assert.equal(hexToRgb('rgb(0,0,0)'), null);
  assert.equal(hexToRgb('#ff'), null);
  assert.equal(hexToRgb(''), null);
});

test('relativeLuminance bounds: white ~1, black 0, invalid null', () => {
  assert.ok(Math.abs(relativeLuminance('#ffffff') - 1) < 1e-6);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('not-a-color'), null);
});

test('deltaE (CIE76): 0 for identical, 999 for unparseable', () => {
  assert.equal(deltaE('#ff0000', '#ff0000'), 0);
  assert.equal(deltaE('garbage', '#fff'), 999);
});

test('deltaE2000: 0 identical, small for tiny shift, large for opposite hues', () => {
  assert.equal(deltaE2000('#ff0000', '#ff0000'), 0);
  assert.ok(deltaE2000('#ff0000', '#fe0000') < 1);
  assert.ok(deltaE2000('#ff0000', '#0000ff') > 40);
});

test('deltaE2000 accepts rgb() input and matches hex', () => {
  assert.equal(deltaE2000('rgb(255,0,0)', '#ff0000'), 0);
});

test('deltaE2000 returns 100 when a color cannot be parsed', () => {
  assert.equal(deltaE2000('garbage', '#ffffff'), 100);
});

test('computeWcag: black on white is 21:1 and passes AA + AAA', () => {
  const pairs = computeWcag([
    { normalized: '#000000' },
    { normalized: '#ffffff' },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].ratio, 21);
  assert.equal(pairs[0].aa, true);
  assert.equal(pairs[0].aaa, true);
  assert.equal(pairs[0].fg, '#ffffff'); // lighter is foreground here
  assert.equal(pairs[0].bg, '#000000');
});

test('computeWcag ignores non-hex palette entries', () => {
  const pairs = computeWcag([
    { normalized: '#000000' },
    { normalized: 'rgb(255,255,255)' }, // filtered: not hex
  ]);
  assert.equal(pairs.length, 0);
});

test('convertColor normalizes rgb, hsl, and hex to lowercase hex', () => {
  assert.equal(convertColor('rgb(255,0,0)').hex, '#ff0000');
  assert.equal(convertColor('hsl(0, 100%, 50%)').hex, '#ff0000');
  assert.equal(convertColor('#ABC').hex, '#aabbcc');
});

test('convertColor flags alpha and returns null for junk', () => {
  assert.equal(convertColor('rgba(0, 0, 0, 0.5)').hasAlpha, true);
  assert.equal(convertColor('not-a-color'), null);
});

test('convertColor parses modern colour functions (GitHub #149)', () => {
  const scrim = convertColor('oklab(0.363344 -0.0549272 0.0203635 / 0.3)');
  assert.equal(scrim.hex, '#1f4733');
  assert.equal(scrim.hasAlpha, true);
  const wide = convertColor('color(srgb 0.072 0.168 0.12)');
  assert.equal(wide.hex, '#122b1f');
  const amber = convertColor('oklch(0.879 0.169 91.605)');
  assert.equal(amber.hex, '#ffd230');
});

test('emitted lch() is D50 as the CSS spec requires (GitHub #149)', () => {
  // Issue reference: #1f242e is lch(14.03% 7.44 268.93) at D50;
  // the old D65 output was lch(14.12% 7.37 275.12).
  const c = convertColor('#1f242e');
  const m = c.lch.match(/^lch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
  assert.ok(m, c.lch);
  assert.ok(Math.abs(parseFloat(m[1]) - 14.03) < 0.05, c.lch);
  assert.ok(Math.abs(parseFloat(m[2]) - 7.44) < 0.05, c.lch);
  assert.ok(Math.abs(parseFloat(m[3]) - 268.93) < 0.1, c.lch);
});

// Confidence is a claim about brand identity. The palette scored context only,
// so one hero element could present as a brand colour; spacing and radii have
// gated on usage from the start.

test('capConfidenceByUsage refuses high confidence to a colour seen once', () => {
  assert.equal(capConfidenceByUsage('high', 1), 'low');
  assert.equal(capConfidenceByUsage('high', 2), 'medium');
  assert.equal(capConfidenceByUsage('high', 3), 'high');
  assert.equal(capConfidenceByUsage('high', 900), 'high');
});

test('capConfidenceByUsage demotes a single-occurrence medium', () => {
  assert.equal(capConfidenceByUsage('medium', 1), 'low');
  assert.equal(capConfidenceByUsage('medium', 2), 'medium');
});

test('capConfidenceByUsage never promotes, and never throws on a missing count', () => {
  assert.equal(capConfidenceByUsage('low', 900), 'low');
  assert.equal(capConfidenceByUsage('high', undefined), 'low');
});
