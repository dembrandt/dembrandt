import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDrift } from '../lib/drift.js';

/**
 * Low-confidence tokens are single-use, margin-of-detection elements the
 * extractor is unsure about; they surface inconsistently between two
 * extractions of the same design. computeDrift must ignore them so they never
 * produce phantom drift.
 */

function fixture(overrides: any = {}): any {
  return {
    url: 'https://example.com/',
    extractedAt: 't',
    colors: { palette: [{ normalized: '#133174', count: 40, confidence: 'high' }], semantic: { primary: '#133174' }, cssVariables: {} },
    typography: { styles: [], sources: {} },
    spacing: { scaleType: 'base-8', commonValues: [] },
    borderRadius: { values: [] },
    borders: {}, shadows: [],
    components: { buttons: [], inputs: [], links: [], badges: [] },
    breakpoints: [], iconSystem: [], frameworks: [],
    ...overrides,
  };
}

test('a low-confidence shadow present in one extraction but not the other is not drift', () => {
  const withShadow = fixture({
    shadows: [{ shadow: 'rgb(128, 128, 128) 0px 0px 5px 0px', count: 1, confidence: 'low' }],
  });
  const without = fixture({ shadows: [] });

  const report = computeDrift(withShadow, without);
  assert.equal(report.status, 'stable');
  assert.equal(report.summary.removed, 0);
  assert.equal(report.changes.filter((c) => c.category === 'shadow').length, 0);
});

test('a low-confidence radius present in one extraction but not the other is not drift', () => {
  const withRadius = fixture({
    borderRadius: { values: [{ value: '2px', count: 1, confidence: 'low' }] },
  });
  const without = fixture({ borderRadius: { values: [] } });

  const report = computeDrift(withRadius, without);
  assert.equal(report.status, 'stable');
  assert.equal(report.changes.filter((c) => c.category === 'radius').length, 0);
});

test('a high-confidence radius change is still real drift', () => {
  const base = fixture({
    borderRadius: { values: [{ value: '4px', count: 20, confidence: 'high' }] },
  });
  const changed = fixture({
    borderRadius: { values: [{ value: '12px', count: 20, confidence: 'high' }] },
  });

  const report = computeDrift(base, changed);
  assert.ok(report.changes.some((c) => c.category === 'radius'), 'high-confidence radius change must be reported');
});
