import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

// The rescue only fires when semantic.primary lands on a near-neutral. Two
// corpus sites sat just above the old 0.12 gate with their real brand colour
// already in the palette, so the gate, not the candidate bar, was the blocker.

const GREY = '#374151';
const BRAND = '#ff5416';

function doc(body: string, rootVars = ''): string {
  return `<!doctype html><html><head><style>:root{${rootVars}}` +
    `*{margin:0;padding:0;box-sizing:border-box}</style></head>` +
    `<body style="background:#ffffff">${body}</body></html>`;
}

/** A grey element whose class says "primary", which is how the neutral wins the slot. */
function neutralPrimary(): string {
  return `<div class="primary-surface" style="background:${GREY};width:1200px;height:500px">` +
    `<p style="color:#ffffff">Surface</p></div>`;
}

function ctas(color: string, n = 6): string {
  return Array.from({ length: n }, (_, i) =>
    `<button class="btn btn-cta" style="background:${color};color:#fff;width:${160 + i}px;height:48px">Go</button>`,
  ).join('');
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

async function primaryOf(html: string): Promise<string> {
  await page!.setContent(html);
  const result = await extractColors(page!);
  return String(result.semantic?.primary ?? '').toLowerCase();
}

test('a near-neutral primary is replaced by the recurring CTA colour', async () => {
  const primary = await primaryOf(doc(neutralPrimary() + ctas(BRAND)));
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND),
    `expected the brand orange to take the slot, got ${primary}`);
});

test('a declared brand token also rescues the slot', async () => {
  const primary = await primaryOf(
    doc(neutralPrimary() + ctas(BRAND, 1), `--brand-primary: ${BRAND};`),
  );
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND),
    `expected the declared token to take the slot, got ${primary}`);
});

test('a chromatic primary is left alone: the rescue never fires above the gate', async () => {
  const chromaticPrimary =
    `<div class="primary-surface" style="background:${BRAND};width:1200px;height:500px">x</div>`;
  const primary = await primaryOf(doc(chromaticPrimary + ctas('#16a34a')));
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND),
    `a brand-coloured primary must survive, got ${primary}`);
});

test('an accent with no token or CTA backing does not displace a neutral primary', async () => {
  const decoration = Array.from({ length: 4 }, () =>
    `<span style="background:#a855f7;display:inline-block;width:20px;height:20px"></span>`).join('');
  const primary = await primaryOf(doc(neutralPrimary() + decoration));
  assert.ok(!primary.includes('168, 85, 247'),
    `a merely chromatic accent is not a brand signal, got ${primary}`);
});
