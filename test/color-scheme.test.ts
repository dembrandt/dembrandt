import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { switchToDark } from '../lib/extractors/color-scheme.js';

let browser: Browser | null = null;
let page: Page | null = null;

before(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
after(async () => { await browser?.close(); });

const bodyBg = () => page!.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('waits for a theme that switches late after the media change', async () => {
  await page!.emulateMedia({ colorScheme: 'light' });
  await page!.setContent(`<!doctype html><html><body style="background:#fdfdfd"><script>
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (e.matches) setTimeout(() => { document.body.style.background = '#131413'; }, 1200);
    });</script></body></html>`);
  await switchToDark(page!, 3000, 0);
  assert.equal(await bodyBg(), 'rgb(19, 20, 19)');
});

test('returns at the cap on a site with no dark theme', async () => {
  await page!.emulateMedia({ colorScheme: 'light' });
  await page!.setContent('<!doctype html><html><body style="background:#fdfdfd"></body></html>');
  const start = Date.now();
  await switchToDark(page!, 300, 0);
  assert.equal(await bodyBg(), 'rgb(253, 253, 253)');
  assert.ok(Date.now() - start < 2000);
});
