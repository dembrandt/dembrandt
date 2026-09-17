import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from './helpers/tailwind-compile.js';
import { generateShadcnTheme } from '../lib/formatters/shadcn.js';

// "shadcn's convention is spelled correctly" is not a claim a string test can
// make. Only the real compiler can say whether bg-primary resolves to the
// measured colour, and that is the whole point of the @theme inline block.

const PAGE = {
  url: 'https://example.test/',
  colors: {
    semantic: { background: '#06090f', text: '#e2ecef', primary: '#ea580c', accent: '#38bdf8' },
    palette: [
      { color: '#06090f', normalized: '#06090f', role: 'surface', onColor: '#ffffff' },
      { color: '#141a24', normalized: '#141a24', role: 'surface', onColor: '#e2ecef' },
      { color: '#ea580c', normalized: '#ea580c', role: 'accent', onColor: '#000000' },
      { color: '#38bdf8', normalized: '#38bdf8', role: 'accent', onColor: '#000000' },
    ],
  },
  borders: { combinations: [{ color: 'rgb(36, 36, 36)', count: 45 }] },
  borderRadius: { values: [{ value: '8px', confidence: 'high' }] },
  components: {
    badges: { all: [{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#c0c4cc' }] },
    inputs: { text: [{ states: { default: { border: '1px solid rgb(205, 206, 216)' } } }] },
  },
} as never;

const THEME = '@import "tailwindcss";\n' + generateShadcnTheme(PAGE);

const USED = [
  'bg-background', 'text-foreground', 'bg-primary', 'text-primary-foreground',
  'bg-card', 'text-card-foreground', 'bg-muted', 'text-muted-foreground',
  'bg-accent', 'border-border', 'rounded-lg', 'rounded-sm',
] as const;

test('Tailwind compiles the emitted theme without error', () => {
  const css = compile(THEME, USED);
  assert.ok(css.length > 0);
});

test('every emitted slot produces the utility class shadcn components use', () => {
  const css = compile(THEME, USED);
  for (const utility of USED) {
    assert.match(css, new RegExp(`\\.${utility.replace(/[-]/g, '\\-')}\\b`), `${utility} did not compile`);
  }
});

/** The compiled body of one utility, whitespace collapsed. */
function ruleFor(css: string, utility: string): string {
  const match = new RegExp(`\\.${utility}\\s*\\{[^}]*\\}`).exec(css);
  return match ? match[0].replace(/\s+/g, ' ') : '';
}

test('a utility resolves through the variable to the value measured on the page', () => {
  const css = compile(THEME, USED);

  // Link one: the utility Tailwind generates points at our custom property.
  assert.equal(ruleFor(css, 'bg-primary'), '.bg-primary { background-color: var(--primary); }');
  assert.equal(ruleFor(css, 'text-foreground'), '.text-foreground { color: var(--foreground); }');
  assert.equal(ruleFor(css, 'rounded-lg'), '.rounded-lg { border-radius: var(--radius); }');

  // Link two: that property carries the extracted colour, not a shadcn default.
  assert.match(css, /--primary:\s*oklch\(64\.6\d+% 0\.194\d+ 41\.\d+\)/);
  assert.match(css, /--foreground:\s*oklch\(93\.6/);
  assert.match(css, /--radius:\s*8px/);
});

test('a translucent slot survives compilation with its alpha intact', () => {
  const css = compile(THEME, ['bg-muted']);
  assert.equal(ruleFor(css, 'bg-muted'), '.bg-muted { background-color: var(--muted); }');
  assert.match(css, /--muted:\s*rgba\(255, 255, 255, 0\.05\)/);
});

test('a slot the page did not supply compiles to nothing rather than a wrong colour', () => {
  const css = compile(THEME, ['bg-popover', 'bg-destructive']);
  assert.doesNotMatch(css, /\.bg-popover\b/, 'popover was never observed, so it must not be themed');
  assert.doesNotMatch(css, /\.bg-destructive\b/);
});

test('a theme from an empty extraction is still valid CSS', () => {
  const empty = '@import "tailwindcss";\n' + generateShadcnTheme({} as never);
  const css = compile(empty, ['text-foreground']);
  assert.ok(css.length > 0);
});
