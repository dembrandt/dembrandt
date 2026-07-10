import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isHomeHref,
  classifyContextByPosition,
  thirdPartyBrandFromAlt,
  positionFraction,
  fitPaintedBox,
  isLogoSized,
  LOGO_HEURISTICS_SOURCE,
} from '../lib/extractors/logo-heuristics.js';

// ---- isHomeHref ------------------------------------------------------------
test('isHomeHref: root and dot-root are home', () => {
  assert.equal(isHomeHref('/', 'https://x.com'), true);
  assert.equal(isHomeHref('./', 'https://x.com'), true);
});

test('isHomeHref: absolute homepage URL, with or without trailing slash, case-insensitive', () => {
  assert.equal(isHomeHref('https://x.com', 'https://x.com'), true);
  assert.equal(isHomeHref('https://x.com/', 'https://x.com'), true);
  assert.equal(isHomeHref('HTTPS://X.COM/', 'https://x.com'), true);
  assert.equal(isHomeHref('https://x.com/', 'https://x.com/'), true); // origin may carry a slash
});

test('isHomeHref: deep links and other origins are not home', () => {
  assert.equal(isHomeHref('/about', 'https://x.com'), false);
  assert.equal(isHomeHref('https://x.com/pricing', 'https://x.com'), false);
  assert.equal(isHomeHref('https://other.com', 'https://x.com'), false);
});

test('isHomeHref: defensive against null / non-string / empty', () => {
  assert.equal(isHomeHref(null as any, 'https://x.com'), false);
  assert.equal(isHomeHref(undefined as any, 'https://x.com'), false);
  assert.equal(isHomeHref(42 as any, 'https://x.com'), false);
  assert.equal(isHomeHref('', 'https://x.com'), false);
  assert.equal(isHomeHref('  ', 'https://x.com'), false);
  assert.equal(isHomeHref('https://x.com', null as any), false);
});

test('isHomeHref: localized homepage roots count as home (i18n sites link the logo there)', () => {
  assert.equal(isHomeHref('/en', 'https://x.com'), true);
  assert.equal(isHomeHref('/de/', 'https://x.com'), true);
  assert.equal(isHomeHref('/en-us', 'https://x.com'), true);
  assert.equal(isHomeHref('https://x.com/en', 'https://x.com'), true);
  assert.equal(isHomeHref('/en/pricing', 'https://x.com'), false); // deeper than a locale root
  assert.equal(isHomeHref('/about', 'https://x.com'), false);
});

// ---- classifyContextByPosition --------------------------------------------
test('classifyContextByPosition: above the fold is header', () => {
  assert.equal(classifyContextByPosition(0, 8000), 'header');
  assert.equal(classifyContextByPosition(500, 8000), 'header'); // fold is inclusive
});

test('classifyContextByPosition: deep bottom is footer, middle is body', () => {
  assert.equal(classifyContextByPosition(7500, 8000), 'footer'); // within 1200 of bottom
  assert.equal(classifyContextByPosition(4000, 8000), 'body');
});

test('classifyContextByPosition: short pages never mislabel body as footer', () => {
  // top just past the fold on a 900px page — dh-1200 is negative, so not footer
  assert.equal(classifyContextByPosition(600, 900), 'body');
});

test('classifyContextByPosition: honours a custom fold', () => {
  assert.equal(classifyContextByPosition(300, 8000, 200), 'body');
  assert.equal(classifyContextByPosition(150, 8000, 200), 'header');
});

test('classifyContextByPosition: defensive against NaN / missing docHeight', () => {
  assert.equal(classifyContextByPosition(NaN, 8000), 'header');    // unknown top → treat as top
  assert.equal(classifyContextByPosition('x' as any, 8000), 'header');
  assert.equal(classifyContextByPosition(4000, NaN), 'body');      // unknown height → not footer
  assert.equal(classifyContextByPosition(4000, 0), 'body');
});

// ---- thirdPartyBrandFromAlt ------------------------------------------------
test('thirdPartyBrandFromAlt: a different brand is flagged', () => {
  assert.equal(thirdPartyBrandFromAlt('Globex logo', 'acme'), 'globex');
  assert.equal(thirdPartyBrandFromAlt('Initech', 'acme'), 'initech');
});

