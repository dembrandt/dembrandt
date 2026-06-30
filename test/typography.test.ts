import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVariableAxes, parseOpenTypeFeatures, pickBodyFamily } from '../lib/extractors/typography.js';

/**
 * The typography extractor reads computed styles in the browser, but the
 * variable-axis and OpenType parsing is pure Node and exported, so it is tested
 * directly with synthetic font-variation-settings / font-feature-settings
 * strings — no page required.
 */

test('parseVariableAxes folds settings into per-axis ranges, widest wins', () => {
  const axes = parseVariableAxes(['"wght" 400', '"wght" 700, "slnt" -4', '"wght" 600']);
  const wght = axes.find(a => a.axis === 'wght')!;
  assert.equal(wght.min, 400);
  assert.equal(wght.max, 700);
  assert.equal(wght.count, 3);
  const slnt = axes.find(a => a.axis === 'slnt')!;
  assert.equal(slnt.min, -4);
  assert.equal(slnt.max, -4);
});

test('parseVariableAxes sorts by usage count', () => {
  const axes = parseVariableAxes(['"wght" 400', '"wght" 500', '"opsz" 14']);
  assert.equal(axes[0].axis, 'wght');
});

test('parseVariableAxes returns nothing when no explicit settings exist', () => {
  assert.deepEqual(parseVariableAxes([]), []);
});

test('parseOpenTypeFeatures dedupes and sorts enabled tags', () => {
  const f = parseOpenTypeFeatures(['"ss01" on, "calt" 1', '"ss01"', '"liga"']);
  assert.deepEqual(f, ['calt', 'liga', 'ss01']);
});

test('parseOpenTypeFeatures excludes features explicitly switched off', () => {
  const f = parseOpenTypeFeatures(['"ss01" on, "tnum" off', '"kern" 0']);
  assert.deepEqual(f, ['ss01']);
});

test('pickBodyFamily trusts the body base font when text renders in it', () => {
  // Apple case: large lead paragraphs (Display) out-volume the 17px copy (Text)
  // in the body bucket, but body's inherited base font is the canonical answer
  // and real text uses it, so it wins despite lower coverage.
  assert.equal(pickBodyFamily('SF Pro Text', { 'SF Pro Display': 5000, 'SF Pro Text': 400 }), 'SF Pro Text');
});

test('pickBodyFamily ignores the UA-default serif even when a sliver of text uses it', () => {
  // NYT case: <body> sets no font-family -> UA default "Times". A little
  // unstyled text renders in Times, but the real body font is the most-used
  // custom family, not the browser default.
  assert.equal(pickBodyFamily('Times', { 'nyt-franklin': 4000, Times: 200 }), 'nyt-franklin');
});

test('pickBodyFamily falls back to highest body-text coverage when body has no family', () => {
  assert.equal(pickBodyFamily(null, { 'SF Pro Text': 5000, fontIvoryLl: 120 }), 'SF Pro Text');
  assert.equal(pickBodyFamily('', { Inter: 100, Roboto: 50 }), 'Inter');
});

test('pickBodyFamily uses the body base as last resort when no text was measured', () => {
  assert.equal(pickBodyFamily('Georgia', {}), 'Georgia');
});

test('pickBodyFamily breaks coverage ties on first-seen for determinism', () => {
  assert.equal(pickBodyFamily(null, { Inter: 100, Roboto: 100 }), 'Inter');
});

test('pickBodyFamily returns null when neither signal yields a family', () => {
  assert.equal(pickBodyFamily(null, {}), null);
  assert.equal(pickBodyFamily('', { Inter: 0 }), null);
});
