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
  type IdentityConfig,
} from '../lib/identity.js';

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
