import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractWcagPairs } from '../lib/extractors/colors.js';

// Fixture-based extractor test: real chromium + page.setContent, no network.
// The size-threshold and exemption logic lives inside page.evaluate, so the
// pure wcagVerdict / isLargeScale unit tests cannot reach it.
//
// One colour per case: entries are keyed by (fg, bg, size class), so two cases
// sharing a colour would collapse into one entry and prove nothing.
const FG = '#767676';       // 4.54:1 on white, used at both sizes
const BOLD = '#949494';     // on 14px bold: large only if the threshold is read in px
const LOGOUT = '#8a8a8a';   // on .logout, which [class*=logo] would wrongly exempt
const WRAP = '#999999';     // on a wrapper whose text lives in a child
const EXEMPT = '#aaaaaa';   // only ever inside markup 1.4.3 exempts
const INBAR = '#8f8f8f';    // a nav link inside a .logo-bar wrapper, not a logotype
const BARLOGO = '#8d8d8d';  // the actual logotype inside that wrapper, exempt

const FIXTURE =
  `<!doctype html><html><body style="margin:0;background:#ffffff">` +
  `<p style="color:${FG};font-size:16px">body</p>` +
  `<h1 style="color:${FG};font-size:32px">heading</h1>` +
  `<p style="color:${BOLD};font-size:14px;font-weight:700">bold but not large</p>` +
  `<div class="site-logo"><span style="color:${EXEMPT};font-size:16px">Acme</span></div>` +
  `<button disabled style="color:${EXEMPT};font-size:16px">disabled</button>` +
  `<p aria-hidden="true" style="color:${EXEMPT};font-size:16px">hidden</p>` +
  `<a class="logout" style="color:${LOGOUT};font-size:16px">Log out</a>` +
  `<div style="color:${WRAP};font-size:16px"><span>wrapped</span></div>` +
  `<div class="logo-bar"><a class="logo" style="color:${BARLOGO};font-size:16px">Acme</a>` +
  `<a style="color:${INBAR};font-size:16px">Pricing</a></div>` +
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

type Pair = {
  fg: string; bg: string; ratio: number; count: number;
  large?: boolean; requiredAA?: number; passAA?: boolean; fontSize?: number; fontWeight?: number;
};

const of = (pairs: Pair[], fg: string) => pairs.filter(p => p.fg === fg.toLowerCase());

test('one colour pair splits into a body and a large entry, graded apart', async (t) => {
  if (browserUnavailable(t)) return;
  const pairs = await extractWcagPairs(page!) as Pair[];
  const both = of(pairs, FG);
  assert.equal(both.length, 2, `expected a body and a large entry, got ${JSON.stringify(both)}`);
  const body = both.find(p => !p.large)!;
  const large = both.find(p => p.large)!;
  assert.equal(body.requiredAA, 4.5);
  assert.equal(large.requiredAA, 3);
  assert.equal(body.fontSize, 16);
  assert.equal(large.fontSize, 32);
});

test('14px bold is not large scale: 1.4.3 wants 14pt, not 14px', async (t) => {
  if (browserUnavailable(t)) return;
  const pairs = await extractWcagPairs(page!) as Pair[];
  const bold = of(pairs, BOLD)[0];
  assert.ok(bold, 'expected the bold 14px pair to be reported');
  assert.equal(bold.large, false);
  assert.equal(bold.passAA, false);
});

test('1.4.3 exemptions drop logotype, disabled and aria-hidden text', async (t) => {
  if (browserUnavailable(t)) return;
  const pairs = await extractWcagPairs(page!) as Pair[];
  assert.deepEqual(of(pairs, EXEMPT), []);
});

test('"logout" is not a logotype', async (t) => {
  if (browserUnavailable(t)) return;
  const pairs = await extractWcagPairs(page!) as Pair[];
  assert.equal(of(pairs, LOGOUT).length, 1, 'expected the logout link to be checked, not exempted');
});

test('a wrapper whose text is rendered by a child is counted once', async (t) => {
  if (browserUnavailable(t)) return;
  const pairs = await extractWcagPairs(page!) as Pair[];
  const wrapped = of(pairs, WRAP);
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0].count, 1, 'the inner span only, not the div that wraps it');
});

test('a container named after the logo does not exempt the nav inside it', async (t) => {
  if (browserUnavailable(t)) return;
  const pairs = await extractWcagPairs(page!) as Pair[];
  assert.equal(of(pairs, INBAR).length, 1, 'a .logo-bar wrapper is not a logotype');
  assert.deepEqual(of(pairs, BARLOGO), [], 'the .logo element inside it still is');
});
