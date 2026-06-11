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
 * formatter regression emitting a malformed token.
 *
 * The fixture is a small synthetic extraction, not a saved real crawl: it is
 * hand-built to exercise all six exporters (color, typography, spacing, radius,
 * border, shadow) in a few dozen lines, so it stays readable and is trivially
 * edited when the contract changes. Any new token type the formatter emits is
 * covered here as long as the fixture exercises it.
 */

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../test/fixtures');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const FIXTURE = 'extraction-synthetic.sample.json';

describe('DTCG formatter output is spec-valid', () => {
  it(`${FIXTURE} is pinned to the current output contract`, () => {
    // A fixture from an older schema would validate a historical extraction
    // shape, not what the formatter sees today. Fail loudly when it drifts so
    // the fixture gets updated instead of silently rotting.
    const fixture = loadFixture(FIXTURE);
    expect(fixture.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it(`${FIXTURE} -> toDtcgTokens -> validateTokensObject passes`, () => {
    const tokens = toDtcgTokens(loadFixture(FIXTURE));
    const result = validateTokensObject(tokens);
    // join() surfaces the actual validator errors in the failure message.
    expect(result.errors.join('; ')).toBe('');
    expect(result.valid).toBe(true);
  });

  it('exercises all six exporters', () => {
    const tokens = toDtcgTokens(loadFixture(FIXTURE));
    for (const group of ['color', 'typography', 'spacing', 'radius', 'border', 'shadow']) {
      // present means the exporter ran and emitted at least one token group
      expect(typeof tokens[group]).toBe('object');
    }
  });
});
