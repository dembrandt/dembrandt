import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inlineLogoForPdf, buildHTML } from '../lib/formatters/pdf.js';

const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');

function fakeFetch(status = 200, contentType = 'image/png', body: Buffer = PNG_BYTES) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });
}

const base = { url: 'https://example.com', colors: { palette: [], semantic: {} } };

test('remote logo is inlined as a data URI', async () => {
  const data = { ...base, logo: { url: 'https://example.com/logo.png' } };
  const out = await inlineLogoForPdf(data, fakeFetch() as unknown as typeof fetch);
  assert.equal(out.logo.inline, true);
  assert.ok(out.logo.dataUri.startsWith('data:image/png;base64,'));
});

test('already-inline data URI logo passes through untouched', async () => {
  const data = { ...base, logo: { inline: true, dataUri: 'data:image/svg+xml;base64,PHN2Zz4=' } };
  let called = false;
  const out = await inlineLogoForPdf(data, (async () => { called = true; }) as unknown as typeof fetch);
  assert.equal(called, false);
  assert.equal(out, data);
});

test('favicon fallback URL is also inlined', async () => {
  const data = { ...base, favicons: [{ type: 'apple-touch-icon', url: 'https://example.com/apple-touch-icon.png' }] };
  const out = await inlineLogoForPdf(data, fakeFetch() as unknown as typeof fetch);
  assert.ok(out.logo.dataUri.startsWith('data:image/png;base64,'));
});

test('fetch failure drops the logo instead of leaving a broken remote URL', async () => {
  const data = { ...base, logo: { url: 'https://example.com/logo.png' }, favicons: [{ type: 'icon', url: 'https://example.com/favicon.png' }] };
  const out = await inlineLogoForPdf(data, fakeFetch(404) as unknown as typeof fetch);
  assert.equal(out.logo, undefined);
  assert.deepEqual(out.favicons, []);
  const html = buildHTML(out);
  assert.ok(!html.includes('https://example.com/logo.png'));
});

test('non-image content-type falls back to extension-derived type', async () => {
  const data = { ...base, logo: { url: 'https://example.com/logo.svg' } };
  const out = await inlineLogoForPdf(data, fakeFetch(200, 'text/plain') as unknown as typeof fetch);
  assert.ok(out.logo.dataUri.startsWith('data:image/svg+xml;base64,'));
});

test('rendered HTML embeds only the data URI, never the remote URL', async () => {
  const data = { ...base, logo: { url: 'https://example.com/logo.png' } };
  const out = await inlineLogoForPdf(data, fakeFetch() as unknown as typeof fetch);
  const html = buildHTML(out);
  assert.ok(html.includes('data:image/png;base64,'));
  assert.ok(!html.includes('src="https://example.com/logo.png"'));
});
