import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';
import { extractTypography } from '../lib/extractors/typography.js';
import type { TypographyStyle } from '../lib/types.js';

// Fixture-based extractor test: real chromium + page.setContent, no network.
// Both subjects here are invisible to a pure unit test because they read the
// CSSOM and layout geometry, which only exist in a live document.

const SURFACE = '#101014'; // one large fill: few elements, most of the painted area
const GLYPH = '#22cc88';   // many tiny fills: most of the elements, almost no area

const glyphs = Array.from({ length: 60 }, () =>
  `<span class="badge" style="display:inline-block;width:8px;height:8px;background:${GLYPH}">.</span>`
).join('');

const FIXTURE =
  `<!doctype html><html><head><style>` +
  `h1 { font-size: clamp(2rem, 5vw, 4rem); }` +
  `p.lead { font-size: calc(1rem + 0.5vw); }` +
  `p.fixed { font-size: 16px; }` +
  // Contested: a fluid rule and a static one both reach this element.
  `h2 { font-size: clamp(1.5rem, 3vw, 2rem); }` +
  `h2.pinned { font-size: 20px; }` +
  `</style></head>` +
  `<body style="margin:0"><div class="hero" style="width:1200px;height:700px;background:${SURFACE}">` +
  `<h1>Fluid heading</h1>` +
  `<p class="lead">Lead copy that scales with the viewport width.</p>` +
  `<p class="fixed">Body copy pinned to sixteen pixels on every viewport.</p>` +
  `<h2 class="pinned">Subheading a later rule pins to twenty pixels.</h2>` +
  `${glyphs}</div></body></html>`;

let browser: Browser | null = null;
let page: Page | null = null;
let launchError: unknown = null;

before(async () => {
  try {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(FIXTURE, { waitUntil: 'load' });
  } catch (e) {
    launchError = e;
  }
});

after(async () => {
  await browser?.close().catch(() => {});
});

function browserUnavailable(t: { skip: (m?: string) => void }): boolean {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return true; }
  return false;
}

test('clamp() and viewport-relative font sizes are flagged fluid', async (t) => {
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];
  const fluid = styles.filter((s) => s.isFluid);
  assert.equal(fluid.length, 2, `expected the clamp and calc(vw) styles, got ${JSON.stringify(styles)}`);
});

test('an element a static rule also reaches is not claimed fluid', async (t) => {
  // Selector evidence cannot resolve the cascade, so a contested element stays
  // unmarked rather than asserting a ramp that never renders.
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];
  const pinned = styles.find((s) => s.size.startsWith('20px'));
  assert.ok(pinned, `expected the 20px style to be extracted, got ${JSON.stringify(styles.map((s) => s.size))}`);
  assert.ok(!pinned.isFluid);
});

test('a size authored in px is not flagged fluid', async (t) => {
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];
  const fixed = styles.find((s) => s.size.startsWith('16px'));
  assert.ok(fixed, 'expected the 16px style to be extracted');
  assert.ok(!fixed.isFluid);
});

test('one large fill outweighs many small ones by area, not by element count', async (t) => {
  if (browserUnavailable(t)) return;
  const { detected } = await extractColors(page!);
  const surface = detected.find((c: { normalized: string }) => c.normalized.toLowerCase() === SURFACE);
  const glyph = detected.find((c: { normalized: string }) => c.normalized.toLowerCase() === GLYPH);
  assert.ok(surface && glyph, 'expected both fills in the detected set');
  assert.ok(glyph.count > surface.count, 'the glyph colour must win on element count');
  assert.ok(surface.areaFrac > glyph.areaFrac, 'the surface must win on painted area');
});
