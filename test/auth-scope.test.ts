import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { authOrigins, authScopeWarning, inAuthScope, scopeHeaders } from '../lib/extractors/auth-scope.js';
import { extractBranding } from '../lib/extractors/index.js';
import { buildContextOptions } from '../lib/extractors/context-config.js';

test('credentials cover the site with and without www, and its https upgrade', () => {
  const origins = authOrigins('http://example.com/a');
  for (const u of ['http://example.com', 'http://www.example.com/x', 'https://example.com', 'https://www.example.com']) {
    assert.equal(inAuthScope(u, origins), true, u);
  }
});

test('credentials never reach another host, a subdomain, a lookalike, another port or a downgrade', () => {
  const origins = authOrigins('https://example.com');
  for (const u of ['https://cdn.example.com', 'https://example.com.evil.test', 'https://evilexample.com',
    'https://example.com:8443', 'http://example.com', 'https://example.com@evil.test', 'data:text/html,x', 'nope']) {
    assert.equal(inAuthScope(u, origins), false, u);
  }
  assert.deepEqual(authOrigins('http://127.0.0.1:3000'), ['http://127.0.0.1:3000']);
  assert.deepEqual(authOrigins('http://localhost:3000'), ['http://localhost:3000']);
});

test('a redirect off the site warns only when credentials were given', () => {
  const origins = authOrigins('https://example.com');
  assert.match(authScopeWarning('https://idp.test/login', origins, true) ?? '', /https:\/\/idp\.test/);
  assert.equal(authScopeWarning('https://idp.test/login', origins, false), null);
  assert.equal(authScopeWarning('https://www.example.com/', origins, true), null);
});

let browser: Browser;
let site: http.Server;
let other: http.Server;
let siteUrl = '';
let otherUrl = '';
let seen: Array<{ path: string; at: 'site' | 'other'; secret?: string; auth?: string; cookie?: string }> = [];
const tall = `<main style="height:600px"><h1>Page</h1>${'<p>Enough text to count as content.</p>'.repeat(20)}</main>`;

const serve = (at: 'site' | 'other', reply: (path: string) => { redirect?: string; html?: string }) =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      seen.push({ path, at, secret: req.headers['x-secret'] as string, auth: req.headers.authorization, cookie: req.headers.cookie });
      if (path.startsWith('/basic') && !req.headers.authorization) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="x"' }).end();
        return;
      }
      const { redirect, html = 'ok' } = reply(path);
      res.writeHead(redirect ? 302 : 200, redirect ? { location: redirect } : { 'content-type': 'text/html' });
      res.end(html);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });

before(async () => {
  browser = await chromium.launch();
  other = await serve('other', (p) => (p === '/back' ? { redirect: `${siteUrl}/backed` } : p === '/app' ? { html: tall } : {}));
  otherUrl = `http://localhost:${(other.address() as AddressInfo).port}`;
  site = await serve('site', (p) => ({
    '/in': { redirect: '/page' },
    '/out': { redirect: `${otherUrl}/landed` },
    '/img': { redirect: `${otherUrl}/img` },
    '/app': { html: `${tall}<link rel="stylesheet" href="${otherUrl}/basic">` },
    '/page': { html: `<img src="/img"><img src="${otherUrl}/direct"><img src="${otherUrl}/back"><img src="${otherUrl}/basic">` },
    '/basic-page': { html: `<link rel="stylesheet" href="${otherUrl}/basic">` },
  })[p] ?? {});
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});
after(async () => { await browser?.close(); site?.close(); other?.close(); });

async function visit(path: string, engine: string, basic = false) {
  seen = [];
  const origins = authOrigins(siteUrl);
  const options = buildContextOptions(
    { header: 'X-Secret: s', ...(basic && { httpCredentials: { username: 'u', password: 'p' } }) }, 'chromium', origins);
  const context = await browser.newContext(options as Parameters<Browser['newContext']>[0]);
  await scopeHeaders(context, { 'X-Secret': 's' }, origins, engine);
  const page = await context.newPage();
  await page.goto(siteUrl + path, { waitUntil: 'networkidle', timeout: 8000 });
  await context.close();
  return { to: (at: string) => seen.filter((r) => r.at === at && r.path !== '/favicon.ico') };
}

