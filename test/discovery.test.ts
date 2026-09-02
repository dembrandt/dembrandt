import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computePagesRequested } from '../lib/discovery.js';

test('computePagesRequested: explicit paths count the homepage plus each path', () => {
  assert.equal(
    computePagesRequested({ hasExplicitPaths: true, explicitPathCount: 3, isSitemap: false, sitemapMax: null, crawlN: null }),
    4,
  );
});

test('computePagesRequested: sitemap without --crawl reports the 20-page default plus the homepage', () => {
  assert.equal(
    computePagesRequested({ hasExplicitPaths: false, explicitPathCount: 0, isSitemap: true, sitemapMax: 20, crawlN: null }),
    21,
  );
});

test('computePagesRequested: sitemap combined with --crawl N reports sitemapMax + 1, not crawlN', () => {
  assert.equal(
    computePagesRequested({ hasExplicitPaths: false, explicitPathCount: 0, isSitemap: true, sitemapMax: 4, crawlN: 5 }),
    5,
  );
});

test('computePagesRequested: auto-crawl reports crawlN directly', () => {
  assert.equal(
    computePagesRequested({ hasExplicitPaths: false, explicitPathCount: 0, isSitemap: false, sitemapMax: null, crawlN: 5 }),
    5,
  );
});

test('computePagesRequested: no technique matched falls back to null', () => {
  assert.equal(
    computePagesRequested({ hasExplicitPaths: false, explicitPathCount: 0, isSitemap: false, sitemapMax: null, crawlN: null }),
    null,
  );
});
