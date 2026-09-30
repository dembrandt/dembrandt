import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

const SECTION = '#006666';
const SWATCH = '#aa3300';
const GREY_BAND = '#e8e8e8';

// 600 plain cells lift the count gate to 6, so every fill below is painted by too few elements to pass on count.
const cells = Array.from({ length: 600 }, () => '<i>x</i>').join('');
const FIXTURE = `<!doctype html><html><body style="margin:0;background:#ffffff;color:#111111">
<div class="band" style="background:${SECTION};height:220px"><b>Section</b></div>
<div class="band" style="background:${GREY_BAND};height:220px"><b>Grey</b></div>
<div class="tile" style="background:${SWATCH};width:40px;height:40px"></div>
<div>${cells}</div></body></html>`;

let browser: Browser;
let page: Page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(FIXTURE, { waitUntil: 'load' });
});
after(async () => { await browser?.close().catch(() => {}); });

const hexes = async () => (await extractColors(page)).palette.map((c: { normalized: string }) => c.normalized.toLowerCase());

test('a chromatic fill across a section reaches the palette though one element paints it', async () => {
  assert.ok((await hexes()).includes(SECTION));
});

test('a small chromatic fill painted once stays out', async () => {
  assert.ok(!(await hexes()).includes(SWATCH));
});

test('a large neutral band stays out', async () => {
  assert.ok(!(await hexes()).includes(GREY_BAND));
});
