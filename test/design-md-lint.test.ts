import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lint } from '@google/design.md/linter';
import { generateDesignMd, DESIGN_MD_TARGET_SPEC } from '../lib/formatters/markdown.js';

/**
 * DESIGN.md is a format we do not own. markdown.test.ts asserts on the emitted
 * string, which proves the emitter writes what we told it to write; it cannot
 * prove the spec accepts it. These run the real upstream linter over real
 * emitter output, the same way tailwind-compile.test.ts runs the real Tailwind
 * compiler over the emitted theme.
 *
 * The failure this catches is the one that costs us most and announces itself
 * least: our export silently stops validating after an upstream spec change,
 * and the first person to notice is a user piping `--design-md` into
 * `npx @google/design.md lint`.
 *
 * The linter is pinned as a devDependency rather than fetched, so this runs
 * offline and deterministically. DESIGN_MD_TARGET_SPEC records which release
 * the emitter is known to satisfy; tools/design-md-check.mjs watches for a
 * newer one.
 */

function sample(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com',
    extractedAt: '2026-01-01T00:00:00.000Z',
    meta: { dembrandtVersion: '0.28.0' },
    colors: {
      semantic: { primary: '#1a73e8', background: '#ffffff', text: '#202124', accent: '#e8590c' },
      palette: [
        { color: '#1a73e8', normalized: '#1a73e8', count: 40, confidence: 'high' },
        { color: '#e8590c', normalized: '#e8590c', count: 12, confidence: 'medium' },
        { color: '#202124', normalized: '#202124', count: 80, confidence: 'high' },
      ],
      cssVariables: {},
    },
    typography: {
      styles: [
        { context: 'body', family: 'Inter', fallbacks: ['sans-serif'], size: '16px', weight: 400, lineHeight: '1.5' },
        { context: 'heading-1', family: 'Inter', size: '32px', weight: 700, letterSpacing: '-0.5px' },
      ],
      sources: {},
    },
    spacing: {
      scaleType: '8px',
      commonValues: [{ px: 8, display: '8px' }, { px: 16, display: '16px' }, { px: 24, display: '24px' }],
    },
    borderRadius: { values: [{ value: '4px', count: 20, confidence: 'high' }, { value: '8px', count: 10, confidence: 'high' }] },
    borders: {},
    shadows: [],
    components: {
      buttons: [{ text: 'Get started', backgroundColor: '#1a73e8', color: '#ffffff', borderRadius: '4px', padding: '12px 24px' }],
      inputs: [],
      links: [],
      badges: [],
    },
    breakpoints: [],
    iconSystem: [],
    frameworks: [],
    ...overrides,
  };
}

const errorsIn = (md: string) => {
  const result = lint(md) as { findings: Array<{ severity: string; message: string; path?: string }> };
  return result.findings.filter((f) => f.severity === 'error');
};

test('a full extraction emits a DESIGN.md the upstream spec accepts', () => {
  const errors = errorsIn(generateDesignMd(sample()));
  assert.deepEqual(
    errors,
    [],
    `emitted DESIGN.md failed spec ${DESIGN_MD_TARGET_SPEC}:\n${errors.map((e) => `  ${e.path ?? '-'}: ${e.message}`).join('\n')}`,
  );
});

/**
 * A real extraction is often partial: a site with no detectable radius, no
 * components, or a single colour. The emitter must degrade to a still-valid
 * document rather than to one that trips the spec's structural rules, since
 * those are exactly the sites a user is most likely to be debugging.
 */
test('a sparse extraction still emits a valid DESIGN.md', () => {
  const sparse = sample({
    borderRadius: { values: [] },
    spacing: { scaleType: 'unknown', commonValues: [] },
    components: { buttons: [], inputs: [], links: [], badges: [] },
    typography: { styles: [], sources: {} },
    colors: { semantic: { primary: '#1a73e8' }, palette: [], cssVariables: {} },
  });
  const errors = errorsIn(generateDesignMd(sparse));
  assert.deepEqual(
    errors,
    [],
    `sparse DESIGN.md failed spec ${DESIGN_MD_TARGET_SPEC}:\n${errors.map((e) => `  ${e.path ?? '-'}: ${e.message}`).join('\n')}`,
  );
});

/**
 * Token references are the part of the spec most likely to break silently: a
 * component pointing at a colour we renamed produces a document that still
 * parses. The linter resolves the symbol table, so an unresolved reference is
 * reported rather than shipped.
 */
test('component token references resolve against the emitted colour tokens', () => {
  const md = generateDesignMd(sample());
  const result = lint(md) as { findings: Array<{ severity: string; message: string }> };
  const unresolved = result.findings.filter(
    (f) => f.severity !== 'info' && /unresolved|unknown reference|not defined/i.test(f.message),
  );
  assert.deepEqual(unresolved, [], `unresolved token references:\n${unresolved.map((f) => `  ${f.message}`).join('\n')}`);
});
