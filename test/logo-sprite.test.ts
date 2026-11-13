import assert from 'node:assert/strict';
import http from 'node:http';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractLogo } from '../lib/extractors/logo.js';

const page = (body: string) => `<!doctype html><html><body>${body}<main style="height:2000px">content</main></body></html>`;
const sprite = (symbol: string, use: string) => page(
  `<svg width="0" height="0" style="position:absolute">${symbol}</svg>` +
  `<header><a href="/"><svg class="logo" viewBox="0 0 200 40" width="200" height="40">${use}</svg></a></header>`,
);

const pages: Record<string, string> = {
  '/use-fill': sprite(
    '<symbol id="brand" viewBox="0 0 200 40"><rect width="200" height="40"/></symbol>',
    '<use href="#brand" fill="#cc0000"></use>',
  ),
  '/symbol-fill': sprite(
    '<symbol id="brand" viewBox="0 0 200 40" fill="#00aa00"><rect width="200" height="40"/></symbol>',
    '<use href="#brand"></use>',
  ),
  // Another svg on the page reuses the id the logo points at in its own defs.
  '/own-defs': page(
    '<div style="position:absolute;top:-100px"><svg width="10" height="10"><defs><circle id="a" cx="5" cy="5" r="5"/></defs><use href="#a"/></svg></div>' +
    '<header><a href="/"><svg class="logo" viewBox="0 0 200 40" width="200" height="40"><defs><rect id="a" width="200" height="40"/></defs><use href="#a"></use></svg></a></header>',
  ),
};

let browser: Browser | null = null;
let launchError: unknown = null;

before(async () => {
  try { browser = await chromium.launch(); } catch (e) { launchError = e; }
});
after(async () => { await browser?.close().catch(() => {}); });

async function logoFor(path: string) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(pages[req.url ?? ''] ?? '');
  });
  await new Promise<void>(r => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const tab = await browser!.newPage();
  try {
    const url = `http://localhost:${port}${path}`;
    await tab.goto(url, { waitUntil: 'load' });
    return (await extractLogo(tab, url)).logo;
  } finally {
    await tab.close();
    server.close();
  }
}

/** The RGBA at the centre of the saved logo, drawn on its own as an image. */
async function centerPixel(dataUri: string): Promise<number[]> {
  const tab = await browser!.newPage();
  try {
    return await tab.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 200, 40);
      return Array.from(ctx.getImageData(100, 20, 1, 1).data);
    }, dataUri);
  } finally {
    await tab.close();
  }
}

function skipIfNoBrowser(t: { skip: (m?: string) => void }): boolean {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return true; }
  return false;
}

test('a sprite logo carries the symbol it draws, so it renders on its own', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const logo = await logoFor('/use-fill');
  assert.doesNotMatch(logo.markup, /<use/);
  assert.deepEqual(await centerPixel(logo.dataUri), [204, 0, 0, 255], 'drawn in the fill set on <use>');
});

test('a sprite logo keeps the attributes of its symbol', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const logo = await logoFor('/symbol-fill');
  assert.deepEqual(await centerPixel(logo.dataUri), [0, 170, 0, 255], 'drawn in the fill set on <symbol>');
});

test('a logo that points at its own defs is left as it is', async (t) => {
  if (skipIfNoBrowser(t)) return;
  const logo = await logoFor('/own-defs');
  assert.match(logo.markup, /<use href="#a"/);
  assert.doesNotMatch(logo.markup, /<circle/);
});
