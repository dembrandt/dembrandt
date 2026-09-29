import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { waitForSettled } from '../lib/extractors/index.js';

const ATTRIBUTE_CHURN = `<!doctype html><html><body><div id="hero">Hero</div>
<script>setInterval(() => document.getElementById('hero').classList.toggle('on'), 50);</script>
</body></html>`;

const LATE_CONTENT = `<!doctype html><html><body>
<script>
  let n = 0;
  const t = setInterval(() => {
    document.body.appendChild(document.createElement('p')).textContent = 'row ' + n;
    if (++n === 10) clearInterval(t);
  }, 100);
</script></body></html>`;

let browser: Browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close().catch(() => {}); });

test('waitForSettled does not wait out the cap on a page that animates attributes forever', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(ATTRIBUTE_CHURN, { waitUntil: 'load' });
    const elapsed = await waitForSettled(page, 4000, 300);
    assert.ok(elapsed < 2000, `settled after ${elapsed}ms`);
  } finally {
    await page.close().catch(() => {});
  }
});

test('waitForSettled still waits for content that is still being added', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(LATE_CONTENT, { waitUntil: 'load' });
    await waitForSettled(page, 4000, 300);
    assert.equal(await page.locator('p').count(), 10);
  } finally {
    await page.close().catch(() => {});
  }
});
