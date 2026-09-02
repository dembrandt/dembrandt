import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractBranding } from '../lib/extractors/index.js';

function extractConstArrowSource(source: string, name: string): string {
  const marker = `const ${name} = () =>`;
  const start = source.indexOf(marker);
  assert.ok(start !== -1, `const ${name} not found in source`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  while (source[i] !== ';') i++;
  return source.slice(start, i + 1);
}

type MockStyle = { visibility?: string; display?: string; opacity?: string };
type MockEl = { tagName: string; style?: MockStyle; getBoundingClientRect: () => { width: number; height: number } };

function loadHasRenderedContent(elements: MockEl[]) {
  const src = extractConstArrowSource(extractBranding.toString(), 'hasRenderedContent');
  const mockDocument = {
    body: {
      querySelectorAll: () => elements,
    },
  };
  const mockGetComputedStyle = (el: MockEl) => ({
    visibility: el.style?.visibility ?? 'visible',
    display: el.style?.display ?? 'block',
    opacity: el.style?.opacity ?? '1',
  });
  const factory = new Function(
    'document',
    'getComputedStyle',
    `${src}\nreturn hasRenderedContent;`,
  );
  return factory(
    mockDocument,
    mockGetComputedStyle,
  ) as () => boolean;
}

function el(tagName: string, width: number, height: number, style?: MockStyle): MockEl {
  return { tagName, style, getBoundingClientRect: () => ({ width, height }) };
}

test('hasRenderedContent: a sizable, visible, non-script element counts as rendered', () => {
  assert.equal(loadHasRenderedContent([el('DIV', 400, 300)])(), true);
});

test('hasRenderedContent: script/style/link/meta tags never count, even if sizable', () => {
  const els = [el('SCRIPT', 800, 600), el('STYLE', 800, 600), el('LINK', 800, 600), el('META', 800, 600)];
  assert.equal(loadHasRenderedContent(els)(), false);
});

test('hasRenderedContent: elements below the size floor do not count', () => {
  assert.equal(loadHasRenderedContent([el('DIV', 200, 100), el('SPAN', 50, 50)])(), false);
});

test('hasRenderedContent: a hidden or collapsed element does not count', () => {
  const hidden = el('DIV', 400, 300, { visibility: 'hidden' });
  const none = el('DIV', 400, 300, { display: 'none' });
  const transparent = el('DIV', 400, 300, { opacity: '0' });
  for (const e of [hidden, none, transparent]) {
    assert.equal(loadHasRenderedContent([e])(), false);
  }
});

test('hasRenderedContent: an empty page reports no rendered content', () => {
  assert.equal(loadHasRenderedContent([])(), false);
});
