import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageEntry, scopeOf, summarizeCoverage } from '../lib/coverage.js';

/**
 * Coverage is what separates a design system from one page's improvisation, so
 * the scope rule and the score have to be counted from page provenance alone,
 * never from usage on a single page.
 */

test('a token on every page is site-wide, one page only is page-local', () => {
  assert.equal(scopeOf(4, 4), 'site');
  assert.equal(scopeOf(2, 4), 'section');
  assert.equal(scopeOf(1, 4), 'page');
});

test('a single-page crawl carries no coverage signal, so nothing is an outlier', () => {
  assert.equal(scopeOf(1, 1), 'site');
  assert.equal(summarizeCoverage([coverageEntry('color', '#fff', 1, 1)], 1), null);
});

test('page count is bounded by the crawl, so coverage never exceeds 1', () => {
  const entry = coverageEntry('color', '#fff', 9, 3);
  assert.equal(entry.pages, 3);
  assert.equal(entry.coverage, 1);
});

test('a token missing from a page is not counted as site-wide', () => {
  assert.equal(coverageEntry('shadow', '0 1px 2px', 3, 4).scope, 'section');
});

test('the score is the mean of family means, not of all tokens', () => {
  // 10 site-wide colours and 1 page-local radius. Token-averaging would report
  // ~95; family-averaging reports the radius family's failure at full weight.
  const entries = [
    ...Array.from({ length: 10 }, (_, i) => coverageEntry('color', `#00000${i}`, 4, 4)),
    coverageEntry('radius', '3px', 1, 4),
  ];
  const summary = summarizeCoverage(entries, 4)!;
  assert.equal(summary.score, 63);
  assert.equal(summary.byFamily.color.meanCoverage, 1);
  assert.equal(summary.byFamily.radius.pageLocal, 1);
});

test('outliers are the page-local tokens, in a stable order', () => {
  const summary = summarizeCoverage([
    coverageEntry('shadow', '0 1px 2px', 1, 3),
    coverageEntry('color', '#abcdef', 1, 3),
    coverageEntry('color', '#111111', 3, 3),
  ], 3)!;
  assert.deepEqual(summary.outliers.map(o => o.token), ['#abcdef', '0 1px 2px']);
});
