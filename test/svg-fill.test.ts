import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

const LOGO = '#ff00bf';
const ART = ['#13a5b1', '#e8c21a', '#5a2d91', '#d95f0e', '#1b9e77', '#7570b3'];

const cells = Array.from({ length: 300 }, () => '<i>x</i>').join('');
const art = ART.map((c, i) => `<rect x="${i * 60}" y="0" width="50" height="50" fill="${c}"/>`).join('');
const FIXTURE = `<!doctype html><html><body style="margin:0;background:#ffffff;color:#1d0c17">
<header><a href="/" aria-label="Home" style="color:${LOGO}"><svg width="64" height="32" viewBox="0 0 64 32"><path d="M0 0h64v32H0z" fill="currentColor"/></svg></a></header>
<svg width="420" height="300" viewBox="0 0 420 300">${art}</svg>
<section class="partners">${ART.map((c) => `<a class="partner-logo" href="#"><svg width="40" height="24"><rect width="40" height="24" fill="${c}"/></svg></a>`).join('').repeat(3)}</section>
<header><span class="logo-mark"><svg width="32" height="32"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff00bf"/></linearGradient></defs><rect width="32" height="32" fill="url(#g)"/></svg></span></header>
<div>${cells}</div></body></html>`;

let browser: Browser;
let page: Page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(FIXTURE, { waitUntil: 'load' });
});
after(async () => { await browser?.close().catch(() => {}); });

const hexes = async () => (await extractColors(page)).palette.map((c: { normalized: string }) => c.normalized.toLowerCase());

test('a logo painted by an SVG fill reaches the palette', async () => {
  assert.ok((await hexes()).includes(LOGO));
});

test('no palette entry comes from a paint server or is empty', async () => {
  const got = await hexes();
  assert.ok(got.every((h) => /^#[0-9a-f]{6}$/.test(h)), got.join(' '));
});

test('the fills of a large illustration and of a row of small partner logos stay out', async () => {
  const got = await hexes();
  assert.deepEqual(ART.filter((c) => got.includes(c)), []);
});

test('groups, definitions and clip shapes in a logo add no colour of their own', async () => {
  const grouped = await browser.newPage();
  try {
    await grouped.setContent(`<!doctype html><html><body style="margin:0;background:#ffffff;color:#1d0c17">
<header><a href="/" class="logo"><svg width="120" height="30" viewBox="0 0 120 30"><title>Brand</title><defs><clipPath id="c"><rect width="120" height="30"/></clipPath></defs><g clip-path="url(#c)"><g><path fill="${LOGO}" d="M0 0h120v30H0z"/></g></g></svg></a></header>
<div>${cells}</div></body></html>`, { waitUntil: 'load' });
    const got = (await extractColors(grouped)).palette.map((c: { normalized: string }) => c.normalized.toLowerCase());
    assert.ok(got.includes(LOGO), got.join(' '));
    assert.ok(!got.includes('#000000'), got.join(' '));
  } finally {
    await grouped.close();
  }
});
