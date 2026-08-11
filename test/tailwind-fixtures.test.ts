import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generateTailwindTheme, type TailwindThemeInput } from '../lib/formatters/tailwind.js';
import { compile } from './helpers/tailwind-compile.js';

/**
 * The rest of the Tailwind tests feed the emitter input written by hand, which
 * cannot catch the extractor changing shape underneath it. These run real
 * saved extractions through it instead, deliberately spanning several
 * dembrandtVersions (including one predating the version field) so a field the
 * emitter still reads defensively stays exercised.
 *
 * Refresh by copying a `output/<domain>/<timestamp>.json` in and naming it
 * `<domain>.<version>.json`. Keep the old ones: their value is their age.
 */

const dir = fileURLToPath(new URL('./fixtures/extractions/', import.meta.url));
const fixtures = readdirSync(dir).filter(name => name.endsWith('.json'));

test('there are extraction fixtures to check against', () => {
  // A silently empty directory would turn every test below into a no-op.
  assert.ok(fixtures.length >= 4, `expected several fixtures, found ${fixtures.length}`);
});

for (const name of fixtures) {
  test(`${name} produces a usable theme`, () => {
    const payload = JSON.parse(readFileSync(dir + name, 'utf8')) as TailwindThemeInput;
    const css = generateTailwindTheme(payload);

    assert.match(css, /@import "tailwindcss";/);
    assert.match(css, /@theme \{/);
    assert.equal(css.trimEnd().endsWith('}'), true);

    // A real page yields tokens. An empty @theme means the emitter stopped
    // recognising the payload shape rather than that the site has no design.
    const tokens = [...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)];
    assert.ok(tokens.length >= 5, `only ${tokens.length} tokens from a real extraction`);

    // Undefined reaching the output is the shape-drift symptom: a renamed
    // field reads as undefined and gets serialised rather than skipped.
    assert.doesNotMatch(css, /undefined|null|NaN|\[object Object\]/);
  });

  test(`${name} names every token legally`, () => {
    const payload = JSON.parse(readFileSync(dir + name, 'utf8')) as TailwindThemeInput;
    const css = generateTailwindTheme(payload);

    const names = [...css.matchAll(/^\s*(--[^:]+):/gm)].map(m => m[1]);
    for (const token of names) {
      // Tailwind resolves theme keys by name, so anything a site can put in a
      // custom property (spaces, quotes, unicode) has to have been slugged
      // away before it lands here.
      assert.match(token, /^--[a-z0-9-]+$/, `${token} is not a usable theme key`);
    }

    // Duplicates are the other failure: a later declaration silently shadows
    // an earlier one and a token the user can see in the file does nothing.
    assert.equal(new Set(names).size, names.length, 'a token name is declared twice');
  });

  test(`${name} compiles`, () => {
    const payload = JSON.parse(readFileSync(dir + name, 'utf8')) as TailwindThemeInput;

    // Hand-written input cannot produce the values a real page does. This is
    // where a shadow layer or a colour notation Tailwind rejects shows up.
    const out = compile(generateTailwindTheme(payload), ['bg-primary']);

    assert.ok(out.includes('@layer theme'), 'the theme layer did not survive compilation');
  });
}
