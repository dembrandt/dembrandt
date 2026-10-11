/**
 * Cookie-file / storageState / basic-auth parsing. No browser: malformed
 * exports must fail closed with a clear error, never produce a truncated
 * session that silently extracts the login wall.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  parseNetscapeCookies,
  parseCookieFileJson,
  parseCookieFileText,
  loadAuthSession,
  mergeSessionCookies,
  parseBasicAuth,
  normalizeSessionCookie,
  waitForEnter,
  emptyAuthSession,
  serializeStorageState,
  sessionStorageInitScript,
  isOffTarget,
  expiredSessionWarning,
  sessionRedirectWarning,
} from '../lib/extractors/auth-session.js';
import vm from 'node:vm';

const URL = 'https://app.example.com/dashboard';

test('parseNetscapeCookies reads a standard cookies.txt line', () => {
  const text = [
    '# Netscape HTTP Cookie File',
    '.example.com\tTRUE\t/\tTRUE\t1893456000\tsession\tabc123',
  ].join('\n');
  const out = parseNetscapeCookies(text, URL);
  assert.deepEqual(out, [{
    name: 'session',
    value: 'abc123',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: false,
    expires: 1893456000,
  }]);
});

test('parseNetscapeCookies keeps #HttpOnly_ markers as httpOnly cookies', () => {
  const text = '#HttpOnly_.example.com\tTRUE\t/\tFALSE\t0\tid\txyz';
  const out = parseNetscapeCookies(text, URL);
  assert.equal(out.length, 1);
  assert.equal(out[0].httpOnly, true);
  assert.equal(out[0].domain, '.example.com');
  assert.equal(out[0].secure, false);
  assert.ok(!('expires' in out[0]));
});

test('parseNetscapeCookies skips comments and short lines', () => {
  const text = '# comment\n\nnot-enough-fields\n';
  assert.deepEqual(parseNetscapeCookies(text, URL), []);
});

test('parseCookieFileJson accepts a Playwright cookie array', () => {
  const session = parseCookieFileJson(JSON.stringify([
    { name: 'a', value: '1', domain: '.example.com', path: '/' },
    { name: 'b', value: '2' },
  ]), URL);
  assert.equal(session.storageState, null);
  assert.equal(session.cookies.length, 2);
  assert.equal(session.cookies[1].url, URL);
  assert.equal(session.cookies[0].path, '/');
});

test('parseCookieFileJson accepts storageState with origins (localStorage)', () => {
  const raw = {
    cookies: [{ name: 'sid', value: '1', domain: 'app.example.com', path: '/' }],
    origins: [{
      origin: 'https://app.example.com',
      localStorage: [{ name: 'token', value: 'jwt-here' }],
    }],
  };
  const session = parseCookieFileJson(JSON.stringify(raw), URL);
  assert.ok(session.storageState);
  assert.equal(session.storageState!.origins.length, 1);
  assert.deepEqual(session.storageState!.origins[0].localStorage, [
    { name: 'token', value: 'jwt-here' },
  ]);
  assert.equal(session.cookies[0].name, 'sid');
});

test('parseCookieFileJson treats storageState with empty origins as storageState', () => {
  const session = parseCookieFileJson(JSON.stringify({ cookies: [], origins: [] }), URL);
  assert.ok(session.storageState);
  assert.deepEqual(session.storageState!.origins, []);
});

test('parseCookieFileJson rejects unrelated JSON objects', () => {
  assert.throws(() => parseCookieFileJson('{"foo":1}', URL), /cookie array or Playwright storageState/);
  assert.throws(() => parseCookieFileJson('not-json', URL), /invalid JSON/);
});

test('parseCookieFileJson drops cookie rows without name/value rather than inventing them', () => {
  const session = parseCookieFileJson(JSON.stringify([
    { name: 'ok', value: '1' },
    { name: 'no-value' },
    { value: 'orphan' },
    null,
  ]), URL);
  assert.equal(session.cookies.length, 1);
  assert.equal(session.cookies[0].name, 'ok');
});

test('parseCookieFileText routes JSON vs Netscape by content', () => {
  const json = parseCookieFileText('[{"name":"a","value":"1"}]', URL);
  assert.equal(json.cookies[0].name, 'a');
  const netscape = parseCookieFileText('.example.com\tTRUE\t/\tFALSE\t0\tk\tv', URL);
  assert.equal(netscape.cookies[0].name, 'k');
  assert.equal(netscape.storageState, null);
});

test('loadAuthSession reads through the injected reader and resolves the path', () => {
  const seen: string[] = [];
  const session = loadAuthSession('session.json', URL, (p) => {
    seen.push(p);
    return JSON.stringify([{ name: 'x', value: 'y' }]);
  });
  assert.equal(session.cookies[0].name, 'x');
  assert.ok(seen[0].endsWith('session.json'));
  assert.ok(seen[0].startsWith('/'));
});

test('loadAuthSession surfaces a read failure with the absolute path', () => {
  assert.throws(
    () => loadAuthSession('missing.json', URL, () => { throw new Error('ENOENT'); }),
    /cookie file: cannot read .*missing\.json: ENOENT/,
  );
});

test('mergeSessionCookies lets later entries win on name+domain', () => {
  const a = [{ name: 'sid', value: 'old', domain: '.example.com', path: '/' }];
  const b = [{ name: 'sid', value: 'new', domain: '.example.com', path: '/' }];
  const merged = mergeSessionCookies(a, b);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].value, 'new');
});

test('mergeSessionCookies keeps distinct names and distinct domains', () => {
  const merged = mergeSessionCookies(
    [{ name: 'a', value: '1', url: URL }],
    [
      { name: 'b', value: '2', url: URL },
      { name: 'a', value: '3', domain: 'other.test', path: '/' },
    ],
  );
  assert.equal(merged.length, 3);
});

test('parseBasicAuth splits on the first colon so passwords may contain colons', () => {
  assert.deepEqual(parseBasicAuth('user:p:ass:word'), { username: 'user', password: 'p:ass:word' });
  assert.deepEqual(parseBasicAuth('staging:'), { username: 'staging', password: '' });
});

test('parseBasicAuth returns null for empty/undefined and throws on a missing colon', () => {
  assert.equal(parseBasicAuth(undefined), null);
  assert.equal(parseBasicAuth(''), null);
  assert.throws(() => parseBasicAuth('nouserpass'), /user:password/);
  assert.throws(() => parseBasicAuth(':onlypass'), /user:password/);
});

test('normalizeSessionCookie defaults path when domain is set without path', () => {
  const c = normalizeSessionCookie({ name: 'a', value: '1', domain: '.x.com' }, URL);
  assert.equal(c!.path, '/');
  assert.equal(c!.url, undefined);
});

test('emptyAuthSession is a fresh mutable shell, not the frozen sentinel', () => {
  const a = emptyAuthSession();
  a.cookies.push({ name: 'x', value: '1', url: URL });
  assert.equal(emptyAuthSession().cookies.length, 0);
});

test('waitForEnter rejects when stdin is not a TTY', async () => {
  const stdin = Object.assign(new EventEmitter(), { isTTY: false, resume() {}, pause() {}, off: EventEmitter.prototype.off });
  await assert.rejects(() => waitForEnter(stdin as never, { write() { return true; } } as never), /interactive terminal/);
});

test('waitForEnter resolves on the first newline', async () => {
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    resume() {},
    pause() {},
    off: EventEmitter.prototype.off,
  });
  let prompt = '';
  const pending = waitForEnter(stdin as never, { write(s: string) { prompt += s; return true; } } as never);
  stdin.emit('data', Buffer.from('\n'));
  await pending;
  assert.match(prompt, /Log in in the browser/);
});

test('waitForEnter rejects when stdin ends before Enter', async () => {
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    resume() {},
    pause() {},
    off: EventEmitter.prototype.off,
  });
  const pending = waitForEnter(stdin as never, { write() { return true; } } as never);
  stdin.emit('end');
  await assert.rejects(() => pending, /stdin closed/);
});

const SAVED = {
  cookies: [{ name: 'sid', value: '1', domain: 'app.example.com', path: '/' }],
  origins: [{ origin: 'https://app.example.com', localStorage: [{ name: 'theme', value: 'dark' }] }],
  sessionStorage: [
    { origin: 'https://app.example.com', sessionStorage: [{ name: 'idp.token', value: 'abc' }, { name: 'nonce', value: 'n1' }] },
    { origin: 'https://login.example.net', sessionStorage: [] },
  ],
};

test('parseCookieFileJson reads the sessionStorage block and keeps storageState Playwright-shaped', () => {
  const session = parseCookieFileJson(JSON.stringify(SAVED), URL);
  assert.deepEqual(Object.keys(session.storageState!), ['cookies', 'origins']);
  assert.deepEqual(session.sessionStorage, [
    { origin: 'https://app.example.com', sessionStorage: [{ name: 'idp.token', value: 'abc' }, { name: 'nonce', value: 'n1' }] },
    { origin: 'https://login.example.net', sessionStorage: [] },
  ]);
  assert.deepEqual(parseCookieFileJson('{"cookies":[]}', URL).sessionStorage, []);
  assert.deepEqual(parseCookieFileJson('[]', URL).sessionStorage, []);
});

test('serializeStorageState writes sessionStorage only for origins that have entries, and parses back', () => {
  const text = serializeStorageState({ cookies: SAVED.cookies, origins: SAVED.origins }, SAVED.sessionStorage);
  const parsed = JSON.parse(text);
  assert.equal(parsed.sessionStorage.length, 1);
  assert.equal(parsed.sessionStorage[0].origin, 'https://app.example.com');
  assert.deepEqual(parseCookieFileJson(text, URL).sessionStorage, [SAVED.sessionStorage[0]]);
  assert.equal(JSON.parse(serializeStorageState({ cookies: [], origins: [] }, [])).sessionStorage, undefined);
});

function runInitScript(origin: string, existing: Record<string, string>) {
  const store = new Map(Object.entries(existing));
  const sandbox = {
    location: { origin },
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
  };
  vm.runInNewContext(sessionStorageInitScript(SAVED.sessionStorage), sandbox);
  return Object.fromEntries(store);
}

test('sessionStorageInitScript seeds the matching origin and leaves other origins and existing keys alone', () => {
  assert.deepEqual(runInitScript('https://app.example.com', {}), { 'idp.token': 'abc', nonce: 'n1' });
  assert.deepEqual(runInitScript('https://app.example.com', { 'idp.token': 'fresh' }), { 'idp.token': 'fresh', nonce: 'n1' });
  assert.deepEqual(runInitScript('https://other.example.com', {}), {});
  assert.deepEqual(runInitScript('https://login.example.net', {}), {});
});

test('sessionStorageInitScript escapes values that would otherwise break out of the script', () => {
  const script = sessionStorageInitScript([{ origin: 'https://a.test', sessionStorage: [{ name: 'k', value: '</script>"; alert(1); //' }] }]);
  const store = new Map<string, string>();
  vm.runInNewContext(script, { location: { origin: 'https://a.test' }, sessionStorage: { getItem: () => null, setItem: (k, v) => store.set(k, v) } });
  assert.equal(store.get('k'), '</script>"; alert(1); //');
});

test('isOffTarget compares hosts, so a sign-in redirect is off target and a path change is not', () => {
  assert.equal(isOffTarget('https://login.example.net/authorize?x=1', 'https://app.example.com/dashboard'), true);
  assert.equal(isOffTarget('https://app.example.com/home', 'https://app.example.com/dashboard'), false);
  assert.equal(isOffTarget('https://app.example.com:8443/', 'https://app.example.com/'), true);
  assert.equal(isOffTarget('about:blank', 'https://app.example.com/'), true);
  assert.equal(isOffTarget('not a url', 'https://app.example.com/'), false);
});

test('expiredSessionWarning fires only when every dated cookie has lapsed', () => {
  const now = Date.UTC(2026, 0, 1);
  const past = now / 1000 - 3600;
  const future = now / 1000 + 3600;
  const session = (cookies) => ({ cookies, storageState: null, sessionStorage: [] });
  assert.equal(expiredSessionWarning(session([]), now), null);
  assert.equal(expiredSessionWarning(session([{ name: 'a', value: '1' }]), now), null);
  assert.equal(expiredSessionWarning(session([{ name: 'a', value: '1', expires: past }, { name: 'b', value: '1', expires: future }]), now), null);
  assert.match(expiredSessionWarning(session([{ name: 'a', value: '1', expires: past }, { name: 's', value: '1', expires: -1 }]), now)!, /expired.*2025-12-31T23:00:00/);
});

test('sessionRedirectWarning names both hosts and stays quiet without a session or on the same host', () => {
  assert.match(sessionRedirectWarning('https://login.example.net/x', 'https://app.example.com/', true)!, /app\.example\.com redirected to login\.example\.net/);
  assert.equal(sessionRedirectWarning('https://login.example.net/x', 'https://app.example.com/', false), null);
  assert.equal(sessionRedirectWarning('https://app.example.com/signin', 'https://app.example.com/', true), null);
});

test('parseNetscapeCookies tolerates leading whitespace on a cookie line', () => {
  const [c] = parseNetscapeCookies('  #HttpOnly_app.example.com\tTRUE\t/\tTRUE\t0\tsid\tv', URL);
  assert.equal(c.domain, 'app.example.com');
  assert.equal(c.httpOnly, true);
});
