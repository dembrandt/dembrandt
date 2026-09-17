import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractSpacing } from '../lib/extractors/spacing.js';

function doc(body: string, head = ''): string {
  return `<!doctype html><html><head><style>*{margin:0;padding:0}${head}</style></head>` +
    `<body>${body}</body></html>`;
}

function block(px: number, n: number): string {
  return Array.from({ length: n }, () => `<div style="padding-top:${px}px">x</div>`).join('');
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

async function scaleOf(html: string) {
  await page!.setContent(html);
  return await extractSpacing(page!);
}

test('a grid of eights reads as an 8px scale', async () => {
  const r = await scaleOf(doc(block(8, 10) + block(16, 10) + block(24, 8)));
  assert.equal(r.scaleType, '8px');
});

test('one stray multiple of eight does not make an 8px scale', async () => {
  const r = await scaleOf(doc(block(5, 10) + block(7, 10) + block(13, 10) + block(16, 1)));
  assert.equal(r.scaleType, 'custom');
});

test('a four-grid that is not an eight-grid reads as 4px', async () => {
  const r = await scaleOf(doc(block(4, 10) + block(12, 10) + block(20, 10)));
  assert.equal(r.scaleType, '4px');
});

test('a page with no positive spacing reports custom, not a grid', async () => {
  const r = await scaleOf(doc('<div>x</div>'));
  assert.equal(r.commonValues.length, 0);
  assert.equal(r.scaleType, 'custom');
});

test('rem is expressed against the root font size, not a hardcoded 16', async () => {
  const r = await scaleOf(doc(block(20, 4), 'html{font-size:10px}'));
  const twenty = r.commonValues.find((v) => v.numericValue === 20);
  assert.ok(twenty, 'expected the 20px value to be reported');
  assert.equal(twenty.rem, '2.00rem');
});
