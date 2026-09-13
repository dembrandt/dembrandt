import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripAssetBytes } from '../lib/mcp/assets.js';

const BIG = 'data:image/png;base64,' + 'A'.repeat(400);

test('inlined asset bytes never reach an agent context', () => {
  const out = stripAssetBytes({
    logo: { source: 'img', url: 'https://example.com/logo.png', dataUri: BIG },
    favicons: [{ type: 'icon', url: 'https://example.com/f.png', dataUri: BIG }],
  });
  assert.doesNotMatch(JSON.stringify(out), /AAAA/);
  assert.match(out.logo.dataUri, /^<data:image\/png;base64,… \d+ chars, omitted>$/);
  assert.equal(out.logo.url, 'https://example.com/logo.png');
  assert.match(out.favicons[0].dataUri, /omitted/);
});

test('a short data uri and every other field pass through unchanged', () => {
  const small = 'data:image/svg+xml;utf8,<svg/>';
  const input = { logo: { dataUri: small, width: 120 }, colors: { palette: ['#000'] }, n: 1, nil: null };
  assert.deepEqual(stripAssetBytes(input), input);
});
