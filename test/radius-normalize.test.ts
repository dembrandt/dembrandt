import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRadius, normalizeRadiusValues, PILL_RADIUS } from '../lib/radius-normalize.js';

const entry = (value: string, count: number, elements: string[] = []) => ({
  value,
  count,
  elements,
  confidence: 'low',
  numericValue: parseFloat(value) || 0,
});

test('normalizeRadius: the computed maximum length reads as a pill', () => {
  assert.equal(normalizeRadius('3.35544e+07px'), PILL_RADIUS);
  assert.equal(normalizeRadius('33554400px'), PILL_RADIUS);
  assert.equal(normalizeRadius('9999px'), PILL_RADIUS);
});

test('normalizeRadius: real scale steps pass through untouched', () => {
  for (const value of ['0px', '4px', '6px', '128px', '999px', '0.5rem']) {
    assert.equal(normalizeRadius(value), value);
  }
});

test('normalizeRadius: percentages are a different shape and are left alone', () => {
  assert.equal(normalizeRadius('50%'), '50%');
  assert.equal(normalizeRadius('50% 50% 0 0'), '50% 50% 0 0');
});

test('normalizeRadius: a multi-corner radius keeps its shape', () => {
  assert.equal(normalizeRadius('3.35544e+07px 3.35544e+07px 0px 0px'), '9999px 9999px 0px 0px');
});

test('normalizeRadius: malformed input degrades to itself rather than throwing', () => {
  assert.equal(normalizeRadius(''), '');
  assert.equal(normalizeRadius(undefined as unknown as string), '');
  assert.equal(normalizeRadius('inherit'), 'inherit');
});

test('normalizeRadiusValues: values that collapse to the same pill are merged', () => {
  const out = normalizeRadiusValues([
    entry('3.35544e+07px', 300, ['a', 'span']),
    entry('9999px', 89, ['button']),
    entry('6px', 12, ['card']),
  ]);

  assert.equal(out.length, 2);
  const pill = out.find((v) => v.value === PILL_RADIUS)!;
  assert.equal(pill.count, 389);
  assert.deepEqual(pill.elements.sort(), ['a', 'button', 'span']);
  assert.equal(pill.confidence, 'high');
  assert.equal(pill.numericValue, 9999);
});

test('normalizeRadiusValues: the pill no longer outranks the real scale by 33 million', () => {
  const out = normalizeRadiusValues([entry('3.35544e+07px', 300), entry('6px', 12), entry('50%', 4)]);
  assert.deepEqual(out.map((v) => v.value), ['6px', PILL_RADIUS, '50%']);
});

test('normalizeRadiusValues: an empty or missing list is not an error', () => {
  assert.deepEqual(normalizeRadiusValues([]), []);
  assert.deepEqual(normalizeRadiusValues(undefined as unknown as []), []);
});
