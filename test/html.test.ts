import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHtmlReport } from '../lib/formatters/html.js';
import { computeDrift } from '../lib/drift.js';

/**
 * generateHtmlReport is a pure result -> string formatter. These assertions pin
 * the contract that makes it usable as a CI artifact: self-contained (no external
 * resources), correct escaping of untrusted extracted strings, an embedded
 * machine-readable payload that round-trips, and the drift banner in Mode B.
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

test('embeds a machine-readable payload that round-trips', () => {
  const html = generateHtmlReport(fixture());
  const m = html.match(/<script type="application\/json" id="dembrandt-data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'embedded data script present');
  const data = JSON.parse(m![1]);
  assert.equal(data.result.colors.palette.length, 2);
  assert.equal(data.drift, null);
});

test('escapes untrusted extracted strings (no script/style breakout)', () => {
  const evil = '</script><img src=x onerror=alert(1)>';
  const html = generateHtmlReport(fixture({ siteName: evil, colors: { palette: [{ color: evil, normalized: evil, count: 1, confidence: 'low' }], semantic: {}, cssVariables: {} } }));
  // The raw breakout sequence must never appear unescaped in the document.
  assert.doesNotMatch(html, /<img src=x onerror=/);
  // The embedded JSON must not contain a literal closing script tag.
  const m = html.match(/id="dembrandt-data">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.ok(!m![1].includes('</script>'));
});

test('Mode B renders a drift banner when a report is supplied', () => {
  const base = fixture();
  const cand = fixture({ colors: { palette: [{ color: '#0a0a0a', normalized: '#0a0a0a', count: 40, confidence: 'high' }], semantic: {}, cssVariables: {} } });
  const drift = computeDrift(base, cand);
  const html = generateHtmlReport(cand, { drift });
  assert.match(html, /class="drift is-(drift|stable)"/);
  assert.match(html, />(DRIFT|STABLE)</);
  const data = JSON.parse(html.match(/id="dembrandt-data">([\s\S]*?)<\/script>/)![1]);
  assert.equal(typeof data.drift.score, 'number');
});
