import assert from 'node:assert/strict';
import http from 'node:http';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractLogo } from '../lib/extractors/logo.js';

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#0a84ff"/></svg>');
const OVER_CAP = Buffer.concat([SVG, Buffer.alloc(120_000, 0x20)]);

// Each route is one way a real asset refuses to be inlined.
const routes: Record<string, (res, req) => void> = {
  '/corp.png': (res) => { res.writeHead(200, { 'content-type': 'image/svg+xml', 'cross-origin-resource-policy': 'same-origin' }); res.end(SVG); },
  '/plain.png': (res) => { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(SVG); },
  '/huge.png': (res) => { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(OVER_CAP); },
  '/nottype.png': (res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>not an image</h1>'); },
  '/gone.png': (res) => { res.writeHead(404); res.end(); },
  // Echoes the request's Accept, so the page path and the node path only agree
  // when both negotiate identically.
  '/echo.png': (res, req) => { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(Buffer.concat([SVG, Buffer.from(String(req.headers.accept).slice(0, 20))])); },
  '/echocorp.png': (res, req) => { res.writeHead(200, { 'content-type': 'image/svg+xml', 'cross-origin-resource-policy': 'same-origin' }); res.end(Buffer.concat([SVG, Buffer.from(String(req.headers.accept).slice(0, 20))])); },
};

let browser: Browser | null = null;
let launchError: unknown = null;

before(async () => {
  try { browser = await chromium.launch(); } catch (e) { launchError = e; }
});
after(async () => { await browser?.close().catch(() => {}); });

async function logoFor(asset: string) {
  const body = `<!doctype html><html><head><meta property="og:image" content="/"></head><body><header>`
    + `<a href="/"><img class="logo" style="width:120px;height:40px" src="${asset}" alt="Acme"></a></header>`
    + `<main><h1>Acme</h1></main></body></html>`;
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); return; }
    const route = routes[path];
    if (!route) { res.writeHead(404); res.end(); return; }
    route(res, req);
  });
  await new Promise<void>(r => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const page = await browser!.newPage();
  try {
    const url = `http://localhost:${port}/`;
    await page.goto(url, { waitUntil: 'load' });
    return await extractLogo(page, url);
  } finally {
    await page.close();
    server.close();
  }
}

function skipIfNoBrowser(t: { skip: (m?: string) => void }): boolean {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return true; }
  return false;
}

test('an asset the page cannot read cross-origin is still inlined from node', async (t) => {
  if (skipIfNoBrowser(t)) return;
  // Cross-Origin-Resource-Policy blocks the in-page fetch; without the node
  // fallback the logo would ship as a hotlink no file:// report can load.
  const blocked = await logoFor('/corp.png');
  const plain = await logoFor('/plain.png');
  assert.ok(blocked.logo?.dataUri, 'a CORP-protected logo must still carry its bytes');
  assert.equal(blocked.logo.dataUri, plain.logo?.dataUri);
});

test('both fetch paths negotiate identically, so the bytes do not depend on which one won', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const viaPage = await logoFor('/echo.png');
  const viaNode = await logoFor('/echocorp.png');
  assert.ok(viaPage.logo?.dataUri);
  assert.equal(viaPage.logo.dataUri, viaNode.logo?.dataUri);
});

test('an oversized, mistyped or missing asset leaves the logo without bytes rather than failing', async (t) => {
  if (skipIfNoBrowser(t)) return;
  for (const asset of ['/huge.png', '/nottype.png', '/gone.png']) {
    const out = await logoFor(asset);
    assert.equal(out.logo?.source, 'img', `${asset}: the logo is still detected`);
    assert.equal(out.logo?.dataUri, undefined, `${asset}: must not be inlined`);
  }
});

test('an og:image pointing at the page root is not recorded as an image', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const out = await logoFor('/plain.png');
  assert.deepEqual(out.favicons.filter(f => f.type === 'og:image'), []);
});
