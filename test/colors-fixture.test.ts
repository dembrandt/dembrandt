import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

// Fixture-based extractor test (DEM-68): real chromium + page.setContent, no
// network, deterministic. Pins the recall-vs-precision behaviour of the card /
// badge / ancestor-lift / structural changes against an actual DOM, which the
// pure color-heuristics unit tests cannot exercise (they don't run the scan).
//
// The fixture is built so each asserted colour clears the palette count gate
// (>= 3 elements) for the RIGHT reason, leaving the structural classifier and
// status filter as the actual subject under test.

const GREY = '#ededed';   // neutral layout fill on a majority of elements -> structural, must be EXCLUDED
const BADGE = '#bf1dba';  // vivid badge background -> survives only because 'badge' is no longer a status context
const ACCENT = '#542087'; // vivid text on a silent-class span deep inside a .benefit-card -> survives only via ancestor lift

// 20 neutral layout cells: pushes GREY above the >40% structural-usage line.
const greyCells = Array.from({ length: 20 }, () => `<div class="col" style="background:${GREY}">x</div>`).join('');
// 4 cards, each with a vivid accent on a context-silent <span> and a vivid badge.
const card = `<div class="benefit-card">` +
  `<span class="copy" style="color:${ACCENT}">accent</span>` +
  `<span class="badge" style="background:${BADGE};color:#ffffff">New</span>` +
  `</div>`;
const cards = Array.from({ length: 4 }, () => card).join('');
const FIXTURE =
  `<!doctype html><html><body style="margin:0;background:#ffffff;color:#111111">` +
  `<div class="layout">${greyCells}</div><main>${cards}</main></body></html>`;

let browser: Browser | null = null;
let page: Page | null = null;
let launchError: unknown = null;

before(async () => {
  try {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(FIXTURE, { waitUntil: 'load' });
  } catch (e) {
    launchError = e; // browser binary absent in this env -> surface, don't silently pass
  }
});

after(async () => {
  await browser?.close().catch(() => {});
});

async function paletteHexes(): Promise<string[]> {
  const { palette } = await extractColors(page!);
  return palette.map((c: { normalized: string }) => c.normalized.toLowerCase());
}

// Skip (visibly, never silently pass) when the chromium binary is absent — e.g.
// a browser-less `npm test`. CI installs the browser, so these assert there.
function browserUnavailable(t: { skip: (m?: string) => void }): boolean {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return true; }
  return false;
}

test('vivid badge background survives (badge is not a status context)', async (t) => {
  if (browserUnavailable(t)) return;
  const hexes = await paletteHexes();
  assert.ok(hexes.includes(BADGE), `expected ${BADGE} in palette, got ${hexes.join(' ')}`);
});

test('vivid accent on a silent span deep inside a card survives via ancestor lift', async (t) => {
  if (browserUnavailable(t)) return;
  const hexes = await paletteHexes();
  assert.ok(hexes.includes(ACCENT), `expected ${ACCENT} in palette, got ${hexes.join(' ')}`);
});

test('neutral layout fill on a majority of elements is filtered as structural', async (t) => {
  if (browserUnavailable(t)) return;
  const hexes = await paletteHexes();
  assert.ok(!hexes.includes(GREY), `expected ${GREY} filtered as structural, got ${hexes.join(' ')}`);
});
