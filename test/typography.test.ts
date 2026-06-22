import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVariableAxes, parseOpenTypeFeatures } from '../lib/extractors/typography.js';

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
