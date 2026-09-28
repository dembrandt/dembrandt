import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manifestPrimary } from '../lib/extractors/color-heuristics.js';

const palette = [
  { normalized: '#121212', count: 422 }, { normalized: '#c70000', count: 45 },
  { normalized: '#052962', count: 33 }, { normalized: '#ffe500', count: 26 },
];

test('a painted, chromatic theme_color outranks the most painted section colour', () => {
  assert.equal(manifestPrimary('#052962', '#c70000', palette), '#052962');
});
test('the pick stands when theme_color is neutral, unpainted, or the pick itself', () => {
  assert.equal(manifestPrimary('#ffffff', '#c70000', palette), null);
  assert.equal(manifestPrimary('#121212', '#c70000', palette), null);
  assert.equal(manifestPrimary('#00ff00', '#c70000', palette), null);
  assert.equal(manifestPrimary('#052962', '#052962', palette), null);
  assert.equal(manifestPrimary('#052962', '#c70000', [{ normalized: '#052962', count: 2 }]), null);
  assert.equal(manifestPrimary(null, '#c70000', palette), null);
});
