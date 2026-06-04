import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hexToRgb, relativeLuminance, computeWcag, convertColor, deltaE, deltaE2000 } from '../lib/colors.js';

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
