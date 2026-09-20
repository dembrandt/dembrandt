/**
 * Identity is the one stated block in the output, so the rules that decide it
 * are the ones that must not drift: scope specificity, per-field precedence, and
 * the refusal to invent a site from a typo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  siteKeyOf,
  matchSite,
  resolveIdentity,
  validateOverrides,
  validateProfilePaths,
  profileFlagMismatch,
  referenceComparability,
  type IdentityConfig,
} from '../lib/identity.js';
import { SCHEMA_VERSION, checkSchemaCompatibility } from '../lib/version.js';

const config: IdentityConfig = {
  brand: 'Acme',
  sites: [
    {
      name: 'marketing',
      id: 'st_1',
      scope: [
        'acme.com',
        { pattern: 'staging.acme.com', environment: 'staging' },
        { pattern: 'acme.de', market: 'de' },
        { pattern: 'acme.fr', market: 'fr' },
      ],
    },
    { name: 'app', id: 'st_2', scope: ['acme.com/app', 'app.acme.com'] },
    { name: 'docs', id: 'st_3', scope: ['*.acme.com'] },
  ],
  profiles: [{ name: 'design', paths: ['/', '/pricing'], flags: { crawl: 5 } }],
};

test('siteKeyOf strips www and survives garbage', () => {
  assert.equal(siteKeyOf('https://www.acme.com/pricing'), 'acme.com');
  assert.equal(siteKeyOf('not a url'), 'unknown');
  assert.equal(siteKeyOf(null), 'unknown');
});

test('a path scope beats a bare host on the same domain', () => {
  assert.equal(matchSite(config, 'https://acme.com/app/settings')?.site.name, 'app');
  assert.equal(matchSite(config, 'https://acme.com/pricing')?.site.name, 'marketing');
});

test('a named subdomain beats a wildcard covering it', () => {
  assert.equal(matchSite(config, 'https://app.acme.com/')?.site.name, 'app');
  assert.equal(matchSite(config, 'https://help.acme.com/')?.site.name, 'docs');
});

test('a path prefix matches only on a segment boundary', () => {
  assert.equal(matchSite(config, 'https://acme.com/application')?.site.name, 'marketing');
});

test('two sites tying at the same specificity are reported, not silently split', () => {
  const ambiguous: IdentityConfig = {
    sites: [
      { name: 'one', scope: ['acme.com'] },
      { name: 'two', scope: ['acme.com'] },
    ],
  };
  const match = matchSite(ambiguous, 'https://acme.com/');
  assert.equal(match?.site.name, 'one');
  assert.deepEqual(match?.ambiguous.map(s => s.name), ['two']);
});

test('no config falls back to the hostname and says so per field', () => {
  const id = resolveIdentity('https://www.acme.com/', {}, null);
  assert.deepEqual(id, {
    brand: null,
    site: 'acme.com',
    market: null,
    environment: 'production',
    profile: null,
    source: { brand: 'unset', site: 'derived', market: 'unset', environment: 'derived' },
    siteId: 'acme.com',
  });
});

test('a country scope entry supplies the market, not the environment', () => {
  const id = resolveIdentity('https://acme.de/', {}, config);
  assert.equal(id.site, 'marketing');
  assert.equal(id.market, 'de');
  assert.equal(id.environment, 'production');
  assert.equal(id.source.market, 'config');
});

test('market and environment are independent coordinates', () => {
  const de: IdentityConfig = {
    sites: [{
      name: 'marketing',
      scope: [{ pattern: 'staging.acme.de', market: 'de', environment: 'staging' }],
    }],
  };
  const id = resolveIdentity('https://staging.acme.de/', {}, de);
  assert.equal(id.market, 'de');
  assert.equal(id.environment, 'staging');
});

test('config supplies brand, site and the stable id', () => {
  const id = resolveIdentity('https://acme.com/app/', {}, config);
  assert.equal(id.site, 'app');
  assert.equal(id.siteId, 'st_2');
  assert.equal(id.brand, 'Acme');
  assert.equal(id.source.site, 'config');
});

test('precedence is per field: a flag overrides one field, config keeps the rest', () => {
  const id = resolveIdentity('https://acme.de/', { environment: 'staging' }, config);
  assert.equal(id.environment, 'staging');
  assert.equal(id.market, 'de');
  assert.deepEqual(id.source, {
    brand: 'config', site: 'config', market: 'config', environment: 'flag',
  });
});

test('an unknown site name is an error, not a new site', () => {
  assert.match(validateOverrides(config, { site: 'marketng' })!, /Unknown site/);
  assert.equal(validateOverrides(config, { site: 'marketing' }), null);
  assert.match(validateOverrides(config, { profile: 'desgin' })!, /Unknown profile/);
});

test('a profile may not target paths outside its site scope', () => {
  const app = { name: 'app', scope: ['acme.com/app'] };
  assert.deepEqual(validateProfilePaths(app, { name: 'design', paths: ['/app/settings'] }), []);
  assert.match(validateProfilePaths(app, { name: 'design', paths: ['/pricing'] })[0], /outside site/);
});

test('flags that contradict the profile make the run incomparable', () => {
  const profile = config.profiles![0];
  assert.deepEqual(profileFlagMismatch(profile, { crawl: 5 }), []);
  assert.equal(profileFlagMismatch(profile, { crawl: 2 }).length, 1);
  assert.match(profileFlagMismatch(profile, {})[0], /not comparable/);
});

/**
 * A stored reference points at an extraction, and the extraction's contract
 * moves. The failure this guards is quiet: the comparison still runs, the
 * numbers still look like numbers, and a value the extractor now derives
 * differently reads as drift the site never had.
 *
 * Cases are expressed against SCHEMA_VERSION rather than a literal, so the
 * next contract bump does not silently turn "a minor behind" into "current"
 * and leave the assertion passing for the wrong reason.
 */
const snapshotRef = (schemaVersion: string | null) => ({
  source: {
    kind: 'snapshot' as const,
    ref: { snapshotId: 's1', schemaVersion, takenAt: '2026-01-01T00:00:00.000Z' },
  },
});

const [maj, min] = SCHEMA_VERSION.split('.').map(Number);

test('a document reference is never invalidated by a contract change', () => {
  assert.deepEqual(
    referenceComparability({ source: { kind: 'document', documentId: 'guideline-1' } }),
    { comparable: true, reason: null },
  );
});

test('the current contract compares without a caveat', () => {
  assert.deepEqual(referenceComparability(snapshotRef(SCHEMA_VERSION)), {
    comparable: true,
    reason: null,
  });
});

test('a minor step still compares, and carries the caveat verbatim from version.ts', () => {
  const older = `${maj}.${Math.max(0, min - 1)}.0`;
  const r = referenceComparability(snapshotRef(older));
  const compat = checkSchemaCompatibility({ meta: { schemaVersion: older } });
  assert.equal(r.comparable, compat.compatible);
  assert.equal(r.reason, compat.message, 'the notice must not be a second wording of the same check');
});

test('a major step is not like for like', () => {
  const r = referenceComparability(snapshotRef(`${maj + 1}.0.0`));
  assert.equal(r.comparable, false);
  assert.ok(r.reason, 'an incompatible baseline must say why');
});

test('a baseline with no schema version cannot be established', () => {
  const r = referenceComparability(snapshotRef(null));
  assert.equal(r.comparable, false);
  assert.match(r.reason ?? '', /no readable schema version/);
});

test('an unreadable version is refused rather than guessed', () => {
  const r = referenceComparability(snapshotRef('not-a-version'));
  assert.equal(r.comparable, false);
  assert.match(r.reason ?? '', /no readable schema version/);
});
