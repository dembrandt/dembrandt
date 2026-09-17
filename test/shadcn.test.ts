import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHADCN_SLOTS, collectShadcnSlots, generateShadcnTheme } from '../lib/formatters/shadcn.js';

const DARK_PAGE = {
  url: 'https://example.test/',
  colors: {
    semantic: { background: '#06090f', text: '#e2ecef', primary: '#ea580c', accent: '#38bdf8' },
    palette: [
      { color: '#06090f', normalized: '#06090f', role: 'surface', onColor: '#ffffff' },
      { color: '#ffffff', normalized: '#ffffff', role: 'surface', onColor: '#000000' },
      { color: '#141a24', normalized: '#141a24', role: 'surface', onColor: '#e2ecef' },
      { color: '#ea580c', normalized: '#ea580c', role: 'accent', onColor: '#000000' },
      { color: '#38bdf8', normalized: '#38bdf8', role: 'accent', onColor: '#000000' },
    ],
  },
  borders: { combinations: [{ color: 'rgb(36, 36, 36)', count: 45 }] },
  borderRadius: { values: [{ value: '0px 2px 2px 0px', confidence: 'high' }, { value: '8px', confidence: 'high' }] },
  components: {
    badges: { all: [{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#c0c4cc' }] },
    inputs: {
      text: [{ states: {
        default: { border: '1px solid rgb(205, 206, 216)' },
        focus: { boxShadow: 'rgba(39, 107, 218, 0.2) 0px 0px 4px 4px' },
      } }],
    },
  },
} as never;

test('a slot with no observed value is left out entirely', () => {
  const slots = collectShadcnSlots(DARK_PAGE);
  assert.equal(slots.popover, undefined);
  assert.equal(slots.destructive, undefined);
  assert.equal(slots.secondary, undefined);
});

test('the omitted slots are named in the header so the file is not read as complete', () => {
  const css = generateShadcnTheme(DARK_PAGE);
  assert.match(css, /13 of 18 slots were observed/);
  assert.match(css, /left to shadcn defaults:.*popover/);
});

test('a card never lands at the far end of the lightness scale from the page', () => {
  const slots = collectShadcnSlots(DARK_PAGE);
  assert.notEqual(slots.card, '#ffffff', 'a white card on a near-black page is not a measurement');
  assert.equal(slots.card, '#141a24');
  assert.equal(slots['card-foreground'], '#e2ecef');
});

test('a translucent value keeps its alpha instead of flattening to the solid colour', () => {
  const css = generateShadcnTheme(DARK_PAGE);
  assert.match(css, /--muted: rgba\(255, 255, 255, 0\.05\)/);
  assert.match(css, /--ring: rgba\(39, 107, 218, 0\.2\)/);
  assert.doesNotMatch(css, /--muted: oklch\(100/);
});

test('opaque values are written in oklch, the notation shadcn itself uses', () => {
  const css = generateShadcnTheme(DARK_PAGE);
  assert.match(css, /--primary: oklch\(/);
  assert.match(css, /--background: oklch\(/);
});

test('radius takes a single length, never a multi-corner shorthand', () => {
  const css = generateShadcnTheme(DARK_PAGE);
  assert.match(css, /--radius: 8px;/);
  assert.doesNotMatch(css, /--radius: 0px 2px/);
});

test('the @theme inline block maps every slot that was written, and nothing else', () => {
  const css = generateShadcnTheme(DARK_PAGE);
  const [, mapping] = css.split('@theme inline {');
  assert.ok(mapping, 'the mapping block is required or the file does nothing');
  assert.match(mapping, /--color-primary: var\(--primary\);/);
  assert.doesNotMatch(mapping, /--color-popover:/);
  assert.match(mapping, /--radius-lg: var\(--radius\);/);
});

test('a dark-mode run writes the .dark block instead of :root', () => {
  const dark = generateShadcnTheme({ ...(DARK_PAGE as object), meta: { darkMode: true } } as never);
  assert.match(dark, /^\.dark \{/m);
  assert.doesNotMatch(dark, /^:root \{/m);
});

test('an empty extraction produces a file with no slots rather than throwing', () => {
  const css = generateShadcnTheme({} as never);
  assert.match(css, /0 of 18 slots were observed/);
  assert.match(css, /:root \{\n\}/);
});

test('every slot the collector can emit is a name shadcn knows', () => {
  const slots = collectShadcnSlots(DARK_PAGE);
  for (const name of Object.keys(slots)) {
    assert.ok((SHADCN_SLOTS as readonly string[]).includes(name), `${name} is not a shadcn slot`);
  }
});
