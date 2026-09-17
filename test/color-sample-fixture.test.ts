import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

const BRAND = '#133174';
const SWATCH = ['#ea580c', '#38bdf8', '#16a34a', '#eab308', '#a855f7'];

function page_(body: string): string {
  return `<!doctype html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}</style></head>` +
    `<body style="background:#ffffff">${body}</body></html>`;
}

function hero(): string {
  return `<header class="hero" style="background:${BRAND};width:1200px;height:400px">` +
    `<button class="cta" style="background:${BRAND};width:180px;height:48px">Start</button></header>`;
}

function swatchStrip(): string {
  return `<div class="demo">` +
    SWATCH.map((c) => `<div style="background:${c};width:64px;height:64px"></div>`).join('') +
    `</div>`;
}

let browser: Browser | null = null;
let page: Page | null = null;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser?.close();
});

async function paletteOf(html: string) {
  await page!.setContent(html);
  const result = await extractColors(page!);
  return result.palette.map((entry) => String(entry.normalized ?? '').toLowerCase());
}

test('a swatch strip does not enter the palette', async () => {
  const palette = await paletteOf(page_(hero() + swatchStrip()));
  for (const swatch of SWATCH) {
    assert.ok(!palette.includes(swatch), `${swatch} is documentation, not brand colour`);
  }
  assert.ok(palette.includes(BRAND), 'the real brand colour survives');
});

test('a row of cards sharing one fill is not mistaken for a swatch strip', async () => {
  const cards = Array.from({ length: 5 }, () =>
    `<div class="card" style="background:${BRAND};width:64px;height:64px"></div>`).join('');
  const palette = await paletteOf(page_(`<div class="grid">${cards}</div>`));
  assert.ok(palette.includes(BRAND), 'cards are real surfaces and keep their colour');
});

test('an element labelled with its own colour value is skipped', async () => {
  const labelled = `<div style="background:${SWATCH[0]};width:300px;height:80px">${SWATCH[0]}</div>`;
  const palette = await paletteOf(page_(hero() + labelled));
  assert.ok(!palette.includes(SWATCH[0]), 'a colour that names itself is a sample');
});

test('colours inside a code block are documentation', async () => {
  const snippet = `<pre><code style="color:${SWATCH[1]};display:block;width:400px;height:60px">` +
    `--brand: ${SWATCH[1]}</code></pre>`;
  const palette = await paletteOf(page_(hero() + snippet));
  assert.ok(!palette.includes(SWATCH[1]), 'a code sample is not chrome');
});

test('fewer than four equal blocks is too small a run to call a strip', async () => {
  const trio = SWATCH.slice(0, 3);
  const row = `<div class="grid">` +
    trio.map((c) => `<div class="card" style="background:${c};width:64px;height:64px"></div>`).join('') +
    `</div>`;
  const palette = await paletteOf(page_(hero() + row.repeat(4)));
  assert.ok(trio.every((c) => palette.includes(c)), 'three-wide rows stay in the palette');
});
