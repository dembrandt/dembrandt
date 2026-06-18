/**
 * Hardening the untrusted-input surface: malformed CLI cookie/header/screen
 * strings must degrade to safe values, never produce truncated cookies or a NaN
 * viewport. buildContextOptions stays pure (no browser).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCookies,
  parseHeader,
  parseScreenSize,
  deriveAcceptLanguage,
  buildContextOptions,
  DEFAULT_SCREEN,
  DEFAULT_USER_AGENT,
} from '../lib/extractors/context-config.js';

const URL = 'https://example.com/';

test('parseCookies parses a multi-pair string and trims whitespace', () => {
  const out = parseCookies(' a=1 ; b = two ', URL);
  assert.deepEqual(out, [
    { name: 'a', value: '1', url: URL },
    { name: 'b', value: 'two', url: URL },
  ]);
});

test('parseCookies keeps "=" inside the value intact', () => {
  const out = parseCookies('token=ab==cd', URL);
  assert.deepEqual(out, [{ name: 'token', value: 'ab==cd', url: URL }]);
});

test('parseCookies skips pairs with no "=" instead of truncating the name', () => {
  // Previous behavior emitted { name: "bareto", value: "bare" } from indexOf -1.
  assert.deepEqual(parseCookies('bare', URL), []);
  assert.deepEqual(parseCookies('good=1; bare; =orphan', URL), [
    { name: 'good', value: '1', url: URL },
  ]);
});

test('parseCookies returns [] for empty or undefined input', () => {
  assert.deepEqual(parseCookies(undefined, URL), []);
  assert.deepEqual(parseCookies('', URL), []);
  assert.deepEqual(parseCookies('  ;  ', URL), []);
});

test('parseHeader parses a single Name: value pair', () => {
  assert.deepEqual(parseHeader('X-Token: abc123'), { 'X-Token': 'abc123' });
});

test('parseHeader keeps colons inside the value', () => {
  assert.deepEqual(parseHeader('X-Time: 12:30:00'), { 'X-Time': '12:30:00' });
});

test('parseHeader ignores input with no colon or empty name', () => {
  assert.deepEqual(parseHeader('garbage'), {});
  assert.deepEqual(parseHeader(': value'), {});
  assert.deepEqual(parseHeader(undefined), {});
});

test('parseScreenSize parses WIDTHxHEIGHT', () => {
  assert.deepEqual(parseScreenSize('1280x720'), { width: 1280, height: 720 });
});

test('parseScreenSize falls back to default for malformed input', () => {
  assert.deepEqual(parseScreenSize(undefined), DEFAULT_SCREEN);
  assert.deepEqual(parseScreenSize('1280'), DEFAULT_SCREEN);
  assert.deepEqual(parseScreenSize('axb'), DEFAULT_SCREEN);
  assert.deepEqual(parseScreenSize('1280x'), DEFAULT_SCREEN);
  assert.deepEqual(parseScreenSize('-1x720'), DEFAULT_SCREEN);
  assert.deepEqual(parseScreenSize('0x0'), DEFAULT_SCREEN);
});

test('parseScreenSize never yields a NaN dimension', () => {
  const { width, height } = parseScreenSize('NaNxNaN');
  assert.ok(Number.isFinite(width) && Number.isFinite(height));
  assert.deepEqual({ width, height }, DEFAULT_SCREEN);
});

test('deriveAcceptLanguage prefers explicit value, else builds from locale', () => {
  assert.equal(deriveAcceptLanguage('fi-FI', 'da-DK'), 'da-DK');
  assert.equal(deriveAcceptLanguage('fi-FI'), 'fi-FI,fi;q=0.9,en;q=0.8');
});

test('buildContextOptions assembles defaults and is pure', () => {
  const opts = buildContextOptions({}, 'chromium');
  assert.deepEqual(opts.viewport, DEFAULT_SCREEN);
  assert.equal(opts.userAgent, DEFAULT_USER_AGENT);
  assert.equal(opts.locale, 'en-US');
  assert.equal(opts.colorScheme, 'light');
  assert.equal(opts.extraHTTPHeaders['Accept-Language'], 'en-US,en;q=0.9,en;q=0.8');
  assert.deepEqual(opts.permissions, ['clipboard-read', 'clipboard-write']);
});

test('buildContextOptions omits clipboard permissions for non-chromium', () => {
  const opts = buildContextOptions({}, 'firefox');
  assert.equal(opts.permissions, undefined);
});

test('buildContextOptions merges a custom header alongside Accept-Language', () => {
  const opts = buildContextOptions({ header: 'X-Token: abc', screenSize: '800x600' }, 'webkit');
  assert.deepEqual(opts.viewport, { width: 800, height: 600 });
  assert.equal(opts.extraHTTPHeaders['X-Token'], 'abc');
  assert.ok(opts.extraHTTPHeaders['Accept-Language']);
});
