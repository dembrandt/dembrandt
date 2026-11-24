import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, before, after, beforeEach } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { parseSitemap } from '../lib/discovery.js';
import { extractLogo } from '../lib/extractors/logo.js';
import { inlineLogoForPdf } from '../lib/formatters/pdf.js';
import { fetchFromPage, isPrivateAddress } from '../lib/public-fetch.js';

const PUBLIC = 'http://203.0.113.1/';

test('loopback, private, link-local, metadata, CGNAT and mapped addresses are private', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '10.255.0.1', '192.0.0.8', '224.0.0.251', '255.255.255.255', '::', '::1', '::127.0.0.1', 'fc00::1', 'fd12::1', 'fe80::1',
    'fec0::1', 'ff02::1', '2002:7f00:1::', '64:ff9b:1::1', '::ffff:127.0.0.1', '::ffff:a00:1', '64:ff9b::7f00:1', '64:ff9b::', 'not-an-ip']) {
    assert.equal(isPrivateAddress(a), true, a);
  }
});

test('ordinary addresses, and the neighbours of private ranges, are public', () => {
  for (const a of ['93.184.216.34', '8.8.8.8', '172.15.255.255', '172.32.0.1', '100.128.0.1', '169.253.0.1', '192.0.1.1', '198.18.0.7', '223.255.255.255',
    '2606:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
    assert.equal(isPrivateAddress(a), false, a);
  }
});

const dns: Record<string, string[]> = {
  'local.test': ['127.0.0.1', '::1'], 'nat64.test': ['8.8.8.8', '64:ff9b::808:808'], 'fakeip.test': ['198.18.0.7'], 'multicast.test': ['224.0.0.1'],
  'site.test': ['93.184.216.34'], 'cdn.test': ['8.8.8.8'], 'inside.test': ['10.0.0.5'], 'mixed.test': ['8.8.8.8', '127.0.0.1'], 'none.test': [],
};
const resolve = async (h: string) => dns[h] ?? [];

async function attempt(url: string, pageUrl: string, redirects: Record<string, string> = {}, init: RequestInit = {}) {
  const fetched: string[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit): Promise<Response> => {
    fetched.push(u);
    if (redirects[u] && init?.redirect !== 'manual' && fetched.length < 20) return fetchImpl(new URL(redirects[u], u).href, init);
    return redirects[u] ? new Response(null, { status: 302, headers: { location: redirects[u] } }) : new Response('ok');
  }) as unknown as typeof fetch;
  const error = await fetchFromPage(url, pageUrl, init, { fetchImpl, resolve }).then(() => null, (e: Error) => e.message);
  return { fetched, error };
}

test('a public page may name a public host', async () => {
  assert.deepEqual(await attempt('https://cdn.test/a.png', 'https://site.test/'), { fetched: ['https://cdn.test/a.png'], error: null });
});

test('a public page may not name a private one, and the request is never made', async () => {
  for (const u of ['http://inside.test/', 'http://multicast.test/', 'http://mixed.test/', 'http://none.test/', 'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/']) {
    const { fetched, error } = await attempt(u, 'https://site.test/');
    assert.match(error ?? '', /private address/, u);
    assert.deepEqual(fetched, [], u);
  }
});

test('a redirect to a private address is refused before it is followed', async () => {
  const { fetched, error } = await attempt('https://cdn.test/a', 'https://site.test/', {
    'https://cdn.test/a': '/b', 'https://cdn.test/b': 'http://169.254.169.254/latest',
  });
  assert.match(error ?? '', /private address/);
  assert.deepEqual(fetched, ['https://cdn.test/a', 'https://cdn.test/b']);
});

test('public redirects are followed, other schemes and loops are not', async () => {
  assert.equal((await attempt('https://cdn.test/a', 'https://site.test/', { 'https://cdn.test/a': 'https://site.test/b' })).error, null);
  assert.match((await attempt('https://cdn.test/a', 'https://site.test/', { 'https://cdn.test/a': 'file:///etc/passwd' })).error ?? '', /http and https/);
  const loop = await attempt('https://cdn.test/a', 'https://site.test/', { 'https://cdn.test/a': 'https://cdn.test/a' });
  assert.match(loop.error ?? '', /too many/);
  assert.equal(loop.fetched.length, 6);
});

test('a page on a private address may name private hosts', async () => {
  for (const pageUrl of ['http://local.test/', 'http://inside.test/', 'http://10.0.0.5/', 'http://[::1]:3000/']) {
    assert.equal((await attempt('http://127.0.0.1/a.png', pageUrl)).error, null, pageUrl);
  }
});

test('a page earns that only when every one of its addresses is local', async () => {
  for (const pageUrl of ['https://mixed.test/', 'https://none.test/', 'https://fakeip.test/', 'https://multicast.test/', 'https://nat64.test/']) {
    const { fetched, error } = await attempt('http://127.0.0.1/a.png', pageUrl);
    assert.match(error ?? '', /private address/, pageUrl);
    assert.deepEqual(fetched, [], pageUrl);
  }
});

test('names behind DNS64 and fake-ip VPNs are still public', async () => {
  for (const u of ['https://nat64.test/a.png', 'https://fakeip.test/a.png']) {
    assert.equal((await attempt(u, 'https://site.test/')).error, null, u);
  }
});

