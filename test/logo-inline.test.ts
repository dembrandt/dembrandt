import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateHtmlReport } from '../lib/formatters/html.js';
import { getLogoImageUrl } from '../lib/formatters/brand-guide.js';

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

function fixture(over = {}) {
  return { url: 'https://example.com', extractedAt: new Date().toISOString(), colors: { palette: [], semantic: {} }, typography: { styles: [], sources: {} }, ...over } as never;
}

test('the report uses inlined bytes, so a saved report does not hotlink the audited site', () => {
  const html = generateHtmlReport(fixture({
    logo: { source: 'img', url: 'https://example.com/logo.png', dataUri: DATA_URI },
    favicons: [{ type: 'icon', url: 'https://example.com/favicon.png', sizes: null, dataUri: DATA_URI }],
  }));
  assert.doesNotMatch(html, /src="https:\/\/example\.com\/logo\.png"/);
  assert.doesNotMatch(html, /src="https:\/\/example\.com\/favicon\.png"/);
  assert.equal(html.match(/src="data:image\/png/g)?.length, 2);
});

test('an asset whose bytes could not be inlined is dropped, not hotlinked', () => {
  const html = generateHtmlReport(fixture({
    logo: { source: 'img', url: 'https://example.com/logo.png', width: 200, height: 40 },
    favicons: [{ type: 'icon', url: 'https://example.com/favicon.png', sizes: null }],
  }));
  assert.doesNotMatch(html, /src="https?:/i);
  assert.match(html, /200×40/);
});

test('the brand guide prefers inlined bytes for any logo source, not just inline svg', () => {
  assert.equal(getLogoImageUrl({ logo: { source: 'img', url: 'https://example.com/logo.png', dataUri: DATA_URI } }), DATA_URI);
  assert.equal(getLogoImageUrl({ favicons: [{ type: 'apple-touch-icon', url: 'https://example.com/t.png', dataUri: DATA_URI }] }), DATA_URI);
});

test('a share image is not rendered as a 24px icon, so no hotlink is left behind', () => {
  const html = generateHtmlReport(fixture({
    favicons: [
      { type: 'icon', url: 'https://example.com/favicon.png', sizes: null, dataUri: DATA_URI },
      { type: 'og:image', url: 'https://example.com/og.png', sizes: null },
    ],
  }));
  assert.doesNotMatch(html, /example\.com\/og\.png/);
  assert.match(html, /src="data:image\/png/);
});
