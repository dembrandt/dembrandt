import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDrift } from '../lib/drift.js';
import { formatColor, COLOR_FORMATS } from '../lib/colors.js';
import type { ColorFormat } from '../lib/colors.js';

// --color-format must never be able to fabricate drift. A baseline captured
// while one notation was selected has to compare clean against a run captured
// under any other, because both sides carry the same hex identity.

function extraction(paletteFormat: ColorFormat) {
  const hexes = ['#1a73e8', '#ffd230', '#0f172a'];
  return {
    url: 'https://example.test',
    extractedAt: '2026-08-05T00:00:00.000Z',
    colors: {
      semantic: { primary: formatColor(hexes[0], paletteFormat) },
      // `normalized` is the identity drift compares on; `color` carries whatever
      // notation the run happened to emit.
      palette: hexes.map((h, i) => ({
        color: formatColor(h, paletteFormat),
        normalized: h,
        count: 10 - i,
        confidence: 'high' as const,
      })),
      cssVariables: {},
    },
    typography: { styles: [], sources: {} },
    spacing: { scaleType: 'unknown', commonValues: [] },
    borderRadius: { values: [] },
    borders: { combinations: [] },
    shadows: [],
    components: { buttons: [], inputs: [], links: [], badges: [] },
    breakpoints: [],
    iconSystem: [],
    frameworks: [],
  };
}

test('a hex baseline shows no drift against any other emitted notation', () => {
  const baseline = extraction('hex');
  for (const f of COLOR_FORMATS) {
    const report = computeDrift(baseline as never, extraction(f) as never);
    assert.equal(report.changes.filter((c) => c.category === 'color').length, 0, `${f} produced colour drift`);
  }
});

test('drift still fires on a real colour change, so the guard is not vacuous', () => {
  const baseline = extraction('hex');
  const changed = extraction('hex');
  changed.colors.palette[0].normalized = '#e81a73';
  changed.colors.palette[0].color = '#e81a73';
  const report = computeDrift(baseline as never, changed as never);
  assert.ok(report.changes.some((c) => c.category === 'color'), 'expected colour drift');
});
