import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDrift, DEFAULT_DRIFT_CONFIG } from '../lib/drift.js';

function extract({ palette = [], styles = [], spacing = [], radius = [], shadows = [] } = {}) {
  return {
    colors: { palette },
    typography: { styles },
    spacing: { commonValues: spacing.map((px) => ({ px })) },
    borderRadius: { values: radius.map((value) => ({ value })) },
    shadows: shadows.map((shadow) => ({ shadow })),
  };
}

test('identical extracts score 0 and are stable', () => {
  const e = extract({ palette: [{ normalized: '#ff0000', role: 'brand', count: 10 }] });
  const r = computeDrift(e, e);
  assert.equal(r.score, 0);
  assert.equal(r.status, 'stable');
});

test('report has the documented shape', () => {
  const r = computeDrift(extract(), extract());
  for (const key of ['score', 'status', 'threshold', 'summary']) {
    assert.ok(key in r, `report should include ${key}`);
  }
  assert.ok(Array.isArray(r.categories));
  assert.ok(Array.isArray(r.changes));
});

test('a near-identical color (below colorSame) is not a change', () => {
  const base = extract({ palette: [{ normalized: '#ff0000', role: 'brand', count: 5 }] });
  const cand = extract({ palette: [{ normalized: '#fe0000', role: 'brand', count: 5 }] });
  const r = computeDrift(base, cand);
  assert.equal(r.changes.filter((c) => c.category === 'color').length, 0);
});

test('role weighting: losing a brand color drifts more than losing a background color', () => {
  const base = extract({
    palette: [
      { normalized: '#ff0000', role: 'brand', count: 5 },
      { normalized: '#0000ff', role: 'background', count: 5 },
    ],
  });
  const brandGone = extract({ palette: [{ normalized: '#0000ff', role: 'background', count: 5 }] });
  const bgGone = extract({ palette: [{ normalized: '#ff0000', role: 'brand', count: 5 }] });
  assert.ok(computeDrift(base, brandGone).score > computeDrift(base, bgGone).score);
});

test('ignore.colors=true zeroes the color category', () => {
  const base = extract({ palette: [{ normalized: '#ff0000', role: 'brand', count: 5 }] });
  const cand = extract({ palette: [{ normalized: '#00ff00', role: 'brand', count: 5 }] });
  const r = computeDrift(base, cand, { ignore: { colors: true } });
  assert.equal(r.score, 0);
  assert.equal(r.changes.filter((c) => c.category === 'color').length, 0);
});

test('ignore.colors list filters specific values from both sides', () => {
  const base = extract({
    palette: [
      { normalized: '#ffffff', role: 'background', count: 5 },
      { normalized: '#ff0000', role: 'brand', count: 5 },
    ],
  });
  const cand = extract({ palette: [{ normalized: '#ff0000', role: 'brand', count: 5 }] });
  const r = computeDrift(base, cand, { ignore: { colors: ['#ffffff'] } });
  assert.equal(r.score, 0);
});

test('failThreshold decides the drift/stable verdict for the same score', () => {
  const base = extract({
    palette: [
      { normalized: '#ff0000', role: 'brand', count: 5 },
      { normalized: '#0000ff', role: 'background', count: 5 },
    ],
  });
  const cand = extract({ palette: [{ normalized: '#0000ff', role: 'background', count: 5 }] });
  assert.equal(computeDrift(base, cand, { failThreshold: 95 }).status, 'stable');
  assert.equal(computeDrift(base, cand, { failThreshold: 50 }).status, 'drift');
});

test('empty categories do not dilute the score: a real change crosses the default threshold', () => {
  // A site with only color + typography data. Removing the brand color must not
  // be averaged toward 0 by absent spacing/radius/shadow categories.
  const base = extract({
    palette: [{ normalized: '#ff0000', role: 'brand', count: 5 }],
    styles: [{ context: 'h1', family: 'Inter', size: '32px', weight: '700' }],
  });
  const cand = extract({
    palette: [{ normalized: '#00ff00', role: 'brand', count: 5 }], // brand color replaced
    styles: [{ context: 'h1', family: 'Inter', size: '32px', weight: '700' }],
  });
  const report = computeDrift(base, cand); // default failThreshold 10
  assert.equal(report.status, 'drift');
  assert.ok(report.score > 10, `expected score > 10, got ${report.score}`);
});

test('spacing: small change within dimPct is not flagged', () => {
  const r = computeDrift(extract({ spacing: ['16px'] }), extract({ spacing: ['16.4px'] }));
  assert.equal(r.changes.filter((c) => c.category === 'spacing').length, 0);
});

test('spacing: mid change lands in the changed band', () => {
  const r = computeDrift(extract({ spacing: ['16px'] }), extract({ spacing: ['17.6px'] }));
  const ch = r.changes.find((c) => c.category === 'spacing');
  assert.equal(ch.kind, 'changed');
});

test('spacing: large change is removed plus added', () => {
  const r = computeDrift(extract({ spacing: ['16px'] }), extract({ spacing: ['30px'] }));
  const kinds = r.changes.filter((c) => c.category === 'spacing').map((c) => c.kind);
  assert.ok(kinds.includes('removed'));
  assert.ok(kinds.includes('added'));
});

test('typography: changing the family for a context is a change', () => {
  const base = extract({ styles: [{ context: 'h1', family: 'Inter', size: '32px', weight: '700' }] });
  const cand = extract({ styles: [{ context: 'h1', family: 'Roboto', size: '32px', weight: '700' }] });
  const ch = computeDrift(base, cand).changes.find((c) => c.category === 'typography');
  assert.equal(ch.kind, 'changed');
});

test('typography: dropping a context is a removal', () => {
  const base = extract({ styles: [{ context: 'h1', family: 'Inter', size: '32px', weight: '700' }] });
  const ch = computeDrift(base, extract({ styles: [] })).changes.find((c) => c.category === 'typography');
  assert.equal(ch.kind, 'removed');
});

test('a single big type change is not buried by many unchanged styles', () => {
  // 11 styles, one heading size doubled. The mean over 11 styles would hide it;
  // the worst-change floor must keep it above the default threshold.
  const styles = (heroSize) => [
    { context: 'display', family: 'Inter', size: heroSize, weight: '700' },
    ...Array.from({ length: 10 }, (_, i) => ({ context: `body-${i}`, family: 'Inter', size: '16px', weight: '400' })),
  ];
  const report = computeDrift(
    extract({ styles: styles('64px') }),
    extract({ styles: styles('128px') }),
  );
  assert.equal(report.status, 'drift');
  assert.ok(report.score > 10, `expected score > 10, got ${report.score}`);
});

test('type-change severity is monotonic in magnitude', () => {
  const base = extract({ styles: [{ context: 'display', family: 'Inter', size: '64px', weight: '700' }] });
  const small = computeDrift(base, extract({ styles: [{ context: 'display', family: 'Inter', size: '70px', weight: '700' }] })).score;
  const large = computeDrift(base, extract({ styles: [{ context: 'display', family: 'Inter', size: '128px', weight: '700' }] })).score;
  assert.ok(large > small, `expected large(${large}) > small(${small})`);
});

test('DEFAULT_DRIFT_CONFIG carries weights and a fail threshold', () => {
  assert.ok(DEFAULT_DRIFT_CONFIG.weights);
  assert.equal(typeof DEFAULT_DRIFT_CONFIG.failThreshold, 'number');
});
