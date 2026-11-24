import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { authOrigins, authScopeWarning, inAuthScope, scopeHeaders } from '../lib/extractors/auth-scope.js';
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
let seen: Array<{ path: string; at: 'site' | 'other'; secret?: string; auth?: string }> = [];

const serve = (at: 'site' | 'other', reply: (path: string) => { redirect?: string; html?: string }) =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      seen.push({ path, at, secret: req.headers['x-secret'] as string, auth: req.headers.authorization });
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
  other = await serve('other', (p) => (p === '/back' ? { redirect: `${siteUrl}/backed` } : {}));
  otherUrl = `http://localhost:${(other.address() as AddressInfo).port}`;
  site = await serve('site', (p) => ({
    '/in': { redirect: '/page' },
    '/out': { redirect: `${otherUrl}/landed` },
    '/img': { redirect: `${otherUrl}/img` },
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
    for (const path of ['/in', '/out']) {
      const { to } = await visit(path, engine);
      assert.ok(to('other').length > 0, path);
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

test('basic auth answers the requested site and no other', async () => {
  const { to } = await visit('/basic-page', 'chromium', true);
  assert.ok(to('site').some((r) => r.auth?.startsWith('Basic ')));
  assert.ok(to('other').some((r) => r.path === '/basic'));
  assert.deepEqual(to('other').filter((r) => r.auth), []);
});
