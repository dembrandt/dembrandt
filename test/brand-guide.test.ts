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
  ['font source urls with malformed percent-encoding', {
    typography: {
      styles: [{ family: 'Inter', weight: 400, size: '16px' }],
      sources: { urls: ['https://fonts.example.com/inter%.woff2'] },
    },
  }],
  ['font source urls with non-string entries', {
    typography: {
      styles: [{ family: 'Inter', weight: 400, size: '16px' }],
      sources: { urls: [null, 42, {}] },
    },
  }],
  ['meta.timeouts not an array', { meta: { timeouts: 'Body content rendering' } }],
  ['meta.crawl missing pagesFound', { meta: { crawl: { technique: 'sitemap' } } }],
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

test('buildHTML shows a font source url that matches the family exactly', () => {
  const html = buildHTML({
    url: 'https://x.test',
    typography: {
      styles: [{ family: 'Inter', weight: 400, size: '16px' }],
      sources: { urls: ['https://fonts.gstatic.com/s/inter/v12/Inter-Regular.woff2'] },
    },
  });
  assert.match(html, /Inter-Regular\.woff2/);
});

test('buildHTML matches a font source url with a format code spliced into the filename', () => {
  // Real-world shape (hm.com): "HM Ampersand Regular" family, filename
  // "HMAmpersandW01-Regular-75537.ttf" — the "W01" breaks a plain substring
  // match, so the family words must be matched individually.
  const html = buildHTML({
    url: 'https://x.test',
    typography: {
      styles: [{ family: 'HM Ampersand Regular', weight: 400, size: '16px' }],
      sources: {
        urls: [
          'https://x.test/fonts/HMAmpersandW01-Bold-560f0.ttf',
          'https://x.test/fonts/HMAmpersandW01-Regular-75537.ttf',
        ],
      },
    },
  });
  assert.match(html, /HMAmpersandW01-Regular-75537\.ttf/);
  assert.ok(!html.includes('HMAmpersandW01-Bold-560f0.ttf'), 'must not match the Bold file for the Regular family');
});

test('buildHTML omits a font source url when nothing matches the family', () => {
  const html = buildHTML({
    url: 'https://x.test',
    typography: {
      styles: [{ family: 'Roboto', weight: 400, size: '16px' }],
      sources: { urls: ['https://fonts.example.com/some-other-face.woff2'] },
    },
  });
  assert.ok(!html.includes('some-other-face.woff2'));
});

test('buildHTML does not throw on a font source url with malformed percent-encoding', () => {
  let html: string;
  assert.doesNotThrow(() => {
    html = buildHTML({
      url: 'https://x.test',
      typography: {
        styles: [{ family: 'Inter', weight: 400, size: '16px' }],
        sources: { urls: ['https://fonts.example.com/inter%.woff2'] },
      },
    });
  });
  assert.ok(isDocument(html!));
});

test('buildHTML notes a requested-url redirect on the back cover', () => {
  const html = buildHTML({
    url: 'https://example.com/en-us',
    meta: { requestedUrl: 'https://example.com' },
  });
  assert.match(html, /Requested https:\/\/example\.com, redirected to https:\/\/example\.com\/en-us/);
});

test('buildHTML omits the redirect note when requestedUrl matches url', () => {
  const html = buildHTML({
    url: 'https://example.com',
    meta: { requestedUrl: 'https://example.com' },
  });
  assert.ok(!html.includes('redirected to'));
});

test('buildHTML shows crawl technique and page counts', () => {
  const html = buildHTML({
    url: 'https://x.test',
    meta: { crawl: { technique: 'sitemap', pagesRequested: 5, pagesFound: 3 } },
  });
  assert.match(html, /3 pages analyzed via sitemap \(5 requested\)/);
});

test('buildHTML omits the crawl note when pagesFound is missing', () => {
  const html = buildHTML({ url: 'https://x.test', meta: { crawl: { technique: 'sitemap' } } });
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('analyzed via'));
});

test('buildHTML flags timeouts as a data-completeness caveat', () => {
  const html = buildHTML({
    url: 'https://x.test',
    meta: { timeouts: ['Body content rendering', 'Main content selector'] },
  });
  assert.match(html, /2 timeouts during extraction: Body content rendering, Main content selector/);
  assert.match(html, /some values may be incomplete/);
});
