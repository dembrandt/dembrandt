import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHTML } from '../lib/formatters/brand-guide.js';

/**
 * buildHTML is a public subpath export (`dembrandt/brand-guide`) intended to be
 * fed adapted or partial token data (e.g. parsed from a design.md) by external
 * consumers. It must always return a printable standalone HTML document and
 * must never throw on malformed input.
 */

function isDocument(html: unknown): boolean {
  return typeof html === 'string'
    && html.startsWith('<!DOCTYPE')
    && html.includes('210mm')          // A4 print page
    && html.includes('</html>');
}

const MALFORMED: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['string', 'not an object'],
  ['number', 42],
  ['empty object', {}],
  ['non-url', { url: 'not-a-url' }],
  ['garbage date', { url: 'https://a.com', extractedAt: 'garbage' }],
  ['palette as object', { colors: { palette: { nope: true } } }],
  ['palette with nulls', { colors: { palette: ['#38BDF8', null, '#EA580C'] } }],
  ['semantic as string', { colors: { semantic: '#fff' } }],
  ['cssVariables with null entry', { colors: { cssVariables: { a: null, b: '#123456' } } }],
  ['styles not an array', { typography: { styles: {}, sources: { googleFonts: 'Inter' } } }],
];

for (const [name, input] of MALFORMED) {
  test(`buildHTML tolerates malformed input: ${name}`, () => {
    let html: string;
    assert.doesNotThrow(() => { html = buildHTML(input); });
    assert.ok(isDocument(html!), `expected a printable document for ${name}`);
  });
}

test('buildHTML renders a full result: domain, semantic color, and font', () => {
  const html = buildHTML({
    url: 'https://acme.test',
    siteName: 'Acme',
    extractedAt: '2026-07-11',
    colors: {
      semantic: { primary: '#EA580C' },
      palette: [{ color: '#38BDF8', confidence: 'high' }],
    },
    typography: {
      styles: [{ family: 'Inter', weight: 400, size: '16px' }],
      sources: { googleFonts: ['Inter'] },
    },
  });
  assert.ok(isDocument(html));
  assert.match(html, /acme\.test/);
  assert.match(html, /Inter/);
});

test('buildHTML escapes hostile strings rather than reflecting them raw', () => {
  const html = buildHTML({ url: 'https://x.test', siteName: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('buildHTML accepts bare color strings in the palette', () => {
  const html = buildHTML({ url: 'https://x.test', colors: { palette: ['#38BDF8', '#EA580C'] } });
  assert.ok(isDocument(html));
});
