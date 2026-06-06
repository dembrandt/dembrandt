/**
 * Locks the output version contract: the three independent version axes and the
 * DTCG $extensions key shape that consumers (dembrandt-next, MCP, skills, drift)
 * depend on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDembrandtProvenance,
  SCHEMA_VERSION,
  EXTENSION_KEY,
  DTCG_SPEC_VERSION,
} from '../lib/version.js';

test('buildDembrandtProvenance carries the three version axes', () => {
  const ext = buildDembrandtProvenance({
    url: 'https://www.acme.com/pricing',
    extractedAt: '2026-01-01T00:00:00.000Z',
    meta: { dembrandtVersion: '9.9.9' },
  });
  assert.strictEqual(ext.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(ext.toolVersion, '9.9.9');
  assert.strictEqual(ext.specVersion, DTCG_SPEC_VERSION);
  assert.strictEqual(ext.generator, 'dembrandt');
  assert.strictEqual(ext.source.domain, 'acme.com');
  assert.strictEqual(ext.source.url, 'https://www.acme.com/pricing');
});

test('EXTENSION_KEY is reverse-domain; SCHEMA_VERSION is semver', () => {
  assert.strictEqual(EXTENSION_KEY, 'com.dembrandt');
  assert.match(SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
});

test('missing tool version degrades to null and domain to "unknown", never throws', () => {
  const ext = buildDembrandtProvenance({});
  assert.strictEqual(ext.toolVersion, null);
  assert.strictEqual(ext.source.domain, 'unknown');
  assert.strictEqual(ext.source.url, null);
});
