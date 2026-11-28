import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractInputStyles } from '../lib/extractors/components.js';

let browser: Browser | null = null;
let launchError: unknown = null;
before(async () => { try { browser = await chromium.launch(); } catch (e) { launchError = e; } });
after(async () => { await browser?.close().catch(() => {}); });

test('inputs that share a style keep every type they cover', async (t) => {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return; }
  const p = await browser!.newPage();
  const style = 'border:1px solid #ccc;border-radius:6px;padding:8px;height:40px;box-sizing:border-box';
  await p.setContent(`<!doctype html><body><form>` +
    ['email', 'password', 'search', 'email'].map((type) => `<input type="${type}" style="${style}">`).join('') +
    `</form></body>`);
  const inputs = await extractInputStyles(p);
  await p.close();
  assert.equal(inputs.text.length, 1);
  assert.deepEqual(inputs.text[0].types, ['email', 'password', 'search']);
});
