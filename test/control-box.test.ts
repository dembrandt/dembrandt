import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlBox, CONTROL_BOX_SOURCE } from '../lib/extractors/control-box.js';

const computed = (over: Record<string, string> = {}) => ({
  boxSizing: 'border-box', lineHeight: '20px', minHeight: 'auto', fontSize: '14px',
  paddingTop: '8px', paddingBottom: '8px', borderTopWidth: '1px', borderBottomWidth: '1px', ...over,
});

test('reports the rendered height rounded, with the box-model fields the height rule reads', () => {
  assert.deepEqual(controlBox(computed(), 38.4), {
    height: 38, boxSizing: 'border-box', lineHeight: '20px', minHeight: 'auto', derivedHeight: 38,
  });
});

test('a set height shows as rendered and derived disagreeing', () => {
  const box = controlBox(computed({ minHeight: '44px' }), 44);
  assert.equal(box?.height, 44);
  assert.equal(box?.derivedHeight, 38);
  assert.equal(box?.minHeight, '44px');
});

test('line-height normal is approximated from the font size', () => {
  assert.equal(controlBox(computed({ lineHeight: 'normal', fontSize: '16px' }), 40)?.derivedHeight, Math.round(19.2 + 18));
});

test('missing or malformed values never throw and fall back to defaults', () => {
  assert.equal(controlBox(null, 0), null);
  assert.equal(controlBox(computed(), NaN), null);
  assert.deepEqual(controlBox({ lineHeight: 'abc', fontSize: null }, 30), {
    height: 30, boxSizing: 'content-box', lineHeight: 'abc', minHeight: 'auto', derivedHeight: null,
  });
});

test('the serialized twin re-hydrates to the same function', () => {
  const twin = new Function(CONTROL_BOX_SOURCE + '\nreturn controlBox;')();
  assert.deepEqual(twin(computed(), 38.4), controlBox(computed(), 38.4));
  assert.doesNotMatch(CONTROL_BOX_SOURCE, /\b(require|import|exports)\b/);
});
