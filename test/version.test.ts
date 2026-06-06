/**
 * Locks the output version contract: the three independent version axes and the
 * DTCG $extensions key shape that consumers (dembrandt-next, MCP, skills, drift)
 * depend on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDembrandtProvenance,
  checkSchemaCompatibility,
  formatCompatibilityNotice,
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

test('compatibility compares the schema contract, not the churning tool version', () => {
  // The exact bug behind "unknown vs v0.14.0": a refactor-only release bumps the
  // tool version but leaves the contract alone. Must read as fully compatible.
  const current = checkSchemaCompatibility({
    meta: { schemaVersion: SCHEMA_VERSION, dembrandtVersion: '99.0.0' },
  });
  assert.strictEqual(current.status, 'current');
  assert.strictEqual(current.compatible, true);
  assert.strictEqual(formatCompatibilityNotice(current), null);

  // Same major, additive minor/patch drift either direction stays compatible.
  const minorDrift = checkSchemaCompatibility({ meta: { schemaVersion: '1.4.2' } });
  assert.strictEqual(minorDrift.status, 'compatible');
  assert.strictEqual(minorDrift.compatible, true);
  assert.strictEqual(formatCompatibilityNotice(minorDrift), null);
});

test('compatibility flags breaking major drift in both directions', () => {
  const outdated = checkSchemaCompatibility({ meta: { schemaVersion: '0.9.0' } });
  assert.strictEqual(outdated.status, 'outdated');
  assert.strictEqual(outdated.compatible, false);
  assert.match(formatCompatibilityNotice(outdated)!, /Re-extract recommended/);

  const ahead = checkSchemaCompatibility({ meta: { schemaVersion: '2.0.0' } });
  assert.strictEqual(ahead.status, 'ahead');
  assert.strictEqual(ahead.compatible, false);
  assert.match(formatCompatibilityNotice(ahead)!, /Upgrade dembrandt/);
});

test('compatibility degrades legacy and unknown extractions without throwing', () => {
  // Pre-1.0 tallenne: has a tool version, no schemaVersion. This is the case the
  // old viewer mislabelled "unknown vs v0.14.0".
  const legacy = checkSchemaCompatibility({ meta: { dembrandtVersion: '0.14.0' } });
  assert.strictEqual(legacy.status, 'legacy');
  assert.strictEqual(legacy.compatible, false);
  assert.strictEqual(legacy.found, null);
  assert.match(legacy.message!, /v0\.14\.0/);

  const unknown = checkSchemaCompatibility({});
  assert.strictEqual(unknown.status, 'unknown');
  assert.strictEqual(unknown.compatible, false);
  assert.strictEqual(unknown.toolVersion, null);

  // Malformed version string must not throw; falls back to unknown/legacy.
  const garbage = checkSchemaCompatibility({ meta: { schemaVersion: 'not-a-version' } });
  assert.strictEqual(garbage.compatible, false);
});
