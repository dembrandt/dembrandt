import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateTailwindTheme,
  TAILWIND_NAMESPACES,
  TAILWIND_TARGET_MAJOR,
  type TailwindThemeInput,
} from '../lib/formatters/tailwind.js';

const sample: TailwindThemeInput = {
  url: 'https://example.com',
  extractedAt: '2026-01-01T00:00:00.000Z',
  meta: { dembrandtVersion: '0.27.1' },
  colors: {
    semantic: { primary: '#1a73e8', background: '#ffffff', text: '#202124' },
    palette: [
      { color: '#1a73e8', normalized: '#1a73e8', count: 120, confidence: 'high' },
      { color: '#e8590c', normalized: '#e8590c', count: 40, confidence: 'high' },
      { color: '#9aa0a6', normalized: '#9aa0a6', count: 5, confidence: 'low' },
    ],
    cssVariables: { '--brand-orange': { value: '#e8590c', hex: '#e8590c' } },
  },
  typography: {
    styles: [
      {
        context: 'body',
        family: 'Inter',
        fallbacks: ['sans-serif'],
        size: '16px',
        weight: 400,
        lineHeight: '1.5',
      },
      { context: 'heading-1', family: 'Inter', size: '32px', weight: 700, letterSpacing: '-0.5px' },
    ],
  },
  spacing: {
    scaleType: 'custom',
    commonValues: [
      { px: 24, display: '24px' },
      { px: 16, display: '16px' },
    ],
  },
  borderRadius: {
    values: [
      { value: '8px', count: 10, confidence: 'high' },
      { value: '9999px', count: 2, confidence: 'medium' },
    ],
  },
  shadows: [{ shadow: '0px 1px 3px 0px #00000033', count: 8, confidence: 'high' }],
  breakpoints: [{ px: 1024 }, { px: 640 }],
};

