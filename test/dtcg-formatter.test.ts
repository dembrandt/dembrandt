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

  it('reads a computed shadow instead of mistaking its colour for an offset', () => {
    const tokens = toDtcgTokens(loadFixture(FIXTURE));
    const single = tokens.shadow['shadow-1'].$value;
    expect(single.offsetY.value).toBe(1);
    expect(single.blur.value).toBe(3);
    expect(single.color.hex).toBe('#000000');
    expect(single.color.alpha).toBe(0.2);
  });

  it('keeps every layer of a multi-layer shadow', () => {
    const tokens = toDtcgTokens(loadFixture(FIXTURE));
    const layers = tokens.shadow['shadow-2'].$value;
    expect(layers).toHaveLength(2);
    expect(layers[0].offsetY.value).toBe(10);
    expect(layers[0].spread.value).toBe(-3);
    expect(layers[1].blur.value).toBe(6);
  });

  it('falls back to black for a named shadow colour rather than inventing hex', () => {
    const tokens = toDtcgTokens({ url: 'https://named.example', shadows: [{ shadow: '0 2px red', confidence: 'high' }] } as any);
    const value = tokens.shadow['shadow-1'].$value;
    expect(value.color.hex).toBe('#000000');
    expect(value.color.components).toHaveLength(3);
    expect(validateTokensObject(tokens).valid).toBe(true);
  });
});
