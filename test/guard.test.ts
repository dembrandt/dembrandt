/**
 * Fault isolation contract: a single throwing extractor degrades to its fallback
 * and records { stage, reason }; it never rejects the surrounding Promise.all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardExtractor } from '../lib/extractors/guard.js';
import type { ExtractorError } from '../lib/types.js';

test('passes through the resolved value and records no error', async () => {
  const sink: ExtractorError[] = [];
  const out = await guardExtractor('colors', Promise.resolve({ palette: [1, 2] }), { palette: [] }, sink);
  assert.deepEqual(out, { palette: [1, 2] });
  assert.equal(sink.length, 0);
});

test('returns the fallback and records { stage, reason } on rejection', async () => {
  const sink: ExtractorError[] = [];
  const out = await guardExtractor('typography', Promise.reject(new Error('boom')), { styles: [] }, sink);
  assert.deepEqual(out, { styles: [] });
  assert.deepEqual(sink, [{ stage: 'typography', reason: 'boom' }]);
});

test('stringifies a non-Error throw value into reason', async () => {
  const sink: ExtractorError[] = [];
  await guardExtractor('shadows', Promise.reject('plain string'), [], sink);
  await guardExtractor('badges', Promise.reject(42), { all: [] }, sink);
  assert.deepEqual(sink.map((e) => e.reason), ['plain string', '42']);
});

test('one rejecting extractor does not abort Promise.all of guarded peers', async () => {
  const sink: ExtractorError[] = [];
  const results = await Promise.all([
    guardExtractor('a', Promise.resolve('ok-a'), 'fb-a', sink),
    guardExtractor('b', Promise.reject(new Error('b failed')), 'fb-b', sink),
    guardExtractor('c', Promise.resolve('ok-c'), 'fb-c', sink),
  ]);
  // Promise.all resolves (never rejects); only b degraded to its fallback.
  assert.deepEqual(results, ['ok-a', 'fb-b', 'ok-c']);
  assert.deepEqual(sink, [{ stage: 'b', reason: 'b failed' }]);
});

test('independent failures accumulate in order into the shared sink', async () => {
  const sink: ExtractorError[] = [];
  await Promise.all([
    guardExtractor('x', Promise.reject(new Error('x')), null, sink),
    guardExtractor('y', Promise.reject(new Error('y')), null, sink),
  ]);
  assert.deepEqual(sink.map((e) => e.stage).sort(), ['x', 'y']);
  assert.equal(sink.length, 2);
});