test('generateTailwindTheme emits a v4 @theme block of observed values', () => {
  const css = generateTailwindTheme(sample);

  assert.match(css, /@import "tailwindcss";/);
  assert.match(css, /@theme \{/);
  assert.equal(css.trimEnd().endsWith('}'), true);

  // Semantic roles keep their role name.
  assert.match(css, /--color-primary: #1a73e8;/);
  assert.match(css, /--color-background: #ffffff;/);

  // A palette colour declared as a custom property borrows the author's name.
  assert.match(css, /--color-brand-orange: #e8590c;/);

  assert.match(css, /--font-inter: Inter, sans-serif;/);
  assert.match(css, /--text-body: 16px;/);
  assert.match(css, /--text-body--line-height: 1\.5;/);
  assert.match(css, /--text-heading-1: 32px;/);
  assert.match(css, /--font-weight-normal: 400;/);
  assert.match(css, /--font-weight-bold: 700;/);
  assert.match(css, /--tracking-heading-1: -0\.5px;/);
  assert.match(css, /--spacing-xs: 16px;/);
  assert.match(css, /--spacing-sm: 24px;/);
  assert.match(css, /--radius-sm: 8px;/);
  assert.match(css, /--radius-full: 9999px;/);
  assert.match(css, /--shadow-sm: 0px 1px 3px 0px #00000033;/);
  assert.match(css, /--breakpoint-sm: 640px;/);
  assert.match(css, /--breakpoint-md: 1024px;/);
});

test('generateTailwindTheme only writes namespaces it declares', () => {
  const css = generateTailwindTheme(sample);
  const prefixes = new Set(TAILWIND_NAMESPACES.map(n => n.replace(/\*$/, '')));

  const declared = [...css.matchAll(/^\s{2}(--[a-z0-9-]+)/gm)].map(m => m[1]);
  assert.ok(declared.length > 0);

  for (const name of declared) {
    const known = [...prefixes].some(prefix =>
      prefix.endsWith('-') ? name.startsWith(prefix) : name === prefix
    );
    assert.ok(known, `${name} is outside TAILWIND_NAMESPACES`);
  }
});

test('generateTailwindTheme invents nothing: no ramps, no derived states', () => {
  const css = generateTailwindTheme({
    ...sample,
    colors: {
      ...sample.colors,
      palette: [
        {
          color: '#1a73e8',
          normalized: '#1a73e8',
          count: 120,
          confidence: 'high',
          hover: '#1557b0',
          onColor: '#ffffff',
        },
        // An alpha/lightness variant of the primary is the same token in a
        // different state, which is the human's call, not the emitter's.
        {
          color: '#4a8cec',
          normalized: '#4a8cec',
          count: 30,
          confidence: 'high',
          variantOf: 'primary',
        },
      ],
    },
  });

  // Numeric shade steps are the signature of a generated ramp.
  assert.equal(/--color-[a-z0-9-]+-(50|100|200|300|400|500|600|700|800|900|950):/.test(css), false);
  assert.equal(css.includes('#1557b0'), false);
  assert.equal(css.includes('#4a8cec'), false);
  assert.equal(/--color-on-/.test(css), false);
});

test('generateTailwindTheme prefers the dynamic spacing multiplier for a base-N rhythm', () => {
  const css = generateTailwindTheme({
    ...sample,
    spacing: { scaleType: 'base-4', commonValues: [{ px: 16, display: '16px' }] },
  });

  assert.match(css, /--spacing: 4px;/);
  assert.equal(/--spacing-xs:/.test(css), false);
});

test('generateTailwindTheme drops values that cannot become tokens', () => {
  const css = generateTailwindTheme({
    ...sample,
    colors: {
      semantic: { primary: 'transparent', accent: 'rgba(0, 0, 0, 0)', border: 'not-a-color' },
      palette: [],
    },
    // A percentage radius resolves against a box the token file does not have.
    borderRadius: { values: [{ value: '50%', count: 4, confidence: 'high' }] },
    shadows: [{ shadow: 'none', count: 3, confidence: 'low' }],
    breakpoints: [{ px: 0 }],
  });

  assert.equal(/--color-/.test(css), false);
  assert.equal(/--radius-/.test(css), false);
  assert.equal(/--shadow-/.test(css), false);
  assert.equal(/--breakpoint-/.test(css), false);
});

test('generateTailwindTheme never shadows a declaration when names collide', () => {
  const css = generateTailwindTheme({
    ...sample,
    colors: {
      semantic: { primary: '#1a73e8' },
      palette: [
        { color: '#e8590c', normalized: '#e8590c', count: 40, confidence: 'high' },
        { color: '#2f9e44', normalized: '#2f9e44', count: 20, confidence: 'high' },
      ],
      // Two authored properties normalising to the same token name.
      cssVariables: { '--color-brand': '#e8590c', '--c-brand': '#2f9e44' },
    },
  });

  assert.match(css, /--color-brand: #e8590c;/);
  assert.match(css, /--color-brand-2: #2f9e44;/);

  const names = [...css.matchAll(/^\s{2}(--[a-z0-9-]+):/gm)].map(m => m[1]);
  assert.equal(new Set(names).size, names.length);
});

test('generateTailwindTheme reads legacy field shapes', () => {
  const css = generateTailwindTheme({
    url: 'https://example.com',
    colors: {
      // Pre-1.0 semantic entries wrap the colour in an object.
      semantic: { primary: { color: '#1a73e8' } },
      palette: [],
    },
    typography: {
      // Pre-1.0 typography uses the CSS property names.
      styles: [{ context: 'body', fontFamily: 'Public Sans', fontSize: '18px', fontWeight: 'bold' }],
    },
  });

  assert.match(css, /--color-primary: #1a73e8;/);
  assert.match(css, /--font-public-sans: "Public Sans";/);
  assert.match(css, /--text-body: 18px;/);
  assert.match(css, /--font-weight-bold: 700;/);
});

test('generateTailwindTheme reads the raw extractor payload, not just normalized output', () => {
  // Shapes taken verbatim from a live run: joined fallbacks, a size carrying its
  // rem echo, letter-spacing under `spacing`, "8px" as a scaleType, "576px"
  // breakpoints.
  const css = generateTailwindTheme({
    url: 'https://example.com',
    colors: { semantic: {}, palette: [] },
    typography: {
      styles: [
        {
          context: 'display',
          family: 'ui-sans-serif',
          fallbacks: 'system-ui, Apple Color Emoji',
          size: '96px (6.00rem)',
          weight: 700,
          lineHeight: '1.00',
          spacing: '-2.88px',
        },
      ],
    },
    spacing: { scaleType: '8px', commonValues: [] },
    breakpoints: [{ px: '576px' }, { px: '768px' }],
  });

  assert.match(css, /--font-ui-sans-serif: ui-sans-serif, system-ui, "Apple Color Emoji";/);
  assert.match(css, /--text-display: 96px;/);
  assert.match(css, /--text-display--line-height: 1;/);
  assert.match(css, /--tracking-display: -2\.88px;/);
  assert.match(css, /--spacing: 8px;/);
  assert.match(css, /--breakpoint-sm: 576px;/);
  assert.match(css, /--breakpoint-md: 768px;/);
});

test('generateTailwindTheme keeps one size token per context', () => {
  const css = generateTailwindTheme({
    ...sample,
    typography: {
      styles: [
        { context: 'body', family: 'Inter', size: '16px' },
        { context: 'body', family: 'Inter', size: '15.008px' },
        { context: 'body', family: 'Inter', size: '14px' },
      ],
    },
  });

  assert.match(css, /--text-body: 16px;/);
  assert.equal(/--text-body-2/.test(css), false);
  assert.equal(css.includes('15.008px'), false);
});

test('generateTailwindTheme selects spacing and radii by usage, not by size', () => {
  const css = generateTailwindTheme({
    ...sample,
    // A sub-pixel artefact seen twice must not outrank the values the page is
    // actually built on.
    spacing: {
      scaleType: 'custom',
      commonValues: [
        { px: 2.72, display: '2.72px', count: 2 },
        { px: 8, display: '8px', count: 52 },
        { px: 16, display: '16px', count: 40 },
      ],
    },
    borderRadius: {
      values: [
        { value: '3px', count: 1, confidence: 'low' },
        { value: '8px', count: 30, confidence: 'high' },
      ],
    },
  });

  assert.match(css, /--spacing-xs: 8px;/);
  assert.match(css, /--spacing-sm: 16px;/);
  assert.equal(css.includes('2.72px'), false);
  assert.match(css, /--radius-sm: 8px;/);
  assert.equal(/--radius-\w+: 3px;/.test(css), false);
});

test('generateTailwindTheme drops no-op shadow layers and orders by depth', () => {
  const flat = 'rgb(128, 128, 128) 0px 0px 5px 0px';
  const deep =
    'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, oklab(0 0 0 / 0.4) 0px 25px 50px -12px';

  const css = generateTailwindTheme({
    ...sample,
    shadows: [
      { shadow: deep, count: 4, confidence: 'high' },
      { shadow: flat, count: 2, confidence: 'medium' },
      { shadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px', count: 9, confidence: 'high' },
    ],
  });

  assert.match(css, /--shadow-sm: rgb\(128, 128, 128\) 0px 0px 5px 0px;/);
  assert.match(css, /--shadow-md: oklab\(0 0 0 \/ 0\.4\) 0px 25px 50px -12px;/);
  // The fully transparent shadow renders nothing, so it gets no token.
  assert.equal(/--shadow-lg/.test(css), false);
  assert.equal(css.includes('rgba(0, 0, 0, 0)'), false);
});

test('generateTailwindTheme degrades to a valid file on an empty extraction', () => {
  const css = generateTailwindTheme({ url: 'https://example.com' });

  assert.match(css, /@theme \{/);
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length);
});

test('the targeted Tailwind major is pinned so tailwind:check can detect drift', () => {
  assert.equal(TAILWIND_TARGET_MAJOR, 4);
});
