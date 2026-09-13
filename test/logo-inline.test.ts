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

test('an asset that could not be fetched still renders from its url', () => {
  const html = generateHtmlReport(fixture({
    logo: { source: 'img', url: 'https://example.com/logo.png' },
    favicons: [{ type: 'icon', url: 'https://example.com/favicon.png', sizes: null }],
  }));
  assert.match(html, /src="https:\/\/example\.com\/logo\.png"/);
  assert.match(html, /src="https:\/\/example\.com\/favicon\.png"/);
});

test('the brand guide prefers inlined bytes for any logo source, not just inline svg', () => {
  assert.equal(getLogoImageUrl({ logo: { source: 'img', url: 'https://example.com/logo.png', dataUri: DATA_URI } }), DATA_URI);
  assert.equal(getLogoImageUrl({ favicons: [{ type: 'apple-touch-icon', url: 'https://example.com/t.png', dataUri: DATA_URI }] }), DATA_URI);
});
