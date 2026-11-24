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
    '0.0.0.0', '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:a00:1', '64:ff9b::7f00:1', 'not-an-ip']) {
    assert.equal(isPrivateAddress(a), true, a);
  }
});

test('ordinary addresses, and the neighbours of private ranges, are public', () => {
  for (const a of ['93.184.216.34', '8.8.8.8', '172.15.255.255', '172.32.0.1', '100.128.0.1', '169.253.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(a), false, a);
  }
});

const dns: Record<string, string[]> = {
  'site.test': ['93.184.216.34'], 'cdn.test': ['8.8.8.8'], 'inside.test': ['10.0.0.5'], 'mixed.test': ['8.8.8.8', '127.0.0.1'], 'none.test': [],
};
const resolve = async (h: string) => dns[h] ?? [];

async function attempt(url: string, pageUrl: string, redirects: Record<string, string> = {}) {
  const fetched: string[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit): Promise<Response> => {
    fetched.push(u);
    if (redirects[u] && init?.redirect !== 'manual' && fetched.length < 20) return fetchImpl(new URL(redirects[u], u).href, init);
    return redirects[u] ? new Response(null, { status: 302, headers: { location: redirects[u] } }) : new Response('ok');
  }) as unknown as typeof fetch;
  const error = await fetchFromPage(url, pageUrl, {}, { fetchImpl, resolve }).then(() => null, (e: Error) => e.message);
  return { fetched, error };
}

test('a public page may name a public host', async () => {
  assert.deepEqual(await attempt('https://cdn.test/a.png', 'https://site.test/'), { fetched: ['https://cdn.test/a.png'], error: null });
});

test('a public page may not name a private one, and the request is never made', async () => {
  for (const u of ['http://inside.test/', 'http://mixed.test/', 'http://none.test/', 'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/']) {
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
  assert.match((await attempt('https://cdn.test/a', 'https://site.test/', { 'https://cdn.test/a': 'https://cdn.test/a' })).error ?? '', /too many/);
});

test('a page on a private address may name private hosts', async () => {
  assert.equal((await attempt('http://inside.test/a.png', 'http://localhost.test/', {})).error, null);
  assert.equal((await attempt('http://127.0.0.1/a.png', 'http://10.0.0.5/', {})).error, null);
});

let browser: Browser;
let server: http.Server;
let local = '';
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
});
after(async () => { await browser?.close(); server?.close(); });
beforeEach(() => { nodeHits = []; type = 'image/png'; });

async function logoBytes(pageUrl: string) {
  const page = await browser.newPage();
  await page.setContent(`<link rel="icon" href="${local}/favicon.ico"><header><a href="/" class="logo"><img class="logo" alt="logo" width="120" height="40" src="${local}/logo.png"></a></header>`);
  const result = await extractLogo(page, pageUrl) as { logo?: { url?: string; dataUri?: string } };
  await page.close();
  assert.equal(result.logo?.url, `${local}/logo.png`);
  return result.logo?.dataUri ?? null;
}

test('the logo of a public page is not fetched from a private address', async () => {
  assert.equal(await logoBytes(PUBLIC), null);
  assert.deepEqual(nodeHits, []);
});

test('the logo of a locally served page still is', async () => {
  assert.match(await logoBytes(`${local}/`) ?? '', /^data:image\/png;base64,/);
  assert.ok(nodeHits.includes('/logo.png'));
});

test('bytes without an image content type are never inlined', async () => {
  type = undefined;
  assert.equal(await logoBytes(`${local}/`), null);
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
