import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractVoice, DEFAULT_VOICE_CONFIG } from '../lib/extractors/voice.js';
import type { VoiceFragment, VoiceRole } from '../lib/types.js';

// Real chromium + page.setContent, no network. The pure metrics tests cannot
// reach any of this: hero detection depends on computed font size and layout
// position, and the exclusion / dedup rules only mean anything against a DOM.

// The hero headline sits in a nested grid, several levels away from its own
// paragraph. A sibling walk finds nothing here, which is the point.
const HERO = `
  <section style="padding:0;margin:0;min-height:820px">
    <div class="grid"><div class="col">
      <div class="stack"><h1 style="font-size:48px;margin:0">Extract any design system</h1></div>
    </div>
    <div class="col"><div class="stack">
      <p style="font-size:18px;margin:0">Real computed values pulled from the rendered page rather than the stylesheet source.</p>
    </div></div></div>
  </section>`;

const CONSENT = `
  <div class="cookie-banner" style="font-size:60px">
    <h2>We value your privacy</h2>
    <button>Accept all cookies</button>
  </div>`;

const HIDDEN = `<p aria-hidden="true" style="font-size:80px">Hidden decorative headline</p>`;

// The same CTA label three times: nav, hero, footer. Only one may survive.
const REPEATED_CTA = `
  <a class="btn" href="/a">Get started</a>
  <a class="btn" href="/b">Get started</a>`;

const BODY = `
  <header><nav>
    <a href="/product">Product</a><a href="/pricing">Pricing</a><a href="/docs">Docs</a>
    <a class="cta-link" href="/signup">Get started</a>
  </nav></header>
  ${CONSENT}
  ${HIDDEN}
  ${HERO}
  <main>
    <h2>Why teams choose us</h2>
    <p>We help design teams keep the implemented product aligned with the brand they actually intend to ship.</p>
    <h2>Trusted by engineering teams</h2>
    <blockquote>It replaced a week of manual DevTools work for our whole platform group.</blockquote>
    <p>The fastest way to audit a live interface, used by thousands of teams every month.</p>
    ${REPEATED_CTA}
    <form>
      <label for="email">Work email</label>
      <input id="email" type="email" placeholder="you@company.com">
    </form>
  </main>
  <footer><p>&copy; 2026 Example Oy. All rights reserved.</p></footer>`;

const FIXTURE =
  `<!doctype html><html lang="en"><head>` +
  `<title>Example — design system extraction</title>` +
  `<meta name="description" content="Extract design tokens from any website in one command.">` +
  `</head><body style="margin:0">${BODY}</body></html>`;

let browser: Browser;
let page: Page;
let fragments: VoiceFragment[];

const rolesIn = (list: VoiceFragment[]): Set<VoiceRole> => new Set(list.map((f) => f.role));
const textFor = (role: VoiceRole): string[] => fragments.filter((f) => f.role === role).map((f) => f.text);

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(FIXTURE, { waitUntil: 'domcontentloaded' });
  fragments = await extractVoice(page);
});

after(async () => {
  await browser?.close();
});

test('meta title and description are collected', () => {
  assert.deepEqual(textFor('meta-title'), ['Example — design system extraction']);
  assert.deepEqual(textFor('meta-description'), ['Extract design tokens from any website in one command.']);
});

test('hero headline is found across a nested grid, not by sibling walk', () => {
  assert.deepEqual(textFor('hero-h1'), ['Extract any design system']);
  const body = textFor('hero-body');
  assert.ok(body.length >= 1);
  assert.match(body[0], /Real computed values/);
});

test('consent banner is excluded despite the largest font on the page', () => {
  const all = fragments.map((f) => f.text).join(' | ');
  assert.doesNotMatch(all, /privacy/i);
  assert.doesNotMatch(all, /Accept all cookies/i);
});

test('aria-hidden content is excluded', () => {
  assert.doesNotMatch(fragments.map((f) => f.text).join(' | '), /Hidden decorative/);
});

test('a repeated CTA label survives exactly once across all roles', () => {
  const occurrences = fragments.filter((f) => f.text.toLowerCase() === 'get started');
  assert.equal(occurrences.length, 1, 'nav + hero + footer copies must collapse to one');
});

test('nav labels are collected and bounded in length', () => {
  const nav = textFor('nav-label');
  assert.ok(nav.includes('Product'));
  assert.ok(nav.includes('Pricing'));
  for (const label of nav) assert.ok(label.split(' ').length <= 5);
});

test('section headings are collected in document order', () => {
  assert.deepEqual(textFor('section-h2'), ['Why teams choose us', 'Trusted by engineering teams']);
});

test('value-claim roles pick up first-person claims, superlatives and testimonials', () => {
  const roles = rolesIn(fragments);
  assert.ok(roles.has('value-prop'), 'a "we help..." block is a value proposition');
  assert.ok(roles.has('claim'), '"fastest" / "used by thousands" is a claim');
  assert.ok(roles.has('social-proof'), 'a blockquote is social proof');
});

test('microcopy roles are collected separately from prose', () => {
  assert.deepEqual(textFor('form-label'), ['Work email']);
  assert.deepEqual(textFor('form-placeholder'), ['you@company.com']);
  assert.equal(textFor('footer-legal').length, 1);
  assert.match(textFor('footer-legal')[0], /All rights reserved/);
});

test('selectorHint is withheld by default and emitted on demand', async () => {
  for (const f of fragments) assert.equal(f.selectorHint, undefined);

  const debugged = await extractVoice(page, { ...DEFAULT_VOICE_CONFIG, debug: true });
  assert.ok(debugged.every((f) => typeof f.selectorHint === 'string' && f.selectorHint.length > 0));
});

test('per-role limits are never exceeded', () => {
  const counts = new Map<VoiceRole, number>();
  for (const f of fragments) counts.set(f.role, (counts.get(f.role) ?? 0) + 1);
  for (const [role, n] of counts) {
    assert.ok(n <= DEFAULT_VOICE_CONFIG.roleLimits[role], `${role}: ${n} exceeds its limit`);
  }
});

test('order is contiguous from zero within each role', () => {
  const byRole = new Map<VoiceRole, number[]>();
  for (const f of fragments) byRole.set(f.role, [...(byRole.get(f.role) ?? []), f.order]);
  for (const [role, orders] of byRole) {
    assert.deepEqual(orders, orders.map((_, i) => i), `${role} order must be 0..n-1`);
  }
});

test('errorPageOnly collects only the 404 roles', async () => {
  const errorPage = await extractVoice(page, { ...DEFAULT_VOICE_CONFIG, errorPageOnly: true });
  const roles = rolesIn(errorPage);
  for (const role of roles) assert.ok(role.startsWith('error-404-'), `${role} must not appear on a probe page`);
  assert.ok(roles.has('error-404-h1'));
});
