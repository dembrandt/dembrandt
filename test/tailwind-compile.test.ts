import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from './helpers/tailwind-compile.js';
import {
  generateTailwindTheme,
  TAILWIND_NAMESPACES,
  type TailwindThemeInput,
} from '../lib/formatters/tailwind.js';

/**
 * Everything in tailwind.test.ts asserts on the emitted string, which proves
 * the emitter writes what we told it to write. It cannot prove Tailwind
 * accepts it. These tests run the real compiler over the real output and check
 * that the tokens turn into working utilities. This is the test that catches a
 * namespace we spelled plausibly but wrongly.
 */

const sample: TailwindThemeInput = {
  url: 'https://example.com',
  extractedAt: '2026-01-01T00:00:00.000Z',
  meta: { dembrandtVersion: '0.27.1' },
  colors: {
    semantic: { primary: '#1a73e8', background: '#ffffff', text: '#202124' },
    palette: [{ color: '#e8590c', normalized: '#e8590c', count: 40, confidence: 'high' }],
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
  spacing: { scaleType: 'custom', commonValues: [{ px: 24, display: '24px' }, { px: 16, display: '16px' }] },
  borderRadius: {
    values: [
      { value: '8px', count: 10, confidence: 'high' },
      { value: '9999px', count: 2, confidence: 'medium' },
    ],
  },
  shadows: [{ shadow: '0px 1px 3px 0px #00000033', count: 8, confidence: 'high' }],
  breakpoints: [{ px: 1024 }, { px: 640 }],
};

/**
 * Map an emitted theme variable to the utility it is supposed to unlock. One
 * entry per namespace in TAILWIND_NAMESPACES, longest prefix first:
 * `--font-weight-bold` is a weight, not a family. `--spacing` with no suffix is
 * the dynamic scale multiplier, so it is checked through an arbitrary step.
 */
const UTILITY_FOR: ReadonlyArray<readonly [string, (name: string) => string]> = [
  ['--font-weight-', name => `font-${name}`],
  ['--breakpoint-', name => `${name}:flex`],
  ['--tracking-', name => `tracking-${name}`],
  ['--spacing-', name => `p-${name}`],
  ['--spacing', () => 'p-7'],
  ['--radius-', name => `rounded-${name}`],
  ['--shadow-', name => `shadow-${name}`],
  ['--color-', name => `bg-${name}`],
  ['--font-', name => `font-${name}`],
  ['--text-', name => `text-${name}`],
];

interface MappedTheme {
  utilities: Map<string, string>;
  /** Declarations no namespace in UTILITY_FOR claims. Always a bug. */
  unmapped: string[];
}

function mapTheme(css: string): MappedTheme {
  const utilities = new Map<string, string>();
  const unmapped: string[] = [];
  for (const [, declaration] of css.matchAll(/^\s*(--[a-z0-9-]+):/gm)) {
    // Compound keys like `--text-body--line-height` modify the token above
    // them rather than defining a utility of their own.
    if (declaration.includes('--', 2)) continue;
    const match = UTILITY_FOR.find(([prefix]) => declaration.startsWith(prefix));
    if (!match) {
      unmapped.push(declaration);
      continue;
    }
    utilities.set(match[1](declaration.slice(match[0].length)), declaration);
  }
  return { utilities, unmapped };
}

test('Tailwind compiles the emitted theme without erroring', () => {
  // Tailwind tree-shakes theme variables nothing references, so the token has
  // to be used for its presence to mean anything.
  const out = compile(generateTailwindTheme(sample), ['bg-primary']);

  assert.ok(out.includes('--color-primary: #1a73e8'), 'the extracted value did not survive into :root');
  assert.ok(out.includes('background-color: var(--color-primary)'), 'bg-primary did not bind to the token');
});

test('the mapping covers every namespace the emitter declares', () => {
  // Without this, renaming a namespace in the emitter would make the compile
  // test skip it rather than fail on it.
  const covered = new Set(UTILITY_FOR.map(([prefix]) => prefix));
  for (const namespace of TAILWIND_NAMESPACES) {
    const prefix = namespace.replace(/\*$/, '');
    assert.ok(covered.has(prefix), `${namespace} has no utility to check it through`);
  }
});

test('every emitted token unlocks the utility it claims to', () => {
  const theme = generateTailwindTheme(sample);
  const { utilities, unmapped } = mapTheme(theme);

  // A token outside every declared namespace is dead text in the user's
  // stylesheet: Tailwind will parse it and build nothing from it.
  assert.deepEqual(unmapped, []);

  // Guard the guard: if the mapping stops recognising the emitter's output,
  // this test would pass vacuously.
  assert.ok(utilities.size >= 12, `only mapped ${utilities.size} tokens`);

  const out = compile(theme, [...utilities.keys()]);

  for (const [utility, declaration] of utilities) {
    // Tailwind escapes `:` in the emitted selector, so `sm:flex` lands as
    // `.sm\:flex`. Compare literally; the compiled sheet is far too big to
    // hand to assert.match on failure.
    const selector = `.${utility.replace(/:/g, '\\:')}`;
    assert.ok(
      out.includes(`${selector} {`) || out.includes(`${selector},`),
      `${declaration} did not produce a working \`${utility}\` utility`,
    );
  }
});

test('a breakpoint token produces a working responsive variant', () => {
  const out = compile(generateTailwindTheme(sample), ['md:flex']);

  assert.ok(out.includes('@media (width >= 1024px)'), 'md did not become a responsive variant at the observed width');
});

test('an empty extraction still compiles', () => {
  const out = compile(generateTailwindTheme({ url: 'https://example.com' }), ['flex']);

  assert.ok(out.includes('.flex {'), 'a themeless file should still compile against Tailwind defaults');
});
