import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

const INK = '#1d0c17';
const CTA = '#820076';
const NAVY = '#091723';
const CORAL = '#ff4f40';

// Running text in a near-black ink with a faint hue, and a chromatic fill two calls to action share. Their
// class names are generated hashes, so nothing but their shape says they are buttons.
const copy = Array.from({ length: 40 }, (_, i) => `<p class="primary-text">Paragraph ${i} of body copy.</p>`).join('');
const INK_PAGE = `<!doctype html><html><body style="margin:0;background:#ffffff;color:${INK}">
<header><a class="primary" href="#" style="color:${INK}">Home</a></header>${copy}
<a class="sc-38fb062f-42" href="#" style="display:inline-block;background:${CTA};color:#fff;padding:12px">Get a ride</a>
<a class="sc-38fb062f-42" href="#" style="display:inline-block;background:${CTA};color:#fff;padding:12px">Sign up</a>
</body></html>`;

// A dark navy that is itself the fill of the calls to action, beside a chromatic accent.
const NAVY_PAGE = `<!doctype html><html><body style="margin:0;background:#ffffff;color:#222222">${copy}
<a class="btn" style="display:inline-block;background:${NAVY};color:#fff;padding:12px">Open account</a>
<a class="btn" style="display:inline-block;background:${NAVY};color:#fff;padding:12px">Log in</a>
<a class="btn" style="display:inline-block;background:${NAVY};color:#fff;padding:12px">Download</a>
<span class="badge" style="background:${CORAL};color:#fff">New</span>
</body></html>`;

let browser: Browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close().catch(() => {}); });

async function primaryOf(html: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const { semantic } = await extractColors(page);
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(semantic.primary ?? '');
    return m ? '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('') : String(semantic.primary).toLowerCase();
  } finally { await page.close().catch(() => {}); }
}

test('an ink painted only as text loses the primary to a fill the calls to action share', async () => {
  assert.equal(await primaryOf(INK_PAGE), CTA);
});

test('a dark colour that is itself the calls-to-action fill stays the primary', async () => {
  assert.equal(await primaryOf(NAVY_PAGE), NAVY);
});
