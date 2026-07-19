import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { dismissConsent } from '../lib/extractors/consent.js';

// The two banner placements the old main-document-only pass could not reach:
// an open shadow root, and a child iframe. Each fixture marks window.__accepted
// on click so the assertion is on the click actually landing, not on the
// returned label.

const SHADOW_FIXTURE = `<!doctype html><html><body>
<div id="host"></div>
<script>
  window.__accepted = false;
  const root = document.getElementById('host').attachShadow({ mode: 'open' });
  root.innerHTML =
    '<div style="position:fixed;inset:auto 0 0 0;height:120px;background:#222">' +
    '<p>We use cookies</p>' +
    '<button id="uc-btn-accept-banner">Accept All</button></div>';
  root.getElementById('uc-btn-accept-banner')
      .addEventListener('click', () => { window.__accepted = true; });
</script></body></html>`;

const IFRAME_INNER = `<!doctype html><html><body style="margin:0">
<div style="height:100px;background:#111;color:#fff">
  <p>This site uses cookies for consent purposes</p>
  <button class="message-button">Yes, I accept</button>
</div>
<script>
  document.querySelector('.message-button')
    .addEventListener('click', () => { document.title = 'accepted'; });
</script></body></html>`;

const IFRAME_FIXTURE = `<!doctype html><html><body>
<h1>Site content</h1>
<iframe id="sp_message_iframe_1" style="position:fixed;inset:0;width:100%;height:200px"
        srcdoc="${IFRAME_INNER.replace(/"/g, '&quot;')}"></iframe>
</body></html>`;

// A plain page with a "Continue" button and no consent language: the text
// fallback must not fire here, or every site with a CTA gets a phantom click.
const DECOY_FIXTURE = `<!doctype html><html><body>
<h1>Pricing</h1>
<button id="cta" onclick="window.__accepted = true">Continue</button>
<script>window.__accepted = false;</script></body></html>`;

// Consent UI offering reject first — the sweep must never take that path.
const REJECT_FIRST_FIXTURE = `<!doctype html><html><body>
<div class="cky-consent-bar">
  <p>We use cookies to improve your experience</p>
  <button id="no" onclick="window.__rejected = true">Reject all</button>
  <button class="cky-btn-accept" onclick="window.__accepted = true">Accept all</button>
</div>
<script>window.__accepted = false; window.__rejected = false;</script></body></html>`;

let browser: Browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close().catch(() => {}); });

test('dismissConsent pierces an open shadow root', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(SHADOW_FIXTURE, { waitUntil: 'load' });
    // The button exists only inside the shadow root, so any hit at all proves
    // the walk pierced it; which selector matched first is not the contract.
    assert.notEqual(await dismissConsent(page), null);
    assert.equal(await page.evaluate(() => (window as any).__accepted), true);
  } finally {
    await page.close().catch(() => {});
  }
});

test('dismissConsent reaches a banner inside a child iframe', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(IFRAME_FIXTURE, { waitUntil: 'load' });
    const hit = await dismissConsent(page);
    assert.equal(hit, 'frame:.message-button');
    const inner = page.frames().find((f) => f !== page.mainFrame());
    assert.equal(await inner!.title(), 'accepted');
  } finally {
    await page.close().catch(() => {});
  }
});

test('dismissConsent leaves a non-consent page alone', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(DECOY_FIXTURE, { waitUntil: 'load' });
    assert.equal(await dismissConsent(page), null);
    assert.equal(await page.evaluate(() => (window as any).__accepted), false);
  } finally {
    await page.close().catch(() => {});
  }
});

test('dismissConsent accepts rather than rejects', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(REJECT_FIRST_FIXTURE, { waitUntil: 'load' });
    assert.notEqual(await dismissConsent(page), null);
    assert.equal(await page.evaluate(() => (window as any).__accepted), true);
    assert.equal(await page.evaluate(() => (window as any).__rejected), false);
  } finally {
    await page.close().catch(() => {});
  }
});
