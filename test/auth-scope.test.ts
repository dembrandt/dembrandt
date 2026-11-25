import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, type Browser, type Page } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { authOrigins, authScopeWarning, credentialUrlFor, inAuthScope, scopeHeaders, type Goto } from '../lib/extractors/auth-scope.js';
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
      if (path === '/deep/s.css') {
        res.writeHead(200, { 'content-type': 'text/css' }).end('body { background: url(bg.png) }');
        return;
      }
      if (path === '/once' && seen.filter((r) => r.path === '/once').length > 1) {
        res.writeHead(410).end();
        return;
      }
      if (path === '/slow.js') {
        setTimeout(() => res.end(), 700);
        return;
      }
      if (path === '/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream' }).write('data: first\n\n');
        return;
      }
      const { redirect, html = 'ok' } = reply(path);
      res.writeHead(redirect ? 302 : 200, redirect ? { location: redirect } : { 'content-type': 'text/html' });
      res.end(html);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });

before(async () => {
  browser = await chromium.launch();
  other = await serve('other', (p) => (p === '/back' ? { redirect: `${siteUrl}/backed` } : p === '/app' ? { html: `${tall}<link rel="stylesheet" href="/basic">` } : {}));
  otherUrl = `http://localhost:${(other.address() as AddressInfo).port}`;
  site = await serve('site', (p) => ({
    '/in': { redirect: '/page' },
    '/out': { redirect: `${otherUrl}/landed` },
    '/img': { redirect: `${otherUrl}/img` },
    '/to-app': { redirect: '/app' },
    '/to-other': { redirect: `${otherUrl}/app` },
    '/basic-app': { html: `${tall}<link rel="stylesheet" href="${otherUrl}/basic">` },
    '/once': { html: tall },
    '/styles': { redirect: '/deep/s.css' },
    '/pic': { redirect: '/pic-moved' },
    '/framing': { html: '<iframe src="/frame-hop"></iframe><script src="/slow.js"></script>' },
    '/frame-hop': { redirect: '/framed' },
    '/hop1': { redirect: '/hop2' },
    '/hop2': { redirect: '/app' },
    '/loop': { redirect: '/loop' },
    '/wander': { html: `${tall}<script>setTimeout(() => { location.href = '${otherUrl}/app'; }, 200)</script>` },
    '/app': { html: `${tall}<link rel="stylesheet" href="/styles"><img src="/pic"><link rel="stylesheet" href="${otherUrl}/basic">` },
    '/page': { html: `<img src="/img"><img src="${otherUrl}/direct"><img src="${otherUrl}/back"><img src="${otherUrl}/basic"><script>fetch('/api', { headers: { 'x-secret': 'page' } })</script>` },
    '/basic-page': { html: `<link rel="stylesheet" href="${otherUrl}/basic">` },
  })[p] ?? {});
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});
after(async () => { await browser?.close(); site?.closeAllConnections(); site?.close(); other?.close(); });

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

test('a header the page sets under another case is replaced, not doubled', async () => {
  for (const engine of ['chromium', 'firefox']) {
    const { to } = await visit('/page', engine);
    assert.deepEqual(to('site').filter((r) => r.path === '/api').map((r) => r.secret), ['s'], engine);
  }
});

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

async function extract(url: string, options: object, using = browser) {
  seen = [];
  const result = await extractBranding(url, spinner as never, using, options) as { meta: { sessionWarnings?: string[] } };
  return { warnings: result.meta.sessionWarnings ?? [],  at: (where: string) => seen.filter((r) => r.at === where && r.path !== '/favicon.ico') };
}

test('an extraction sends every credential to the site and none to the hosts it loads from', async () => {
  const { at } = await extract(`${siteUrl}/app`, credentials);
  const page = at('site').find((r) => r.path === '/app');
  assert.deepEqual([page?.secret, page?.auth, page?.cookie], ['s', 'Bearer t', 'session=c']);
  assert.ok(at('other').some((r) => r.path === '/basic'));
  assert.deepEqual(at('other').filter((r) => r.secret || r.auth || r.cookie), []);
});

test('a crawled page on another site gets no credential', async () => {
  const { at } = await extract(`${otherUrl}/app`, { ...credentials, authUrl: siteUrl });
  assert.ok(at('other').some((r) => r.path === '/app'));
  assert.deepEqual(at('other').filter((r) => r.secret || r.auth || r.cookie), []);
});

