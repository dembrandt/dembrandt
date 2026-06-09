import { describe, it, expect } from './_vitest-shim.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toDtcgTokens } from '../lib/formatters/dtcg.js';
import { validateTokensObject } from '../lib/dtcg/validate.js';
import { SCHEMA_VERSION } from '../lib/version.js';

/**
 * End-to-end guard: the DTCG formatter's own output must satisfy the DTCG
 * validator. The validator does not run at extraction time (index.ts emits
 * toDtcgTokens output unchecked), so this is the only gate that catches a
 * formatter regression emitting a malformed token. Real saved extractions are
 * used as fixtures; any new token type the formatter emits is covered here as
 * long as a fixture exercises it.
 */

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../test/fixtures');

// dembrandt: dogfood, exercises color/typography/spacing/radius/border.
// anthropic: additionally exercises the shadow exporter.
const fixtures = [
  'extraction-dembrandt.sample.json',
  'extraction-anthropic.sample.json',
];

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('DTCG formatter output is spec-valid', () => {
  for (const name of fixtures) {
    it(`${name} matches the current output contract`, () => {
      // A fixture from an older schema would validate a historical extraction
      // shape, not what the formatter sees today. Fail loudly when it drifts so
      // the fixtures get regenerated instead of silently rotting.
      const fixture = loadFixture(name);
      expect(fixture.meta.schemaVersion).toBe(SCHEMA_VERSION);
    });

    it(`${name} -> toDtcgTokens -> validateTokensObject passes`, () => {
      const tokens = toDtcgTokens(loadFixture(name));
      const result = validateTokensObject(tokens);
      // join() surfaces the actual validator errors in the failure message.
      expect(result.errors.join('; ')).toBe('');
      expect(result.valid).toBe(true);
    });
  }
});