test('the caller\'s headers and signal reach every hop, and the signal covers the lookup', { timeout: 5000 }, async () => {
  const seen: RequestInit[] = [];
  const signal = new AbortController().signal;
  const fetchImpl = (async (u: string, init: RequestInit) => {
    seen.push(init);
    return u.endsWith('/a') ? new Response(null, { status: 302, headers: { location: '/b' } }) : new Response('ok');
  }) as unknown as typeof fetch;
  await fetchFromPage('https://cdn.test/a', 'https://site.test/', { headers: { accept: 'x' }, signal }, { fetchImpl, resolve });
  assert.deepEqual(seen.map((i) => [(i.headers as Record<string, string>).accept, i.signal === signal]), [['x', true], ['x', true]]);
  const stalled = fetchFromPage('https://cdn.test/a', 'https://site.test/', { signal: AbortSignal.timeout(50) },
    { fetchImpl, resolve: () => new Promise(() => {}) });
  await assert.rejects(stalled, { name: 'TimeoutError' });
});

let browser: Browser;
let server: http.Server;
let local = '';
let localPage = '';
let type: string | undefined;
let nodeHits: string[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

before(async () => {
  browser = await chromium.launch();
  server = http.createServer((req, res) => {
    if (!/Mozilla.*Chrome/.test(req.headers['user-agent'] ?? '')) nodeHits.push(req.url ?? '');
    if (req.url === '/sitemap.xml') return void res.end(`<urlset><url><loc>${local}/about</loc></url></urlset>`);
    res.writeHead(200, type ? { 'content-type': type } : {}).end(png);
  });
  await new Promise<void>((r) => { server.listen(0, '127.0.0.1', r); });
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  localPage = local.replace('127.0.0.1', '10.0.0.5') + '/';
});
after(async () => { await browser?.close(); server?.close(); });
beforeEach(() => { nodeHits = []; type = 'image/png'; });

async function logoBytes(pageUrl: string, requestedUrl = pageUrl) {
  const page = await browser.newPage();
  const html = `<link rel="icon" href="${local}/favicon.ico"><header><a href="/" class="logo"><img class="logo" alt="logo" width="120" height="40" src="${local}/logo.png"></a></header>`;
  await page.route((u) => u.href === pageUrl, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(pageUrl);
  const result = await extractLogo(page, requestedUrl) as { logo?: { url?: string; dataUri?: string } };
  await page.close();
  assert.equal(result.logo?.url, `${local}/logo.png`);
  return result.logo?.dataUri ?? null;
}

test('the logo of a public page is not fetched from a private address', async () => {
  assert.equal(await logoBytes(PUBLIC), null);
  assert.deepEqual(nodeHits, []);
});

test('the logo of a locally served page still is', async () => {
  assert.match(await logoBytes(localPage) ?? '', /^data:image\/png;base64,/);
  assert.ok(nodeHits.includes('/logo.png'));
});

test('the page landed on decides, not the one asked for', async () => {
  assert.equal(await logoBytes(PUBLIC, localPage), null);
  assert.deepEqual(nodeHits, []);
  assert.match(await logoBytes(localPage, PUBLIC) ?? '', /^data:image\/png/);
});

test('bytes without an image content type are never inlined', async () => {
  type = undefined;
  assert.equal(await logoBytes(localPage), null);
  assert.ok(nodeHits.includes('/logo.png'));
});

test('the PDF logo follows the same rule', async () => {
  const data = (url: string) => ({ url, logo: { source: 'img', url: `${local}/logo.png` }, favicons: [] });
  assert.equal((await inlineLogoForPdf(data(PUBLIC))).logo, undefined);
  assert.deepEqual(nodeHits, []);
  assert.match((await inlineLogoForPdf(data(`${local}/`))).logo.dataUri, /^data:image\/png/);
});

test('a sitemap a public site declares on a private address is not fetched', async () => {
  assert.deepEqual(await parseSitemap(PUBLIC, 5, [`${local}/sitemap.xml`]), []);
  assert.deepEqual(nodeHits, []);
  assert.deepEqual(await parseSitemap(`${local}/`, 5, [`${local}/sitemap.xml`]), [`${local}/about`]);
});

test('the sitemaps an index points to follow the same rule', async () => {
  for (const index of ['index1', 'index2']) {
    const answers: Record<string, string> = {
      [`${PUBLIC}${index}.xml`]: `<sitemapindex><sitemap><loc>${PUBLIC}child.xml</loc></sitemap></sitemapindex>`,
      [`${PUBLIC}child.xml`]: index === 'index1' ? '' : `<sitemapindex><sitemap><loc>${PUBLIC}grandchild.xml</loc></sitemap></sitemapindex>`,
    };
    const asked: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (u: string) => {
      asked.push(String(u));
      const body = answers[String(u)];
      return body ? new Response(body) : new Response(null, { status: 302, headers: { location: `${local}/sitemap.xml` } });
    }) as unknown as typeof fetch;
    try {
      assert.deepEqual(await parseSitemap(PUBLIC, 5, [`${PUBLIC}${index}.xml`]), []);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(asked.at(-1), `${PUBLIC}${index === 'index1' ? 'child' : 'grandchild'}.xml`);
  }
});