test('a CLI crawl to another site carries no credential there', async () => {
  seen = [];
  const cli = fileURLToPath(new URL('../index.js', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [cli, `${siteUrl}/app`, `${otherUrl}/app`, '--json-only',
    '--no-headed-fallback', '--header', 'X-Secret: s', '--cookie', 'session=c'], { maxBuffer: 1 << 26 });
  assert.equal(seen.find((r) => r.at === 'site' && r.path === '/app')?.secret, 's');
  assert.ok(seen.some((r) => r.at === 'other' && r.path === '/app'));
  assert.deepEqual(seen.filter((r) => r.at === 'other' && (r.secret || r.cookie)), []);
  assert.match(JSON.parse(stdout).meta.sessionWarnings?.[0] ?? '', /requested site only/);
});

test('basic auth given to an extraction opens the site', async () => {
  const { at } = await extract(`${siteUrl}/basic-app`, { basicAuth: 'u:p' });
  assert.ok(at('site').some((r) => r.path === '/basic-app' && r.auth?.startsWith('Basic ')));
  assert.deepEqual(at('other').filter((r) => r.auth), []);
});

test('a cookie file without domains stays with the site on a crawl', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dembrandt-cookie-'));
  const cookieFile = join(dir, 'cookies.json');
  writeFileSync(cookieFile, JSON.stringify([{ name: 'session', value: 'f' }]));
  try {
    assert.equal((await extract(`${siteUrl}/app`, { cookieFile })).at('site').find((r) => r.path === '/app')?.cookie, 'session=f');
    const crawled = await extract(`${otherUrl}/app`, { cookieFile, authUrl: siteUrl });
    assert.ok(crawled.at('other').some((r) => r.path === '/app'));
    assert.deepEqual(crawled.at('other').filter((r) => r.cookie), []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('a crawled page on the site keeps its cookie when the site answers on www', () => {
  assert.equal(credentialUrlFor('https://www.example.com/a', 'https://example.com/'), 'https://www.example.com/a');
  assert.equal(credentialUrlFor('https://other.test/a', 'https://example.com/'), 'https://example.com/');
});

test('leaving the site, by redirect or by crawl, is a warning even when only the port differs', async () => {
  const redirected = await extract(`${siteUrl}/to-other`, { header: 'X-Secret: s' });
  assert.deepEqual(redirected.at('other').filter((r) => r.secret), []);
  assert.equal(redirected.warnings.length, 1);
  assert.match(redirected.warnings[0], new RegExp(`against ${otherUrl}`));
  const samehost = otherUrl.replace('localhost', '127.0.0.1');
  assert.match((await extract(`${samehost}/app`, { header: 'X-Secret: s', authUrl: siteUrl })).warnings[0] ?? '', /requested site only/);
  assert.deepEqual((await extract(`${siteUrl}/to-app`, { header: 'X-Secret: s' })).warnings, []);
  assert.deepEqual((await extract(`${siteUrl}/to-other`, {})).warnings, []);
});

const hasFirefox = existsSync(firefox.executablePath());

test('Firefox sends the header to the site, through its redirects, and to no other host', { skip: !hasFirefox && 'firefox is not installed' }, async () => {
  const ff = await firefox.launch();
  try {
    const { at, warnings } = await extract(`${siteUrl}/hop1`, credentials, ff);
    for (const path of ['/hop1', '/hop2', '/app', '/styles', '/pic']) {
      const requests = at('site').filter((r) => r.path === path);
      assert.ok(requests.length === 1 || path === '/styles', `${path} was requested ${requests.length} times`);
      for (const r of requests) assert.deepEqual([r.secret, r.cookie], ['s', 'session=c'], path);
    }
    assert.ok(at('site').some((r) => r.path === '/styles'));
    assert.ok(at('site').some((r) => r.path === '/deep/bg.png'), 'a redirected stylesheet resolves against where it landed');
    assert.ok(at('site').some((r) => r.path === '/pic-moved'));
    assert.ok(at('other').some((r) => r.path === '/basic'));
    assert.deepEqual(at('other').filter((r) => r.secret || r.auth || r.cookie), []);
    assert.deepEqual(warnings, []);
    const once = await extract(`${siteUrl}/once`, credentials, ff);
    assert.equal(once.at('site').filter((r) => r.path === '/once').length, 1, 'a one-time link is opened once');
    const basic = await extract(`${siteUrl}/basic-app`, { basicAuth: 'u:p', header: 'X-Secret: s' }, ff);
    assert.ok(basic.at('site').some((r) => r.path === '/basic-app' && r.auth?.startsWith('Basic ') && r.secret === 's'));
    assert.deepEqual(basic.at('other').filter((r) => r.auth || r.secret), []);
    const crawled = await extract(`${otherUrl}/app`, { ...credentials, authUrl: siteUrl }, ff);
    assert.ok(crawled.at('other').some((r) => r.path === '/app'));
    assert.deepEqual(crawled.at('other').filter((r) => r.secret || r.auth || r.cookie), []);
    const out = await extract(`${siteUrl}/to-other`, credentials, ff);
    assert.ok(out.at('other').some((r) => r.path === '/app'));
    assert.deepEqual(out.at('other').filter((r) => r.secret || r.auth || r.cookie), []);
    assert.equal(out.warnings.filter((w) => /requested site only/.test(w)).length, 1);
  } finally {
    await ff.close();
  }
});

async function firefoxPage(run: (page: Page, goto: Goto) => Promise<void>) {
  const ff = await firefox.launch();
  try {
    const context = await ff.newContext();
    const goto = await scopeHeaders(context, { 'X-Secret': 's' }, authOrigins(siteUrl), 'firefox');
    seen = [];
    await run(await context.newPage(), goto);
  } finally {
    await ff.close();
  }
}
const open = { timeout: 8000, waitUntil: 'domcontentloaded' as const };

test('Firefox reports the page it landed on, with its fragment and status', { skip: !hasFirefox && 'firefox is not installed' }, () =>
  firefoxPage(async (page, goto) => {
    const response = await goto(page, `${siteUrl}/hop1#part`, open);
    assert.equal(response?.status(), 200);
    assert.equal(response?.url(), `${siteUrl}/app`);
    assert.equal(page.url(), `${siteUrl}/app#part`);
  }));

test('Firefox lets a frame follow its own redirect', { skip: !hasFirefox && 'firefox is not installed' }, () =>
  firefoxPage(async (page, goto) => {
    await goto(page, `${siteUrl}/framing`, open);
    await page.waitForTimeout(1000);
    assert.deepEqual(page.frames().slice(1).map((f) => f.url()), [`${siteUrl}/framed`]);
    assert.equal(page.url(), `${siteUrl}/framing`);
  }));

test('Firefox gives up on a redirect loop, and passes other failures on', { skip: !hasFirefox && 'firefox is not installed' }, () =>
  firefoxPage(async (page, goto) => {
    await assert.rejects(goto(page, `${siteUrl}/loop`, open), /too many redirects/);
    await assert.rejects(goto(page, 'http://127.0.0.1:1/', open), /page\.goto/);
  }));

test('Firefox still opens event streams, without the header', { skip: !hasFirefox && 'firefox is not installed' }, () =>
  firefoxPage(async (page, goto) => {
    await goto(page, `${siteUrl}/plain`, open);
    const first = await page.evaluate(() => new Promise((ok) => {
      const source = new EventSource('/stream');
      source.onmessage = (e) => { source.close(); ok(e.data); };
      setTimeout(() => ok('nothing'), 4000);
    }));
    assert.equal(first, 'first');
    assert.equal(seen.find((r) => r.path === '/stream')?.secret, undefined);
  }));

test('a page that wanders off the site after loading is a warning too', async () => {
  const { warnings, at } = await extract(`${siteUrl}/wander`, { header: 'X-Secret: s' });
  assert.ok(at('other').some((r) => r.path === '/app'));
  assert.deepEqual(at('other').filter((r) => r.secret), []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /requested site only/);
});

test('basic auth alone earns the warning, and a crawl to another site does not carry it', async () => {
  const { warnings, at } = await extract(`${otherUrl}/app`, { basicAuth: 'u:p', authUrl: siteUrl });
  assert.ok(at('other').some((r) => r.path === '/basic'));
  assert.deepEqual(at('other').filter((r) => r.auth), []);
  assert.match(warnings[0] ?? '', /requested site only/);
});

test('basic auth covers every origin of the site', () => {
  const options = buildContextOptions({ httpCredentials: { username: 'u', password: 'p' } }, 'chromium', authOrigins('https://example.com'));
  assert.deepEqual(options.httpCredentials?.map((c) => c.origin), ['https://example.com', 'https://www.example.com']);
});

test('an MCP crawl to another site carries no credential there', async () => {
  seen = [];
  const server = fileURLToPath(new URL('../mcp-server.js', import.meta.url));
  const client = new Client({ name: 'auth-scope', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));
  try {
    await client.callTool({ name: 'get_spacing', arguments: {
      url: `${siteUrl}/app`, paths: [`${otherUrl}/app`], header: 'X-Secret: s', cookie: 'session=c' } });
    for (let i = 0; i < 120 && !seen.some((r) => r.at === 'other' && r.path === '/app'); i++) {
      await new Promise((r) => { setTimeout(r, 250); });
    }
  } finally {
    await client.close();
  }
  assert.equal(seen.find((r) => r.at === 'site' && r.path === '/app')?.secret, 's');
  assert.ok(seen.some((r) => r.at === 'other' && r.path === '/app'));
  assert.deepEqual(seen.filter((r) => r.at === 'other' && (r.secret || r.cookie)), []);
});
