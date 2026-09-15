/**
 * Identity is the one stated block in the output, so the rules that decide it
 * are the ones that must not drift: scope specificity, override precedence, and
 * the refusal to invent a site from a typo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  siteKeyOf,
  matchSite,
  resolveIdentity,
  validateOverrides,
  profileFlagMismatch,
  type IdentityConfig,
} from '../lib/identity.js';

const config: IdentityConfig = {
  brand: 'Acme',
  sites: [
    { name: 'marketing', id: 'st_1', scope: ['acme.com'] },
    { name: 'app', id: 'st_2', scope: ['acme.com/app', 'app.acme.com'] },
    { name: 'docs', id: 'st_3', scope: ['*.acme.com'], environment: 'production' },
  ],
  profiles: [{ name: 'design', flags: { crawl: 5 } }],
};

test('siteKeyOf strips www and survives garbage', () => {
  assert.equal(siteKeyOf('https://www.acme.com/pricing'), 'acme.com');
  assert.equal(siteKeyOf('not a url'), 'unknown');
  assert.equal(siteKeyOf(null), 'unknown');
});

test('a path scope beats a bare host on the same domain', () => {
  assert.equal(matchSite(config, 'https://acme.com/app/settings')?.name, 'app');
  assert.equal(matchSite(config, 'https://acme.com/pricing')?.name, 'marketing');
});

test('a named subdomain beats a wildcard covering it', () => {
  assert.equal(matchSite(config, 'https://app.acme.com/')?.name, 'app');
  assert.equal(matchSite(config, 'https://help.acme.com/')?.name, 'docs');
});

test('a path scope does not match a sibling path with the same prefix', () => {
  assert.equal(matchSite(config, 'https://acme.com/application')?.name, 'marketing');
});

test('no config falls back to the hostname and says so', () => {
  const id = resolveIdentity('https://www.acme.com/', {}, null);
  assert.deepEqual(id, {
    brand: null,
    site: 'acme.com',
    environment: 'production',
    profile: null,
    source: 'derived',
    siteId: 'acme.com',
  });
});

test('config supplies brand, site and the stable id', () => {
  const id = resolveIdentity('https://acme.com/app/', {}, config);
  assert.equal(id.source, 'config');
  assert.equal(id.site, 'app');
  assert.equal(id.siteId, 'st_2');
  assert.equal(id.brand, 'Acme');
});

test('flags override config and mark the run as flag-sourced', () => {
  const id = resolveIdentity('https://acme.com/', { environment: 'staging' }, config);
  assert.equal(id.environment, 'staging');
  assert.equal(id.source, 'flag');
});

test('an unknown site name is an error, not a new site', () => {
  assert.match(validateOverrides(config, { site: 'marketng' })!, /Unknown site/);
  assert.equal(validateOverrides(config, { site: 'marketing' }), null);
  assert.match(validateOverrides(config, { profile: 'desgin' })!, /Unknown profile/);
});

test('flags that contradict the profile make the run incomparable', () => {
  const profile = config.profiles![0];
  assert.deepEqual(profileFlagMismatch(profile, { crawl: 5 }), []);
  assert.equal(profileFlagMismatch(profile, { crawl: 2 }).length, 1);
  assert.match(profileFlagMismatch(profile, {})[0], /not comparable/);
});
