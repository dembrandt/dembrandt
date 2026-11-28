import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';
import { extractButtonStyles } from '../lib/extractors/components.js';

let browser: Browser | null = null;
let launchError: unknown = null;
before(async () => { try { browser = await chromium.launch(); } catch (e) { launchError = e; } });
after(async () => { await browser?.close().catch(() => {}); });

async function withPage<T>(html: string, fn: (p: import('playwright').Page) => Promise<T>): Promise<T> {
  const p = await browser!.newPage();
  try { await p.setContent(html, { waitUntil: 'load' }); return await fn(p); } finally { await p.close().catch(() => {}); }
}

test('a button with only a bottom border is still a button', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    Array.from({ length: 3 }, () => `<button class="btn-ghost" style="background:transparent;border:0;border-bottom:2px solid #1d3a8a;color:#1d3a8a;padding:8px 20px;height:40px;width:120px">Ghost</button>`).join('') +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  assert.ok(buttons.length > 0, 'ghost button dropped');
});

test('an svg element never contributes "[object" as a colour source', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const html = `<!doctype html><body style="margin:0;background:#fff"><div class="card">` +
    Array.from({ length: 4 }, () => `<svg class="icon" width="40" height="40"><text x="4" y="24" style="fill:#e8590c;color:#e8590c">A</text></svg>`).join('') +
    `</div></body>`;
  const { palette, detected } = await withPage(html, (p) => extractColors(p));
  for (const c of [...palette, ...detected]) for (const s of c.sources ?? []) assert.ok(!s.startsWith('[object'), `source ${s}`);
});

test('a button filled by a gradient is a filled button and keeps its gradient', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const html = `<!doctype html><body style="margin:0;background:#13111c"><main>` +
    `<a href="/new" style="display:inline-block;background-image:radial-gradient(#b301b3,#381dbd);border:0;border-radius:8px;color:#fff;padding:12px 24px">Deploy a new project</a>` +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  const cta = buttons.find((b) => b.text === 'Deploy a new project');
  assert.ok(cta, 'gradient-filled button dropped');
  assert.match(cta.states.default.backgroundImage ?? '', /radial-gradient/);
});

test('a link with a zero-size underline gradient is not a filled button', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    `<p><a href="/docs" style="display:inline-block;background-image:linear-gradient(currentColor,currentColor);background-size:0 2px;background-repeat:no-repeat;padding:6px 0;color:#111">our documentation</a></p>` +
    `<a href="/signup" style="display:inline-block;background:#1d4ed8;color:#fff;border-radius:8px;padding:12px 24px">Sign up</a>` +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  assert.equal(buttons[0]?.text, 'Sign up');
  assert.ok(!buttons.some((b) => b.text === 'our documentation'), 'underline link read as a button');
});

test('a gradient layer of zero size is not a fill, whichever layer it is', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    `<a href="/z" style="display:inline-block;background-image:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=),linear-gradient(rgb(1, 2, 3),rgb(4, 5, 6));background-size:16px 16px,0% 100%;background-repeat:no-repeat;border:0;padding:12px 24px;color:#111">Layered link</a>` +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  assert.ok(!buttons.some((b) => b.text === 'Layered link'));
});

test('layer and size lists split on top-level commas only', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    `<a href="/m" style="display:inline-block;background-image:url(${gif}),linear-gradient(red,blue);background-size:min(10px, 5%) 10px,0px 2px;background-repeat:no-repeat;border:0;padding:12px 24px;color:#111">Min link</a>` +
    `<a href="/q" style="display:inline-block;background-image:url('${gif}#a(b'),linear-gradient(red,blue);background-size:10px 10px,0px 2px;background-repeat:no-repeat;border:0;padding:12px 24px;color:#111">Quote link</a>` +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  assert.ok(!buttons.some((b) => b.text === 'Min link'), 'min() shifted the size list');
  assert.ok(!buttons.some((b) => b.text === 'Quote link'), 'a paren inside a quoted url merged the layers');
});

test('an escaped backslash before a closing quote ends the quoted url', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    `<a href="/e" style='display:inline-block;background-image:url("${gif}#\\\\"),linear-gradient(red,blue);background-size:10px 10px,0px 2px;background-repeat:no-repeat;border:0;padding:12px 24px;color:#111'>Escape link</a>` +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  assert.ok(!buttons.some((b) => b.text === 'Escape link'));
});

test('a thin or transparent gradient on a link is not a fill', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    `<a href="/docs" style="display:inline-block;background-image:linear-gradient(currentColor,currentColor);background-size:100% 1px;background-position:0 100%;background-repeat:no-repeat;padding:6px 0;color:#111">our documentation</a> ` +
    `<a href="/clear" style="display:inline-block;background-image:linear-gradient(transparent,transparent);padding:6px 0;color:#111">clear link</a> ` +
    `<a href="/signup" style="display:inline-block;background:#1d4ed8;color:#fff;border-radius:8px;padding:12px 24px">Sign up</a>` +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  assert.equal(buttons[0]?.text, 'Sign up');
  assert.ok(!buttons.some((b) => b.text === 'our documentation' || b.text === 'clear link'));
});


test('warm and wide-gamut gradients are visible fills', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const fills = ['linear-gradient(#ff7a00,#ffb800)', 'linear-gradient(red,orange)', 'linear-gradient(oklch(0.7 0.2 40),oklch(0.6 0.25 20))', 'linear-gradient(color(display-p3 1 0.4 0),color(display-p3 1 0.7 0))'];
  const html = `<!doctype html><body style="margin:0;background:#fff"><main>` +
    fills.map((f, i) => `<a href="/${i}" style="display:inline-block;background-image:${f};border:0;border-radius:8px;color:#fff;padding:12px 24px">Fill ${i}</a> `).join('') +
    `</main></body>`;
  const buttons = await withPage(html, (p) => extractButtonStyles(p));
  for (let i = 0; i < fills.length; i++) assert.ok(buttons.some((b) => b.text === `Fill ${i}` && b.states.default.backgroundImage), fills[i]);
});
