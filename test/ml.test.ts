import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predictPrimary, scorePalette, modelMeta } from '../lib/ml/runtime.js';

const MINIMAL_EXTRACTION = {
  url: 'https://example.com',
  colors: {
    palette: [
      { normalized: '#ff5416', count: 80, confidence: 'high', sources: ['button', 'cta'] },
      { normalized: '#ffffff', count: 400, confidence: 'high', sources: ['bg'] },
      { normalized: '#1a1a1a', count: 200, confidence: 'high', sources: ['text'] },
    ],
  },
};

test('modelMeta returns featureVersion and metrics', () => {
  const meta = modelMeta();
  assert.ok(meta !== null, 'meta.json must be loadable');
  assert.ok(typeof meta!.featureVersion === 'number', 'featureVersion must be a number');
  assert.ok(Array.isArray(meta!.featureNames), 'featureNames must be an array');
  assert.ok(meta!.featureNames.length > 0, 'featureNames must not be empty');
});

test('predictPrimary returns hex and score for a normal extraction', async () => {
  const result = await predictPrimary(MINIMAL_EXTRACTION as any);
  assert.ok(result !== null, 'should return a prediction');
  assert.match(result!.hex, /^#[0-9a-f]{6}$/, 'hex must be 6-char lowercase');
  assert.ok(result!.score >= 0 && result!.score <= 1, 'score must be in [0,1]');
});

test('predictPrimary does not throw on empty palette', async () => {
  const result = await predictPrimary({ colors: { palette: [] } } as any);
  assert.equal(result, null, 'empty palette should return null');
});

test('predictPrimary does not throw on missing colors', async () => {
  const result = await predictPrimary({} as any);
  assert.equal(result, null, 'missing colors should return null');
});

test('predictPrimary does not throw on null input', async () => {
  const result = await predictPrimary(null as any);
  assert.equal(result, null, 'null input should return null');
});

test('scorePalette returns all candidates sorted best-first', async () => {
  const scored = await scorePalette(MINIMAL_EXTRACTION as any);
  assert.ok(scored.length === 3, 'should score all palette entries');
  // scores are sorted descending
  for (let i = 0; i < scored.length - 1; i++) {
    assert.ok(scored[i].score >= scored[i + 1].score, 'scores must be sorted descending');
  }
  // every entry has a valid hex
  for (const c of scored) {
    assert.match(c.hex, /^#[0-9a-f]{6}$/);
  }
});

test('predictPrimary prefers chromatic over white/black', async () => {
  const result = await predictPrimary(MINIMAL_EXTRACTION as any);
  // #ff5416 is the only chromatic color — model should prefer it
  assert.equal(result!.hex, '#ff5416', 'should pick the chromatic brand color');
});
