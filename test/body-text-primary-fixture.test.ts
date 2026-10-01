import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

// The colourful-colour fallback ranks by use, and the body text is the most used
// colour on any page. On a dark site with a cool off-white ink (#e2ecef) HSL
// saturation reads 0.29, so the ink cleared the bar and became the primary.
// What the body paints is its text and surface, never its brand.

const INK = '#e2ecef';
const BRAND = '#ea580c';

function page(): string {
  // As on the store: the ink fills the navigation and the cards' names; the orange
  // marks prices and a few links, less often.
  const copy = Array.from({ length: 16 }, () => `<a href="#">Competitor scans</a>`).join(' ');
  const marks = Array.from({ length: 8 }, () => `<a href="#" style="color:${BRAND}">Sale</a>`).join(' ');
  return `<!doctype html><html><head><style>*{margin:0;padding:0}a{color:inherit}</style></head>` +
    `<body style="background:#06090f;color:${INK}">${copy}${marks}</body></html>`;
}

let browser: Browser | null = null;
let p: Page | null = null;

before(async () => {
  browser = await chromium.launch();
  p = await browser.newPage();
});

after(async () => {
  await browser?.close();
});

test('the body text colour is never elected primary, however often it is used', async () => {
  await p!.setContent(page());
  const result = await extractColors(p!);
  const primary = String(result.semantic?.primary ?? '').toLowerCase();
  assert.ok(!primary.includes('226, 236, 239') && !primary.includes(INK), `the ink took the primary slot: ${primary}`);
  assert.ok(primary.includes('234, 88, 12') || primary.includes(BRAND), `expected the brand orange, got ${primary}`);
});

test('the body text colour is still reported as the text role', async () => {
  await p!.setContent(page());
  const result = await extractColors(p!);
  assert.match(String(result.semantic?.text ?? ''), /226, 236, 239/);
});

// The guard is for a near-grey ink. A brand that sets its body copy in its own dark
// colour (a navy publisher) must keep that colour in the running: that is the case
// #232 regressed on.
test('a coloured body ink that is the brand colour still competes for primary', async () => {
  const NAVY = '#133174';
  const copy = Array.from({ length: 16 }, () => `<a href="#">Read the issue</a>`).join(' ');
  const marks = Array.from({ length: 4 }, () => `<a href="#" style="color:#ca8a04">New</a>`).join(' ');
  await p!.setContent(`<!doctype html><html><head><style>*{margin:0;padding:0}a{color:inherit}</style></head>` +
    `<body style="background:#ffffff;color:${NAVY}">${copy}${marks}</body></html>`);
  const result = await extractColors(p!);
  const primary = String(result.semantic?.primary ?? '').toLowerCase();
  assert.ok(primary.includes('19, 49, 116') || primary.includes(NAVY), `the navy brand ink lost the slot: ${primary}`);
});