test('thirdPartyBrandFromAlt: multi-word brand names survive (the old-bug regression)', () => {
  assert.equal(thirdPartyBrandFromAlt('Acme Widgets Logo', 'globex'), 'acmewidgets');
  assert.equal(thirdPartyBrandFromAlt('Initech Systems Logo', 'globex'), 'initechsystems');
});

test('thirdPartyBrandFromAlt: the site\'s own brand is not third-party', () => {
  assert.equal(thirdPartyBrandFromAlt('Acme logo', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('Acme', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('AcmeLogo', 'acme'), null); // substring either way
});

test('thirdPartyBrandFromAlt: generic-only or too-short alts are ignored', () => {
  assert.equal(thirdPartyBrandFromAlt('logo', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('Brand Icon', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('X', 'acme'), null); // 1 char after squash
});

test('thirdPartyBrandFromAlt: defensive against null / non-string / empty site', () => {
  assert.equal(thirdPartyBrandFromAlt(null as any, 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt(123 as any, 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('Globex logo', ''), null);
  assert.equal(thirdPartyBrandFromAlt('Globex logo', null as any), null);
});

// ---- positionFraction ------------------------------------------------------
test('positionFraction: percentages, keywords, default', () => {
  assert.equal(positionFraction('0%'), 0);
  assert.equal(positionFraction('50%'), 0.5);
  assert.equal(positionFraction('100%'), 1);
  assert.equal(positionFraction('left'), 0);
  assert.equal(positionFraction('right'), 1);
  assert.equal(positionFraction('center'), 0.5);
  assert.equal(positionFraction('12px'), 0.5); // pixel offsets: not modelled, centre
});

test('positionFraction: clamps and defends', () => {
  assert.equal(positionFraction('150%'), 1);
  assert.equal(positionFraction('-20%'), 0);
  assert.equal(positionFraction(null as any), 0.5);
  assert.equal(positionFraction(undefined as any), 0.5);
});

// ---- fitPaintedBox ---------------------------------------------------------
const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

test('fitPaintedBox: fill/cover/none paint the whole content box', () => {
  const c = box(10, 20, 200, 100);
  for (const fit of ['fill', 'cover', 'none'] as const) {
    assert.deepEqual(fitPaintedBox(c, { width: 400, height: 100 }, fit), c);
  }
});

test('fitPaintedBox: contain letterboxes a wide asset in a tall box, centred', () => {
  // 400x100 asset (4:1) inside a 200x200 box → scaled to 200x50, vertically centred
  const r = fitPaintedBox(box(0, 0, 200, 200), { width: 400, height: 100 }, 'contain');
  assert.equal(r.width, 200);
  assert.equal(r.height, 50);
  assert.equal(r.x, 0);
  assert.equal(r.y, 75); // (200-50)/2
});

test('fitPaintedBox: contain honours object-position', () => {
  const top = fitPaintedBox(box(0, 0, 200, 200), { width: 400, height: 100 }, 'contain', 0.5, 0);
  assert.equal(top.y, 0);
  const bottom = fitPaintedBox(box(0, 0, 200, 200), { width: 400, height: 100 }, 'contain', 0.5, 1);
  assert.equal(bottom.y, 150);
});

test('fitPaintedBox: scale-down never upscales a small asset', () => {
  // 40x20 asset in a 200x200 box: contain would scale up 5x, scale-down keeps 40x20
  const r = fitPaintedBox(box(0, 0, 200, 200), { width: 40, height: 20 }, 'scale-down');
  assert.equal(r.width, 40);
  assert.equal(r.height, 20);
});

test('fitPaintedBox: a large intrinsic asset painted into a small content box (the bbox bug)', () => {
  // asset 300x140 (~2.14:1) contained in a 41x19 content box → paints ~41x19, unchanged shape
  const r = fitPaintedBox(box(813, 4525, 41, 19), { width: 300, height: 140 }, 'contain');
  assert.ok(r.width <= 41 && r.height <= 19);
  assert.ok(Math.abs(r.width / r.height - 300 / 140) < 0.05); // aspect preserved
});

test('fitPaintedBox: defensive against missing/zero/NaN intrinsic and degenerate boxes', () => {
  const c = box(5, 5, 100, 50);
  assert.deepEqual(fitPaintedBox(c, null, 'contain'), c);
  assert.deepEqual(fitPaintedBox(c, { width: 0, height: 0 }, 'contain'), c);
  assert.deepEqual(fitPaintedBox(c, { width: NaN, height: 10 }, 'contain'), c);
  assert.deepEqual(fitPaintedBox(box(0, 0, 0, 0), { width: 100, height: 100 }, 'contain'), box(0, 0, 0, 0));
  // a malformed content box degrades to a safe zero-origin box, never NaN
  const bad = fitPaintedBox({ x: NaN as any, y: undefined as any, width: 'x' as any, height: -5 as any }, null, 'fill');
  assert.ok(Number.isFinite(bad.x) && Number.isFinite(bad.y) && bad.width === 0 && bad.height === 0);
});

// ---- filename-aware third-party detection ----------------------------------
test('thirdPartyBrandFromAlt: catches customer logos named by file (the partner-wall bug)', () => {
  assert.equal(thirdPartyBrandFromAlt('logo-Globex.svg', 'acme'), 'globex');
  assert.equal(thirdPartyBrandFromAlt('logo-initech-on-white.svg', 'acme'), 'initech');
  assert.equal(thirdPartyBrandFromAlt('logo-UmbrellaCorp.svg', 'acme'), 'umbrellacorp');
});

test('thirdPartyBrandFromAlt: the site\'s own asset file is kept whatever the suffix', () => {
  assert.equal(thirdPartyBrandFromAlt('acme-logo.svg', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('globex-logo-2023.svg', 'globex'), null);
  assert.equal(thirdPartyBrandFromAlt('initech-logo-white.png', 'initech'), null);
});

test('thirdPartyBrandFromAlt: a generic or variant-only file name is not a brand', () => {
  assert.equal(thirdPartyBrandFromAlt('logo.svg', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('logo-white.svg', 'acme'), null);
  assert.equal(thirdPartyBrandFromAlt('brandmark.svg', 'acme'), null);
});

// ---- isLogoSized -----------------------------------------------------------
test('isLogoSized: 24px on the long edge is the floor (matches the smallest real logo)', () => {
  assert.equal(isLogoSized(24, 24), true);
  assert.equal(isLogoSized(118, 13), true);   // a thin wordmark
  assert.equal(isLogoSized(50, 50), true);
});

test('isLogoSized: header UI icons (16-20px squares) are rejected', () => {
  assert.equal(isLogoSized(16, 16), false);
  assert.equal(isLogoSized(20, 20), false);
});

test('isLogoSized: defensive against zero / negative / NaN / non-numeric', () => {
  assert.equal(isLogoSized(0, 0), false);
  assert.equal(isLogoSized(-40, 40), false);
  assert.equal(isLogoSized(NaN, 40), false);
  assert.equal(isLogoSized('40' as any, undefined as any), false);
});

// ---- serialization contract ------------------------------------------------
test('LOGO_HEURISTICS_SOURCE re-hydrates to functions that behave identically', () => {
  const H = new Function(LOGO_HEURISTICS_SOURCE +
    '\nreturn { isHomeHref, classifyContextByPosition, thirdPartyBrandFromAlt, positionFraction, fitPaintedBox, isLogoSized };')();
  assert.equal(typeof H.isHomeHref, 'function');
  assert.equal(H.isHomeHref('/', 'https://x.com'), isHomeHref('/', 'https://x.com'));
  assert.equal(H.classifyContextByPosition(7500, 8000), classifyContextByPosition(7500, 8000));
  assert.equal(H.thirdPartyBrandFromAlt('Globex logo', 'acme'), thirdPartyBrandFromAlt('Globex logo', 'acme'));
  assert.deepEqual(
    H.fitPaintedBox(box(0, 0, 200, 200), { width: 400, height: 100 }, 'contain'),
    fitPaintedBox(box(0, 0, 200, 200), { width: 400, height: 100 }, 'contain'),
  );
  assert.equal(H.isLogoSized(16, 16), isLogoSized(16, 16));
});

test('LOGO_HEURISTICS_SOURCE is self-contained: no module refs leak in', () => {
  assert.ok(!/\bexports\b|\brequire\(|\bimport\b/.test(LOGO_HEURISTICS_SOURCE));
});
