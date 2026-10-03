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

test('a "primary" element with no fill and no text of its own does not clear the primary found before it', async () => {
  const link = `<a class="nav-link nav-link--primary" style="background:${BRAND};color:#fff;padding:12px">Contact us</a>`;
  const wrapper = `<div class="card-button--primary" style="width:200px;height:60px"><span>Watch now</span></div>`;
  const primary = await primaryOf(doc(link + wrapper + ctas('#f2f2f2', 3)));
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND),
    `the brand fill read from the first primary element must survive, got ${primary}`);
});

test('the text colour inside a "primary" layout column is not the primary', async () => {
  const column = `<div class="layout__primary" style="width:600px"><p class="layout__primary" style="color:#ffcdcd">Release notes</p></div>`;
  const primary = await primaryOf(doc(column + ctas(BRAND, 3)));
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND),
    `a pale text colour in a primary-named column must not take the slot, got ${primary}`);
});

test('the fill most "primary" elements share wins, not the last one read; a textless chip and a dark variant do not vote', async () => {
  const buttons = Array.from({ length: 3 }, () => `<a class="button--primary" style="background:${BRAND};color:#fff;padding:12px">Start</a>`).join('');
  const panel = `<div class="panel-primary" style="background:#2563eb;color:#fff;width:400px">Plans</div>`;
  const chips = Array.from({ length: 5 }, () => `<span class="chip-primary" style="background:#16a34a;display:inline-block;width:24px;height:24px"></span>`).join('');
  const dark = Array.from({ length: 5 }, () => `<span class="bg-primary-dark" style="background:#7c2d12;color:#fff">x</span>`).join('');
  const primary = await primaryOf(doc(buttons + panel + chips + dark));
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND), `expected the shared button fill, got ${primary}`);
});

test('a near-black "primary" fill of the brand hue gives way to the bright one it is a variant of', async () => {
  const button = (bg: string) => `<a class="button --primary" style="background:${bg};color:#fff;padding:12px">Demo</a>`;
  const primary = await primaryOf(doc([...Array(6)].map(() => button('#0f1c14')).join('') + [...Array(3)].map(() => button('#19f578')).join('')));
  assert.ok(primary.includes('25, 245, 120'), `expected the bright green, got ${primary}`);
});

test('a submit input labels itself with its value and votes like a button', async () => {
  const inputs = [...Array(2)].map(() => `<input type="submit" class="btn btn-primary" value="Extract" style="background:${BRAND};color:#fff">`).join('');
  const primary = await primaryOf(doc(inputs));
  assert.ok(primary.includes('255, 84, 22') || primary.includes(BRAND), `expected the input fill, got ${primary}`);
});