for (const engine of ['chromium', 'firefox']) {
  test(`${engine} path: a subresource or a redirect on another origin never gets the header`, async () => {
    for (const [path, expected] of Object.entries({ '/in': ['/back', '/direct', '/img'], '/out': ['/landed'] })) {
      const { to } = await visit(path, engine);
      const reached = to('other').map((r) => r.path);
      for (const p of expected) assert.ok(reached.includes(p), `${path} never reached ${p}`);
      assert.deepEqual(to('other').filter((r) => r.secret), [], path);
      assert.equal(to('site').find((r) => r.path === path)?.secret, 's');
    }
  });
}

test('the header follows redirects that stay on the site, and returns to it', async () => {
  const { to } = await visit('/in', 'chromium');
  assert.equal(to('site').find((r) => r.path === '/page')?.secret, 's');
  assert.equal(to('site').find((r) => r.path === '/backed')?.secret, 's');
});

test('a header the browser refuses fails the request instead of hanging it', async () => {
  const context = await browser.newContext();
  await scopeHeaders(context, { Host: 'other.test' }, authOrigins(siteUrl), 'chromium');
  const page = await context.newPage();
  await assert.rejects(page.goto(`${siteUrl}/app`, { timeout: 5000 }), /net::ERR_FAILED/);
  await context.close();
});

test('basic auth answers the requested site and no other', async () => {
  const { to } = await visit('/basic-page', 'chromium', true);
  const granted = to('site').filter((r) => r.path === '/basic-page');
  assert.deepEqual(granted.map((r) => r.auth?.split(' ')[0]), [undefined, 'Basic']);
  assert.ok(to('other').some((r) => r.path === '/basic'));
  assert.deepEqual(to('other').filter((r) => r.auth), []);
});

const spinner = { text: '', start() { return this; }, stop() { return this; }, succeed() { return this; },
  fail() { return this; }, warn() { return this; }, info() { return this; } };
const credentials = { header: ['X-Secret: s', 'Authorization: Bearer t'], cookie: 'session=c' };

async function extract(url: string, options: object) {
  seen = [];
  await extractBranding(url, spinner as never, browser, { ...credentials, ...options });
  return { at: (where: string) => seen.filter((r) => r.at === where && r.path !== '/favicon.ico') };
}

test('an extraction sends every credential to the site and none to the hosts it loads from', async () => {
  const { at } = await extract(`${siteUrl}/app`, {});
  const page = at('site').find((r) => r.path === '/app');
  assert.deepEqual([page?.secret, page?.auth, page?.cookie], ['s', 'Bearer t', 'session=c']);
  assert.ok(at('other').some((r) => r.path === '/basic'));
  assert.deepEqual(at('other').filter((r) => r.secret || r.auth || r.cookie), []);
});

test('a crawled page on another site gets no credential', async () => {
  const { at } = await extract(`${otherUrl}/app`, { authUrl: siteUrl });
  assert.ok(at('other').some((r) => r.path === '/app'));
  assert.deepEqual(at('other').filter((r) => r.secret || r.auth || r.cookie), []);
});

test('a CLI crawl to another site carries no credential there', async () => {
  seen = [];
  const cli = fileURLToPath(new URL('../index.js', import.meta.url));
  await promisify(execFile)(process.execPath, [cli, `${siteUrl}/app`, `${otherUrl}/app`, '--json-only',
    '--no-headed-fallback', '--header', 'X-Secret: s', '--cookie', 'session=c'], { maxBuffer: 1 << 26 });
  assert.equal(seen.find((r) => r.at === 'site' && r.path === '/app')?.secret, 's');
  assert.ok(seen.some((r) => r.at === 'other' && r.path === '/app'));
  assert.deepEqual(seen.filter((r) => r.at === 'other' && (r.secret || r.cookie)), []);
});
