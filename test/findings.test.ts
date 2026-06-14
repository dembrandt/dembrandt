import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFindings } from '../lib/findings.js';

/**
 * computeFindings is the single source of truth behind the report's summary
 * scores. These pin the four honest checks and the derived consistency score —
 * every gauge number must trace back to a finding here.
 */

function base(overrides: any = {}): any {
  return {
    url: 'https://example.com/',
    colors: { palette: [{ normalized: '#133174', confidence: 'high', count: 40 }], semantic: { primary: '#133174' } },
    typography: { styles: [{ context: 'body', size: '16px (1rem)', weight: 400 }] },
    spacing: { scaleType: 'base-8', commonValues: [{ px: 16, display: '16px' }] },
    borderRadius: { values: [{ value: '8px' }] },
    shadows: [{ shadow: '0 1px 2px rgba(0,0,0,.1)' }],
    breakpoints: [{ px: 768 }],
    ...overrides,
  };
}

test('a clean extraction yields no findings and a perfect consistency score', () => {
  const fr = computeFindings(base());
  assert.equal(fr.findings.length, 0);
  assert.equal(fr.consistency, 100);
  assert.deepEqual(fr.coverage, { present: 6, total: 6 });
});

test('perceptually identical palette colours are flagged as a duplicate token', () => {
  const fr = computeFindings(base({
    colors: { palette: [{ normalized: '#133174' }, { normalized: '#133074' }], semantic: {} },
  }));
  const dup = fr.findings.filter((f) => f.category === 'duplication');
  assert.equal(dup.length, 1);
  assert.match(dup[0].message, /perceptually identical/);
  assert.equal(fr.consistency, 94); // one warn = -6
});

test('two roles sharing size + weight are flagged as no-hierarchy', () => {
  const fr = computeFindings(base({
    typography: { styles: [
      { context: 'heading-2', size: '40px (2.5rem)', weight: 700 },
      { context: 'body', size: '40px (2.5rem)', weight: 700 },
    ] },
  }));
  const c = fr.findings.filter((f) => f.category === 'consistency');
  assert.equal(c.length, 1);
  assert.match(c[0].message, /no visual hierarchy/);
});

test('a light primary that fails AA on white is flagged (warn)', () => {
  // #9aa0ff is bright enough to fall below 4.5:1 on white.
  const fr = computeFindings(base({
    colors: { palette: [{ normalized: '#9aa0ff' }], semantic: { primary: '#9aa0ff' } },
  }));
  const contrast = fr.findings.filter((f) => f.category === 'contrast');
  assert.equal(contrast.length, 1);
  assert.equal(contrast[0].severity, 'warn');
  assert.match(contrast[0].message, /low contrast on white/);
});

test('a dark primary that clears AA on white produces no contrast finding', () => {
  const fr = computeFindings(base({ colors: { palette: [], semantic: { primary: '#133174' } } }));
  assert.equal(fr.findings.filter((f) => f.category === 'contrast').length, 0);
});

test('rgb() primary is parsed for the white-contrast check', () => {
  const fr = computeFindings(base({ colors: { palette: [], semantic: { primary: 'rgb(154,160,255)' } } }));
  assert.equal(fr.findings.filter((f) => f.category === 'contrast').length, 1);
});

test('spacing values off the detected base grid are flagged', () => {
  const fr = computeFindings(base({
    spacing: { scaleType: 'base-8', commonValues: [{ px: 16 }, { px: 13 }, { px: 24 }] },
  }));
  const c = fr.findings.filter((f) => f.message.includes('spacing grid'));
  assert.equal(c.length, 1);
  assert.match(c[0].message, /13px/);
});

test('coverage counts only the token categories actually present', () => {
  const fr = computeFindings(base({ shadows: [], breakpoints: [] }));
  assert.equal(fr.coverage.present, 4);
});
