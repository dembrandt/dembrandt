import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

/**
 * `color` and `border-color` both inherit, and an unset border-color resolves
 * to currentColor. So every element reports a text colour whether or not it
 * paints text, and a border colour whether or not it draws a border — and on an
 * anchor nobody styled, that colour is the browser's default link blue.
 *
 * rgb(0,0,238) was the most frequent semantic.primary across a 174-site corpus
 * before these two conditions landed. It is not a colour any brand chooses; it
 * is what a wrapper anchor reports when asked a question it has no answer to.
 */
const LINK_BLUE = '#0000ee';
const BRAND = '#133174';

let browser: Browser | null = null;
let page: Page | null = null;

before(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
after(async () => { await browser?.close(); });

async function paletteOf(body: string) {
  await page!.setContent(`<!doctype html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}</style></head>` +
    `<body style="background:#ffffff">${body}</body></html>`);
  const result = await extractColors(page!);
  return result.palette.map((e) => String(e.normalized ?? '').toLowerCase());
}

// A hero wrapped in an anchor: large, repeated, and painting nothing blue.
const wrappers = (n: number) => Array.from({ length: n }, () =>
  `<a href="/x" style="display:block;width:1200px;height:200px">` +
  `<div style="background:${BRAND};width:1200px;height:200px"></div></a>`).join('');

test('a wrapper anchor that paints no text does not donate the default link colour', async () => {
  const palette = await paletteOf(wrappers(8));
  assert.ok(!palette.includes(LINK_BLUE), 'the browser default is not a brand colour');
  assert.ok(palette.includes(BRAND), 'the fill the wrapper actually shows survives');
});

test('an anchor that really renders unstyled text still reports its colour', async () => {
  const links = Array.from({ length: 8 }, (_, i) =>
    `<a href="/p${i}" style="display:block;width:400px;height:24px">Read more</a>`).join('');
  const palette = await paletteOf(links);
  assert.ok(palette.includes(LINK_BLUE), 'a genuinely unstyled link is a real reading of the page');
});

test('a border colour is read only from an element that draws a border', async () => {
  const none = Array.from({ length: 8 }, () =>
    `<a href="/x" style="display:block;width:600px;height:60px;border-style:solid;border-width:0">` +
    `<div style="background:${BRAND};width:600px;height:60px"></div></a>`).join('');
  assert.ok(!(await paletteOf(none)).includes(LINK_BLUE), 'border-width 0 paints nothing');

  const drawn = Array.from({ length: 8 }, () =>
    `<a href="/x" style="display:block;width:600px;height:60px;border:2px solid">` +
    `<div style="background:${BRAND};width:600px;height:56px"></div></a>`).join('');
  assert.ok((await paletteOf(drawn)).includes(LINK_BLUE), 'a drawn currentColor border is on the page');
});
