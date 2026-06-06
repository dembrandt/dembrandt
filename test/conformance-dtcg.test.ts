/**
 * Conformance gate: dembrandt's own --dtcg output MUST validate against the
 * in-core DTCG validator. This is the test that would have caught the typography
 * composite bug (sub-fields wrapped as {$type,$value} instead of raw values).
 * Fixture is inline and deterministic — no network, no playwright.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDtcgTokens } from '../lib/formatters/dtcg.js';
import { validateTokensObject } from '../lib/dtcg/validate.js';

// Minimal native extraction exercising every token category the DTCG exporter emits.
const fixture: any = {
  url: 'https://www.example.com/',
  extractedAt: '2026-01-01T00:00:00.000Z',
  meta: { dembrandtVersion: '0.16.0' },
  colors: {
    semantic: { primary: '#0066cc', secondary: '#ff6600' },
    palette: [
      { color: '#0066cc', normalized: '#0066cc', count: 50, confidence: 'high' },
      { color: '#ffffff', normalized: '#ffffff', count: 100, confidence: 'high' },
      { color: '#111111', normalized: '#111111', count: 30, confidence: 'medium' },
    ],
  },
  typography: {
    styles: [
      // full set of sub-fields
      { context: 'heading', family: 'Inter', size: '32px', weight: 700, lineHeight: '1.2', letterSpacing: '-0.5px' },
      // missing lineHeight/letterSpacing -> CSS-normal defaults (1.5, 0px)
      { context: 'body', family: 'Inter', size: '16px', weight: 400 },
      // "%" size -> token must be skipped, not emitted invalid
      { context: 'fluid', family: 'Inter', size: '5vw', weight: 400 },
    ],
  },
  spacing: { commonValues: [{ px: '8px' }, { px: '16px' }, '24px'] },
  // 50% pill radius must be dropped (no valid px/rem form), 4px kept
  borderRadius: { values: [{ value: '4px', confidence: 'high' }, { value: '50%', confidence: 'high' }] },
  borders: { combinations: [{ width: '1px', color: '#cccccc', confidence: 'high' }] },
  shadows: [{ shadow: '0px 2px 4px 0px #000000', confidence: 'high' }],
};

test('dembrandt --dtcg output passes the in-core DTCG validator (conformance gate)', () => {
  const dtcg = toDtcgTokens(fixture);
  const res = validateTokensObject(dtcg);
  assert.ok(res.valid, 'DTCG output is invalid:\n' + (res.errors || []).join('\n'));
});

test('document-level $extensions carries the version contract', () => {
  const dtcg = toDtcgTokens(fixture);
  const ext = dtcg.$extensions['com.dembrandt'];
  assert.strictEqual(ext.schemaVersion, '1.0.0');
  assert.strictEqual(ext.toolVersion, '0.16.0');
  assert.strictEqual(ext.source.domain, 'example.com');
});

test('typography sub-fields are raw values, not nested {$type,$value} tokens', () => {
  const dtcg = toDtcgTokens(fixture);
  const v = dtcg.typography.style['text-heading'].$value;
  assert.strictEqual(typeof v.fontWeight, 'number');
  assert.strictEqual(typeof v.lineHeight, 'number');
  assert.ok(v.fontSize && v.fontSize.value === 32 && v.fontSize.unit === 'px', 'fontSize is a raw dimension');
  // the "%" / vw size style must not have produced a token
  assert.strictEqual(dtcg.typography.style['text-fluid'], undefined);
});

test('inexpressible dimensions are dropped, not emitted invalid', () => {
  const dtcg = toDtcgTokens(fixture);
  // 50% radius dropped: only the 4px radius remains
  const radii = Object.values(dtcg.radius || {}) as any[];
  assert.ok(radii.every((r) => r.$value.unit === 'px' || r.$value.unit === 'rem'));
});
