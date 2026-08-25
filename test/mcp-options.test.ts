import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SITEMAP_DEFAULT_PAGES,
  additionalPages,
  discoveryBudget,
  extractOptions,
  isMultiPage,
  launchArgs,
  pageBudget,
  resolvePaths,
} from '../lib/mcp/options.js';
import type { Extraction, ExtractionRequest } from '../lib/mcp/options.js';

const home = (overrides: Partial<Extraction> = {}): Extraction =>
  ({ url: 'https://example.com/', ...overrides }) as Extraction;

// ── launchArgs ─────────────────────────────────────────────────────────

test('launchArgs always disables the automation banner', () => {
  assert.deepEqual(launchArgs(false, {}), ['--disable-blink-features=AutomationControlled']);
});

test('launchArgs drops the sandbox on request', () => {
  assert.deepEqual(launchArgs(true, {}), [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ]);
});

test('launchArgs honours DEMBRANDT_NO_SANDBOX, so a container can be fixed without touching every call', () => {
  assert.ok(launchArgs(undefined, { DEMBRANDT_NO_SANDBOX: '1' }).includes('--no-sandbox'));
});

test('an empty DEMBRANDT_NO_SANDBOX does not disable the sandbox', () => {
  assert.ok(!launchArgs(undefined, { DEMBRANDT_NO_SANDBOX: '' }).includes('--no-sandbox'));
});

// ── extractOptions ─────────────────────────────────────────────────────

test('extractOptions stamps the tool version, which the DTCG provenance block reads back', () => {
  assert.equal(extractOptions({}, '9.9.9')._version, '9.9.9');
});

test('extractOptions normalises absent booleans instead of forwarding undefined', () => {
  const opts = extractOptions({}, '1.0.0');
  assert.deepEqual(
    { slow: opts.slow, darkMode: opts.darkMode, mobile: opts.mobile, wcag: opts.wcag },
    { slow: false, darkMode: false, mobile: false, wcag: false },
  );
});

test('extractOptions omits auth fields entirely when unset, so no empty header is sent', () => {
  const opts = extractOptions({}, '1.0.0');
  assert.ok(!('cookie' in opts));
  assert.ok(!('header' in opts));
  assert.ok(!('userAgent' in opts));
});

test('extractOptions forwards auth fields when set', () => {
  const opts = extractOptions({ cookie: 'a=b', header: 'Authorization: Bearer x', userAgent: 'ua' }, '1.0.0');
  assert.equal(opts.cookie, 'a=b');
  assert.equal(opts.header, 'Authorization: Bearer x');
  assert.equal(opts.userAgent, 'ua');
});

test('every crawled page reuses the first page options, so a merge cannot mix viewports', () => {
  const req: ExtractionRequest = { mobile: true, darkMode: true, slow: true, cookie: 'a=b' };
  assert.deepEqual(extractOptions(req, '1.0.0'), extractOptions(req, '1.0.0'));
});

// ── budgets ────────────────────────────────────────────────────────────

test('a bare request is single-page', () => {
  assert.equal(pageBudget({}), 0);
  assert.equal(isMultiPage({}), false);
  assert.equal(discoveryBudget({}), null);
});

test('pages counts the total, so the budget is one less', () => {
  assert.equal(pageBudget({ pages: 3 }), 2);
  assert.equal(discoveryBudget({ pages: 3 }), 2);
});

test('pages: 1 is explicitly single-page', () => {
  assert.equal(pageBudget({ pages: 1 }), 0);
  assert.equal(isMultiPage({ pages: 1 }), false);
});

test('sitemap alone crawls without an explicit budget rather than silently doing nothing', () => {
  assert.equal(pageBudget({ sitemap: true }), SITEMAP_DEFAULT_PAGES);
  assert.equal(isMultiPage({ sitemap: true }), true);
});

test('pages caps a sitemap crawl', () => {
  assert.equal(pageBudget({ sitemap: true, pages: 3 }), 2);
});

test('sitemap and explicit paths need no DOM discovery pass', () => {
  assert.equal(discoveryBudget({ sitemap: true }), null);
  assert.equal(discoveryBudget({ paths: ['/pricing'] }), null);
});

test('explicit paths set the budget themselves and ignore pages', () => {
  assert.equal(pageBudget({ paths: ['/a', '/b'], pages: 5 }), 2);
});

// ── resolvePaths ───────────────────────────────────────────────────────

test('resolvePaths accepts paths with and without a leading slash', () => {
  assert.deepEqual(resolvePaths('https://example.com/', ['/pricing', 'docs']), [
    'https://example.com/pricing',
    'https://example.com/docs',
  ]);
});

test('resolvePaths passes absolute URLs through untouched', () => {
  assert.deepEqual(resolvePaths('https://example.com/', ['https://other.test/x']), ['https://other.test/x']);
});

test('resolvePaths resolves against the landed URL, so a redirected host is honoured', () => {
  assert.deepEqual(resolvePaths('https://www.example.com/home', ['/pricing']), ['https://www.example.com/pricing']);
});

test('resolvePaths keeps the port of a local origin', () => {
  assert.deepEqual(resolvePaths('http://localhost:3000/', ['/about']), ['http://localhost:3000/about']);
});

// ── additionalPages ────────────────────────────────────────────────────

const noSitemap = async () => [];

test('a single-page request asks for no extra pages', async () => {
  assert.deepEqual(await additionalPages(home(), 'https://example.com/', {}, noSitemap), []);
});

test('explicit paths win over discovered links', async () => {
  const first = home({ _discoveredLinks: ['https://example.com/blog'] });
  assert.deepEqual(
    await additionalPages(first, 'https://example.com/', { paths: ['/pricing'] }, noSitemap),
    ['https://example.com/pricing'],
  );
});

test('discovered links are capped at the requested budget', async () => {
  const first = home({ _discoveredLinks: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'] });
  assert.deepEqual(await additionalPages(first, 'https://example.com/', { pages: 3 }, noSitemap), [
    'https://example.com/a',
    'https://example.com/b',
  ]);
});

test('a page that discovered nothing yields an empty crawl rather than throwing', async () => {
  assert.deepEqual(await additionalPages(home(), 'https://example.com/', { pages: 4 }, noSitemap), []);
});

test('a sitemap crawl reads the landed URL first', async () => {
  const seen: Array<[string, number]> = [];
  const fetchSitemap = async (url: string, max: number) => {
    seen.push([url, max]);
    return ['https://example.com/a'];
  };
  const pages = await additionalPages(home(), 'https://example.com/', { sitemap: true, pages: 4 }, fetchSitemap);
  assert.deepEqual(pages, ['https://example.com/a']);
  assert.deepEqual(seen, [['https://example.com/', 3]]);
});

test('a redirected site falls back to the requested URL when the landed one has no sitemap', async () => {
  const seen: string[] = [];
  const fetchSitemap = async (url: string) => {
    seen.push(url);
    return url === 'https://example.com' ? ['https://example.com/a'] : [];
  };
  const first = home({ url: 'https://www.example.com/' });
  const pages = await additionalPages(first, 'https://example.com', { sitemap: true }, fetchSitemap);
  assert.deepEqual(pages, ['https://example.com/a']);
  assert.deepEqual(seen, ['https://www.example.com/', 'https://example.com']);
});

test('the sitemap fallback is not re-fetched when both URLs are the same', async () => {
  let calls = 0;
  const fetchSitemap = async () => { calls += 1; return []; };
  assert.deepEqual(await additionalPages(home(), 'https://example.com/', { sitemap: true }, fetchSitemap), []);
  assert.equal(calls, 1);
});
