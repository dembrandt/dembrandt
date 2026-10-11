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
