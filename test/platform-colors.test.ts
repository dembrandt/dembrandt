import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPlatformColors, resolvePlatformColors, type DomColorSnapshot } from '../lib/extractors/platform-colors.js';

// ---------------------------------------------------------------------------
// extractPlatformColors
// ---------------------------------------------------------------------------

test('extracts theme-color meta without media attribute', () => {
  const snap: DomColorSnapshot = {
    metas: [{ name: 'theme-color', content: '#1a73e8' }],
    links: [],
  };
  const hints = extractPlatformColors(snap);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].value, '#1a73e8');
  assert.equal(hints[0].source, 'meta:theme-color');
  assert.equal(hints[0].scheme, undefined);
});

test('splits theme-color into light and dark via media attribute', () => {
  const snap: DomColorSnapshot = {
    metas: [
      { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#000000', media: '(prefers-color-scheme: dark)' },
    ],
    links: [],
  };
  const hints = extractPlatformColors(snap);
  assert.equal(hints.length, 2);
  const light = hints.find(h => h.scheme === 'light');
  const dark = hints.find(h => h.scheme === 'dark');
  assert.equal(light?.value, '#ffffff');
  assert.equal(dark?.value, '#000000');
});

test('extracts mask-icon color from link tag', () => {
  const snap: DomColorSnapshot = {
    metas: [],
    links: [{ rel: 'mask-icon', href: '/icon.svg', color: '#5bbad5' }],
  };
  const hints = extractPlatformColors(snap);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].source, 'link:mask-icon');
  assert.equal(hints[0].value, '#5bbad5');
});

test('ignores mask-icon without color attribute', () => {
  const snap: DomColorSnapshot = {
    metas: [],
    links: [{ rel: 'mask-icon', href: '/icon.svg' }],
  };
  assert.equal(extractPlatformColors(snap).length, 0);
});

test('extracts msapplication-TileColor', () => {
  const snap: DomColorSnapshot = {
    metas: [{ name: 'msapplication-TileColor', content: '#da532c' }],
    links: [],
  };
  const hints = extractPlatformColors(snap);
  assert.equal(hints[0].source, 'meta:msapplication-TileColor');
  assert.equal(hints[0].value, '#da532c');
});

test('extracts msapplication-navbutton-color', () => {
  const snap: DomColorSnapshot = {
    metas: [{ name: 'msapplication-navbutton-color', content: '#ff6600' }],
    links: [],
  };
  const hints = extractPlatformColors(snap);
  assert.equal(hints[0].source, 'meta:msapplication-navbutton-color');
});

test('apple status bar: skips non-hex values like "black" or "default"', () => {
  const snap: DomColorSnapshot = {
    metas: [
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    ],
    links: [],
  };
  assert.equal(extractPlatformColors(snap).length, 0);
});

test('apple status bar: accepts hex value', () => {
  const snap: DomColorSnapshot = {
    metas: [{ name: 'apple-mobile-web-app-status-bar-style', content: '#007aff' }],
    links: [],
  };
  const hints = extractPlatformColors(snap);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].source, 'meta:apple-status-bar');
  assert.equal(hints[0].value, '#007aff');
});

test('case-insensitive name matching', () => {
  const snap: DomColorSnapshot = {
    metas: [{ name: 'Theme-Color', content: '#abcdef' }],
    links: [],
  };
  assert.equal(extractPlatformColors(snap).length, 1);
});

test('ignores meta with empty or boolean-like content', () => {
  const snap: DomColorSnapshot = {
    metas: [
      { name: 'theme-color', content: '' },
      { name: 'theme-color', content: 'yes' },
      { name: 'theme-color', content: 'no' },
    ],
    links: [],
  };
  assert.equal(extractPlatformColors(snap).length, 0);
});

test('empty snapshot yields no hints', () => {
  assert.equal(extractPlatformColors({ metas: [], links: [] }).length, 0);
});

// ---------------------------------------------------------------------------
// resolvePlatformColors
// ---------------------------------------------------------------------------

test('sets themeColor from first matching light/unschemed hint', () => {
  const hints = extractPlatformColors({
    metas: [{ name: 'theme-color', content: '#aabbcc' }],
    links: [],
  });
  const result = resolvePlatformColors(hints, {});
  assert.equal(result.themeColor, '#aabbcc');
});

test('does not overwrite existing themeColor from manifest', () => {
  const hints = extractPlatformColors({
    metas: [{ name: 'theme-color', content: '#aabbcc' }],
    links: [],
  });
  const result = resolvePlatformColors(hints, { themeColor: '#manifest' });
  assert.equal(result.themeColor, undefined);
});

test('always populates darkThemeColor even when light is set', () => {
  const snap: DomColorSnapshot = {
    metas: [
      { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#111111', media: '(prefers-color-scheme: dark)' },
    ],
    links: [],
  };
  const hints = extractPlatformColors(snap);
  const result = resolvePlatformColors(hints, {});
  assert.equal(result.themeColor, '#ffffff');
  assert.equal(result.darkThemeColor, '#111111');
});

test('mask-icon used as themeColor fallback when no theme-color meta', () => {
  const hints = extractPlatformColors({
    metas: [],
    links: [{ rel: 'mask-icon', color: '#5bbad5' }],
  });
  const result = resolvePlatformColors(hints, {});
  assert.equal(result.themeColor, '#5bbad5');
});

test('theme-color meta takes priority over mask-icon', () => {
  const hints = extractPlatformColors({
    metas: [{ name: 'theme-color', content: '#ff0000' }],
    links: [{ rel: 'mask-icon', color: '#00ff00' }],
  });
  const result = resolvePlatformColors(hints, {});
  assert.equal(result.themeColor, '#ff0000');
});

test('msapplication-TileColor maps to backgroundColor', () => {
  const hints = extractPlatformColors({
    metas: [{ name: 'msapplication-TileColor', content: '#da532c' }],
    links: [],
  });
  const result = resolvePlatformColors(hints, {});
  assert.equal(result.backgroundColor, '#da532c');
});

test('does not overwrite existing backgroundColor from manifest', () => {
  const hints = extractPlatformColors({
    metas: [{ name: 'msapplication-TileColor', content: '#da532c' }],
    links: [],
  });
  const result = resolvePlatformColors(hints, { backgroundColor: '#from-manifest' });
  assert.equal(result.backgroundColor, undefined);
});
