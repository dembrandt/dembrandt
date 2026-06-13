import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHtmlReport } from '../lib/formatters/html.js';
import { computeDrift } from '../lib/drift.js';

/**
 * generateHtmlReport is a pure result -> string formatter. These assertions pin
 * the contract that makes it usable as a CI artifact: self-contained (no external
 * resources), correct escaping of untrusted extracted strings, and the drift
 * banner in Mode B. The report is the rendered HTML only — no embedded JSON
 * (dropped for size; the machine-readable form is --json-only).
 */

function fixture(overrides: any = {}): any {
  return {
    url: 'https://example.com/',
    extractedAt: '2026-06-13T00:00:00.000Z',
    meta: { schemaVersion: '1.1.0', dembrandtVersion: '0.18.0' },
    colors: {
      palette: [
        { color: '#133174', normalized: '#133174', count: 40, confidence: 'high' },
        { color: '#ff8800', normalized: '#ff8800', count: 8, confidence: 'medium' },
      ],
      semantic: { primary: '#133174' },
      cssVariables: {},
    },
    typography: { styles: [{ context: 'body', family: 'Inter, sans-serif', size: '16px', weight: 400 }], sources: {} },
    spacing: { scaleType: 'base-8', commonValues: [{ px: 16, display: '16px', count: 12 }] },
    borderRadius: { values: [{ value: '8px', count: 5, confidence: 'high' }] },
    borders: {},
    shadows: [{ shadow: '0 1px 2px rgba(0,0,0,.1)', count: 3, confidence: 'high' }],
    components: { buttons: [{ states: { default: { backgroundColor: '#133174', color: '#fff' } }, text: 'Go' }], inputs: [], links: [], badges: [] },
    breakpoints: [{ px: 768 }],
    iconSystem: [],
    frameworks: [{ name: 'Tailwind', confidence: 'high' }],
    ...overrides,
  };
}

test('renders a self-contained document with no external resources', () => {
  const html = generateHtmlReport(fixture());
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /example\.com/);
  assert.doesNotMatch(html, /<script\s+src=/i);
  assert.doesNotMatch(html, /<link\s/i);
  assert.doesNotMatch(html, /src="https?:/i);
  assert.doesNotMatch(html, /@import/i);
});

test('escapes untrusted extracted strings (no breakout into the document)', () => {
  const evil = '</style><img src=x onerror=alert(1)>';
  const html = generateHtmlReport(fixture({
    siteName: evil,
    colors: { palette: [{ color: evil, normalized: evil, count: 1, confidence: 'low' }], semantic: {}, cssVariables: {} },
  }));
  // The raw breakout sequence must never appear unescaped; the injected string
  // must render in its escaped form (the only legit </style> is the real one).
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /&lt;\/style&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('the summary header always shows a Consistency gauge + a counts caption', () => {
  // Consistency is always computable, so the header is always present; the
  // counts caption replaces the dropped (useless) Token-coverage gauge.
  const baseHtml = generateHtmlReport(fixture());
  assert.match(baseHtml, /class="gauges"/);
  assert.match(baseHtml, />Consistency</);
  assert.match(baseHtml, />Contrast</); // always-on, self-computed from colours
  assert.match(baseHtml, /class="counts"/);
  assert.match(baseHtml, /text style/); // honest count, not a score
  // Without WCAG data the Contrast gauge links to the findings, not a WCAG card.
  assert.doesNotMatch(baseHtml, /href="#wcag"/);
  // WCAG present → the Contrast gauge uses real pairs and links to the WCAG card.
  const wcag = generateHtmlReport(fixture({ wcag: [{ fg: '#000', bg: '#fff', ratio: 21, aa: true, aaLarge: true, aaa: true }] }));
  assert.match(wcag, /href="#wcag"/);
});

test('a CSS-only theme toggle is present (dark default, light when checked)', () => {
  const html = generateHtmlReport(fixture());
  assert.match(html, /id="theme"/);
  assert.match(html, /:root:has\(#theme:checked\)/);
  assert.match(html, /color-scheme:dark/); // default
});

test('findings drive the report: a contrast smell surfaces in the Findings card', () => {
  // A light primary fails AA on white → a Findings card with a warn badge.
  const html = generateHtmlReport(fixture({
    colors: { palette: [{ color: '#9aa0ff', normalized: '#9aa0ff', count: 5, confidence: 'high' }], semantic: { primary: '#9aa0ff' }, cssVariables: {} },
  }));
  assert.match(html, /id="findings"/);
  assert.match(html, /low contrast on white/);
});

test('Mode B renders a drift banner and a Drift gauge', () => {
  const base = fixture();
  const cand = fixture({ colors: { palette: [{ color: '#0a0a0a', normalized: '#0a0a0a', count: 40, confidence: 'high' }], semantic: {}, cssVariables: {} } });
  const drift = computeDrift(base, cand);
  const html = generateHtmlReport(cand, { drift });
  assert.match(html, /class="drift is-(drift|stable)"/);
  assert.match(html, />(DRIFT|STABLE)</);
  assert.match(html, />Drift</);
});
