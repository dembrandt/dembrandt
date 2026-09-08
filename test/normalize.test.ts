/**
 * Ingest hardening: transients never persist, and loose unions canonicalize so
 * the drift engine never compares a string weight against a number weight.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripTransient, normalizeExtraction } from '../lib/normalize.js';

const base: any = {
  url: 'https://x.com/',
  extractedAt: '2026-01-01T00:00:00.000Z',
  meta: { dembrandtVersion: '0.16.0', schemaVersion: '1.0.0' },
  colors: { palette: [], semantic: {}, cssVariables: {} },
  typography: {
    styles: [{ context: 'body', family: 'Inter', size: '16px', weight: '700' }],
    sources: { adobeFonts: false },
  },
  spacing: { scaleType: 'base-8', commonValues: [{ px: '16px' }, { px: 24 }] },
  borderRadius: { values: [] },
  borders: {},
  shadows: [],
  components: { buttons: [], inputs: { text: [] }, links: [], badges: { all: [] } },
  breakpoints: [],
  iconSystem: [],
  frameworks: [],
};

test('stripTransient removes internal crawl fields and does not mutate input', () => {
  const input = { ...base, _discoveredLinks: [1], _extractedUrls: [2], _pageResults: [3] };
  const out: any = stripTransient(input);
  assert.strictEqual(out._discoveredLinks, undefined);
  assert.strictEqual(out._extractedUrls, undefined);
  assert.strictEqual(out._pageResults, undefined);
  // input untouched
  assert.deepStrictEqual((input as any)._discoveredLinks, [1]);
});

test('stripTransient drops the extractor scratch set nested under colors', () => {
  // Every snapshot saved before the producer stripped it carries colors._raw,
  // so ingest has to drop it too or stored extractions keep the leak forever.
  const input: any = {
    ...base,
    colors: { semantic: {}, palette: [{ normalized: '#fff' }], cssVariables: [], _raw: [1, 2, 3] },
  };
  const out: any = stripTransient(input);
  assert.strictEqual('_raw' in out.colors, false);
  assert.deepStrictEqual(out.colors.palette, [{ normalized: '#fff' }]);
  // input untouched
  assert.deepStrictEqual(input.colors._raw, [1, 2, 3]);
});

test('stripTransient leaves rawColors alone: it is published output, not scratch', () => {
  const input: any = { ...base, colors: { semantic: {}, palette: [], cssVariables: [], rawColors: [1] } };
  assert.deepStrictEqual(stripTransient(input).colors.rawColors, [1]);
});

test('normalizeExtraction canonicalizes loose unions for diffing', () => {
  const out: any = normalizeExtraction({ ...base, _pageResults: [9] } as any);
  assert.strictEqual(out.typography.styles[0].weight, 700);        // string -> number
  assert.strictEqual(out.spacing.commonValues[0].px, 16);          // "16px" -> 16
  assert.strictEqual(out.spacing.commonValues[1].px, 24);          // already number
  assert.strictEqual(out.spacing.commonValues[0].display, '16px'); // display backfilled
  assert.strictEqual(out.spacing.commonValues[1].display, '24px'); // backfilled from number
  assert.deepStrictEqual(out.typography.sources.adobeFonts, []);   // false -> []
  assert.ok(Array.isArray(out.components.inputs));                 // object -> array
  assert.ok(Array.isArray(out.components.badges));
  assert.strictEqual(out._pageResults, undefined);                // also stripped
});
