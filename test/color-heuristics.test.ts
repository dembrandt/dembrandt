import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTEXT_SCORES,
  STATUS_CONTEXT_SOURCE,
  statusContextRegex,
  saturationFromHex,
  classifyStructural,
} from '../lib/extractors/color-heuristics.js';

// These guard the recall-vs-precision tuning for card / section / input / badge
// colours. The classifier decides whether a colour is brand identity or page
// chrome; getting it wrong drops real brand colours (low recall) or floods the
// palette with layout greys (low precision).

test('CONTEXT_SCORES keeps brand tiers above content surfaces', () => {
  assert.equal(CONTEXT_SCORES.logo, 5);
  assert.equal(CONTEXT_SCORES.brand, 5);
  // content surfaces added, but below the brand/cta tiers
  for (const k of ['card', 'section', 'feature', 'panel', 'input', 'badge', 'chip']) {
    assert.equal(CONTEXT_SCORES[k], 2, `${k} should be weight 2`);
    assert.ok(CONTEXT_SCORES[k] < CONTEXT_SCORES.cta);
  }
});

test('badge is no longer a status context; real status words still match', () => {
  const re = statusContextRegex();
  assert.equal(re.test('badge new-pill'), false);
  assert.equal(re.test('notification-dot'), true);
  assert.equal(re.test('alert-banner'), true);
  assert.equal(re.test('text-red-600'), true);
  assert.ok(!STATUS_CONTEXT_SOURCE.includes('badge'));
});

test('saturationFromHex: 0 for grey/black/invalid, high for vivid', () => {
  assert.equal(saturationFromHex('#000000'), 0);
  assert.equal(saturationFromHex('#808080'), 0);
  assert.equal(saturationFromHex('not-a-hex'), 0);
  assert.equal(saturationFromHex(''), 0);
  assert.equal(saturationFromHex(null as unknown as string), 0);
  assert.ok(saturationFromHex('#ff0000') > 0.9);
  assert.ok(saturationFromHex('#28d9e0') > 0.5); // a real missed brand cyan
});

test('tokens are never structural', () => {
  assert.equal(
    classifyStructural({ count: 9999, score: 0, bgCount: 0, isToken: true, normalizedHex: '#cccccc' }, 10000),
    false,
  );
});

test('transparent is structural', () => {
  assert.equal(
    classifyStructural({ count: 1, score: 1, bgCount: 0, normalizedHex: '#000000', isTransparent: true }, 100),
    true,
  );
});

test('near-neutral high-usage low-intent colour is structural', () => {
  // a grey covering 60% of elements with no brand intent
  assert.equal(
    classifyStructural({ count: 600, score: 600, bgCount: 600, normalizedHex: '#f2f2f2' }, 1000),
    true,
  );
});

test('saturated high-usage colour (brand fill) is NOT structural', () => {
  // a vivid brand section covering 60% of elements — must survive
  assert.equal(
    classifyStructural({ count: 600, score: 600, bgCount: 600, normalizedHex: '#542087' }, 1000),
    false,
  );
});

test('saturated incidental decoration (no bg, low intent) is structural', () => {
  assert.equal(
    classifyStructural({ count: 10, score: 10, bgCount: 0, normalizedHex: '#bf1dba' }, 1000),
    true,
  );
});

test('saturated colour used as a background survives (card/section fill)', () => {
  // same vivid colour but seen as a background at least once
  assert.equal(
    classifyStructural({ count: 10, score: 10, bgCount: 3, normalizedHex: '#bf1dba' }, 1000),
    false,
  );
});

test('high brand intent overrides structural drop', () => {
  // a CTA-scored colour: score well above count -> kept even if not a bg
  assert.equal(
    classifyStructural({ count: 10, score: 250, bgCount: 0, normalizedHex: '#bf1dba' }, 1000),
    false,
  );
});

test('malformed hex never throws and is treated as neutral (saturation 0)', () => {
  // zero totalElements must not divide-by-zero or throw
  assert.doesNotThrow(() =>
    classifyStructural({ count: 1, score: 1, bgCount: 0, normalizedHex: 'rgba(0,0,0,0.01)' }, 0),
  );
  // neutral (unparseable -> saturation 0), low usage, not a bg -> neither rule fires
  assert.equal(
    classifyStructural({ count: 1, score: 1, bgCount: 0, normalizedHex: 'garbage' }, 1000),
    false,
  );
  // same neutral colour at high usage with low intent IS structural
  assert.equal(
    classifyStructural({ count: 600, score: 600, bgCount: 600, normalizedHex: 'garbage' }, 1000),
    true,
  );
});
