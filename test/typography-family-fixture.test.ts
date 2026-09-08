import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractTypography } from '../lib/extractors/typography.js';
import { extractColors } from '../lib/extractors/colors.js';
import type { TypographyStyle } from '../lib/types.js';

// Both subjects read the CSSOM against a live document, so they are invisible
// to a pure unit test: the font stack has to be resolved by a real browser and
// the class names have to reach a real cascade.

const FIXTURE =
  `<!doctype html><html><head><style>` +
  // A numerals-only face, declared the way tabular-figure fonts are.
  `@font-face { font-family: 'NumeralsOnly'; src: url(data:font/woff2;base64,AA) format('woff2'); unicode-range: U+30-39; }` +
  `@font-face { font-family: 'BrandSans'; src: url(data:font/woff2;base64,AA) format('woff2'); }` +
  // Split across subsets the way a font loader emits it: one face has no Latin,
  // and the family still renders letters through the other.
  `@font-face { font-family: 'BrandMono'; src: url(data:font/woff2;base64,AA) format('woff2'); unicode-range: U+0460-052F; }` +
  `@font-face { font-family: 'BrandMono'; src: url(data:font/woff2;base64,AA) format('woff2'); unicode-range: U+0000-00FF; }` +
  `body { font-family: 'NumeralsOnly', 'BrandSans', sans-serif; }` +
  `code, pre { font-family: 'BrandMono', monospace; font-size: 14px; }` +
  `.brand-primary { background: #00dc82; color: #fff; }` +
  // Transparent background, so the old code fell through to the text colour.
  `.foreground-primary { color: rgb(18, 23, 21); background: transparent; }` +
  `</style></head><body>` +
  `<h1>A heading rendered in the brand sans</h1>` +
  `<p>Body copy long enough for the extractor to keep it as a real style entry.</p>` +
  `<pre><code>const monospaced = "code sample";</code></pre>` +
  `<button class="brand-primary" style="width:200px;height:48px">Call to action</button>` +
  `<div class="foreground-primary" style="width:900px;height:500px">Text on a light surface</div>` +
  `</body></html>`;

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

test('a numerals-only face is not reported as the family that rendered the text', async (t) => {
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];

  for (const style of styles) {
    assert.notEqual(style.family, 'NumeralsOnly', `NumeralsOnly reported for ${style.context}`);
  }
  assert.ok(
    styles.some((s) => s.family === 'BrandSans'),
    `expected BrandSans, got ${JSON.stringify(styles.map((s) => s.family))}`,
  );
});

test('the family that was skipped is still listed as a fallback, not lost', async (t) => {
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];
  const sans = styles.find((s) => s.family === 'BrandSans');
  assert.ok(sans);
  assert.ok(sans.fallbacks?.includes('NumeralsOnly'));
});

test('a family is glyphless only when none of its subsets covers letters', async (t) => {
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];
  assert.ok(styles.some((s) => s.family === 'BrandMono'), 'a subsetted family must not be skipped');
});

test('a mono face used only in code blocks is extracted, under its own context', async (t) => {
  if (browserUnavailable(t)) return;
  const styles = (await extractTypography(page!)).styles as TypographyStyle[];
  const mono = styles.find((s) => s.family === 'BrandMono');
  assert.ok(mono, `expected BrandMono, got ${JSON.stringify(styles.map((s) => s.family))}`);
  assert.equal(mono.context, 'mono');
});

test('a role-qualified name does not win semantic.primary', async (t) => {
  if (browserUnavailable(t)) return;
  const { semantic } = await extractColors(page!);

  // `.foreground-primary` names the text on a surface, not the brand primary,
  // and it comes last in the DOM, where last-write-wins used to hand it the slot.
  assert.notEqual(semantic.primary, 'rgb(18, 23, 21)');
  assert.equal(semantic.primary, 'rgb(0, 220, 130)');
});
