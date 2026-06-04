import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageSnapshotName } from '../lib/init.js';

// This is the shared contract between init (writes .dembrandt/pages/<name>.yaml)
// and drift --pages (reads it). If the two disagree, per-page drift silently
// fails to find baselines, so lock the mapping.

test('pageSnapshotName maps paths consistently', () => {
  assert.equal(pageSnapshotName('/'), 'index');
  assert.equal(pageSnapshotName('/pricing'), 'pricing');
  assert.equal(pageSnapshotName('/docs/api'), 'docs_api');
  assert.equal(pageSnapshotName('/checkout'), 'checkout');
});

test('pageSnapshotName treats a full URL and its path identically', () => {
  assert.equal(pageSnapshotName('https://example.com/pricing'), pageSnapshotName('/pricing'));
  assert.equal(pageSnapshotName('https://example.com/'), pageSnapshotName('/'));
});

test('pageSnapshotName ignores a trailing slash', () => {
  assert.equal(pageSnapshotName('/checkout/'), 'checkout');
  assert.equal(pageSnapshotName('https://example.com/docs/api/'), 'docs_api');
});

test('pageSnapshotName accepts a bare path without a leading slash', () => {
  assert.equal(pageSnapshotName('pricing'), 'pricing');
});
