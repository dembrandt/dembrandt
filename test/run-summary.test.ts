import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeFlags, pathSummary } from '../lib/run-summary.js';

/**
 * The closing-summary "what shaped this run" lines (DEM-99): which flags were
 * active and which paths were merged. Pinned here so the summary stays honest
 * as flags are added.
 */

test('activeFlags: no flags -> empty (no line printed)', () => {
  assert.deepEqual(activeFlags({}), []);
  assert.deepEqual(activeFlags(), []);
});

test('activeFlags: behaviour-only flags are surfaced (they write no file)', () => {
  assert.deepEqual(
    activeFlags({ darkMode: true, wcag: true, mobile: true, slow: true, stealth: true }),
    ['--dark-mode', '--mobile', '--slow', '--stealth', '--wcag'],
  );
});

test('activeFlags: artifact flags included alongside behaviour flags', () => {
  assert.deepEqual(
    activeFlags({ dtcg: true, saveOutput: true, html: '/tmp/r.html', compare: 'base.json', brandGuide: true, designMd: true, screenshot: '/tmp/s.png' }),
    ['--dtcg', '--save-output', '--html', '--compare', '--brand-guide', '--design-md', '--screenshot'],
  );
});

test('activeFlags: --html present with no value (true) still counts', () => {
  assert.deepEqual(activeFlags({ html: true }), ['--html']);
});

test('activeFlags: --crawl renders its count, bare flag has none', () => {
  assert.deepEqual(activeFlags({ crawl: 5 }), ['--crawl 5']);
  assert.deepEqual(activeFlags({ crawl: true }), ['--crawl']);
  assert.deepEqual(activeFlags({ crawl: null }), []);
  assert.deepEqual(activeFlags({ crawl: false }), []);
});

test('activeFlags: --browser only when non-default; --no-sandbox only when false', () => {
  assert.deepEqual(activeFlags({ browser: 'chromium' }), []);
  assert.deepEqual(activeFlags({ browser: 'firefox' }), ['--browser firefox']);
  assert.deepEqual(activeFlags({ sandbox: false }), ['--no-sandbox']);
  assert.deepEqual(activeFlags({ sandbox: true }), []);
});

test('pathSummary: explicit paths are listed (they are positional, not flags)', () => {
  assert.deepEqual(pathSummary(['/recipes', '/pricing'], 3), ['/recipes', '/pricing', '(3 pages merged)']);
});

test('pathSummary: crawl/sitemap have no explicit paths, just the merged count', () => {
  assert.deepEqual(pathSummary([], 2), ['(2 pages merged)']);
  assert.deepEqual(pathSummary(undefined, 4), ['(4 pages merged)']);
});

test('pathSummary: single page -> nothing (no merge happened)', () => {
  assert.deepEqual(pathSummary(undefined, 1), []);
  assert.deepEqual(pathSummary([], 0), []);
});
