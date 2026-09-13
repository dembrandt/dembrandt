import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDrift, logoIdentity } from '../lib/drift.js';
import type { BrandingResult as ExtractionResult, Logo } from '../lib/types.js';

const base = {
  url: 'https://example.com/',
  extractedAt: 't',
  colors: { palette: [], semantic: {}, cssVariables: {} },
  typography: { styles: [], sources: {} },
} as unknown as ExtractionResult;

const withLogo = (logo: Partial<Logo>): ExtractionResult => ({ ...base, logo: logo as Logo });
const logoChanges = (a: ExtractionResult, b: ExtractionResult) =>
  computeDrift(a, b).changes.filter(c => c.category === 'logo');

test('an image-optimizer URL rewritten by a deploy is the same logo', () => {
  const a = withLogo({ url: 'https://example.com/_next/image?url=%2Flogo.png&w=256&q=75&dpl=dpl_AAA' });
  const b = withLogo({ url: 'https://example.com/_next/image?url=%2Flogo.png&w=384&q=90&dpl=dpl_BBB' });
  assert.deepEqual(logoIdentity(a), logoIdentity(b));
  assert.deepEqual(logoChanges(a, b), []);
});

test('a different mark is drift', () => {
  const a = withLogo({ url: 'https://example.com/logo.png' });
  const b = withLogo({ url: 'https://example.com/logo-2026.png' });
  const changes = logoChanges(a, b);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'changed');
});

test('bytes and markup outrank the url, so a stable url with new bytes still reports', () => {
  const url = 'https://example.com/logo.png';
  const a = withLogo({ url, dataUri: 'data:image/png;base64,AAA' });
  const b = withLogo({ url, dataUri: 'data:image/png;base64,BBB' });
  assert.equal(logoChanges(a, b)[0]?.kind, 'changed');
  assert.equal(logoIdentity(withLogo({ url, markup: '<svg/>' }))?.markup, '<svg/>');
});

test('a logo that disappeared is drift, and two absent logos are not', () => {
  assert.equal(logoChanges(withLogo({ url: 'https://example.com/logo.png' }), base)[0]?.kind, 'removed');
  assert.deepEqual(logoChanges(base, base), []);
  assert.equal(logoIdentity(base), null);
});

test('a failed logo extraction is not reported as a removed logo', () => {
  const a = withLogo({ url: 'https://example.com/logo.png' });
  const degraded = { ...base, meta: { degraded: ['logo'] } } as unknown as ExtractionResult;
  assert.deepEqual(logoChanges(a, degraded), []);
});

test('a baseline taken before bytes were inlined is not a changed logo', () => {
  const url = 'https://example.com/logo.png';
  const before = withLogo({ url });
  const after = withLogo({ url, dataUri: 'data:image/png;base64,AAA' });
  assert.deepEqual(logoChanges(before, after), []);
});
