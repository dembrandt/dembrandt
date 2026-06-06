import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lint, DEFAULT_LINT_CONFIG } from '../lib/lint.js';

// Reference colors (contrast on white):
//   #000000 ~21:1   (passes default min 5.4)
//   #767676 ~4.5:1  (warn band: 3.0 <= c < 5.4)
//   #b3b3b3 ~2.1:1  (hard fail: c < 3.0, always error)

function withPrimary(hex) {
  return { colors: { semantic: { primary: hex }, palette: [] }, typography: { styles: [] }, frameworks: [] };
}

function accents(n) {
  return {
    colors: { palette: Array.from({ length: n }, () => ({ role: 'accent', normalized: '#123456' })) },
    typography: { styles: [] },
    frameworks: [],
  };
}

test('lint returns errors/warnings/info/all arrays', () => {
  const r = lint(withPrimary('#000000'));
  assert.ok(Array.isArray(r.errors));
  assert.ok(Array.isArray(r.warnings));
  assert.ok(Array.isArray(r.info));
  assert.ok(Array.isArray(r.all));
});

test('primary-contrast: passing color reports info, not a violation', () => {
  const r = lint(withPrimary('#000000'));
  const hit = r.all.find((x) => x.rule === 'primary-contrast');
  assert.equal(hit.level, 'info');
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 0);
});

test('primary-contrast: warn-band color warns at default level', () => {
  const r = lint(withPrimary('#767676'));
  const hit = r.all.find((x) => x.rule === 'primary-contrast');
  assert.equal(hit.level, 'warn');
  assert.equal(r.warnings.length, 1);
});

test('primary-contrast: contrast below hard-fail is always error', () => {
  // Configured level is info, but a sub-3.0 contrast must escalate to error.
  const r = lint(withPrimary('#b3b3b3'), { rules: { 'primary-contrast': ['info', { min: 5.4 }] } });
  const hit = r.all.find((x) => x.rule === 'primary-contrast');
  assert.equal(hit.level, 'error');
  assert.equal(r.errors.length, 1);
});

test('primary-contrast: configured level applies to warn-band violations', () => {
  const r = lint(withPrimary('#767676'), { rules: { 'primary-contrast': 'error' } });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].rule, 'primary-contrast');
});

test('primary-contrast: custom min raises the bar', () => {
  // #000000 (~21:1) passes default but configure an impossible min to force a violation.
  const r = lint(withPrimary('#000000'), { rules: { 'primary-contrast': ['warn', { min: 25 }] } });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].message, /below 25:1/);
});

test('primary-contrast: no primary color yields no result', () => {
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [] });
  assert.equal(r.all.filter((x) => x.rule === 'primary-contrast').length, 0);
});

test('rule set to "off" produces no results at all (not even info)', () => {
  const r = lint(accents(3), { rules: { 'palette-size': 'off' } });
  assert.equal(r.all.filter((x) => x.rule === 'palette-size').length, 0);
});

test('palette-size: exceeding max warns at default', () => {
  const r = lint(accents(9));
  const hit = r.all.find((x) => x.rule === 'palette-size');
  assert.equal(hit.level, 'warn');
  assert.match(hit.message, /exceeds recommended maximum of 8/);
});

test('palette-size: within max reports info', () => {
  const r = lint(accents(3));
  const hit = r.all.find((x) => x.rule === 'palette-size');
  assert.equal(hit.level, 'info');
});

test('palette-size: custom max is respected', () => {
  const r = lint(accents(9), { rules: { 'palette-size': ['warn', { max: 12 }] } });
  const hit = r.all.find((x) => x.rule === 'palette-size');
  assert.equal(hit.level, 'info');
});

test('palette-size: data viz context skips the rule', () => {
  const result = accents(20);
  result.frameworks = [{ name: 'recharts' }];
  const r = lint(result);
  const hit = r.all.find((x) => x.rule === 'palette-size');
  assert.equal(hit.level, 'info');
  assert.match(hit.message, /Data viz context/);
});

test('typography-scale: consistent scale reports info', () => {
  const styles = ['16px', '20px', '25px', '31.25px'].map((size) => ({ size })); // ratio 1.25
  const r = lint({ colors: { palette: [] }, typography: { styles }, frameworks: [] });
  const hit = r.all.find((x) => x.rule === 'typography-scale');
  assert.equal(hit.level, 'info');
});

test('typography-scale: irregular scale warns past maxDeviations', () => {
  const styles = ['16px', '18px', '20px', '40px', '80px'].map((size) => ({ size }));
  const r = lint({ colors: { palette: [] }, typography: { styles }, frameworks: [] });
  const hit = r.all.find((x) => x.rule === 'typography-scale');
  assert.equal(hit.level, 'warn');
});

test('typography-scale: raising maxDeviations tolerates irregularity', () => {
  const styles = ['16px', '18px', '20px', '40px', '80px'].map((size) => ({ size }));
  const r = lint(
    { colors: { palette: [] }, typography: { styles }, frameworks: [] },
    { rules: { 'typography-scale': ['warn', { maxDeviations: 10 }] } }
  );
  const hit = r.all.find((x) => x.rule === 'typography-scale');
  assert.equal(hit.level, 'info');
});

function buttons(list) {
  return { colors: { palette: [] }, typography: { styles: [] }, frameworks: [], components: { buttons: list } };
}

test('button-contrast: low-contrast solid button warns', () => {
  const r = lint(buttons([{ states: { default: { backgroundColor: 'rgb(200,200,200)', color: 'rgb(255,255,255)' } }, text: 'Buy' }]));
  const hit = r.all.find((x) => x.rule === 'button-contrast');
  assert.equal(hit.level, 'warn');
  assert.match(hit.message, /WCAG AA/);
});

test('button-contrast: readable button reports info', () => {
  const r = lint(buttons([{ states: { default: { backgroundColor: 'rgb(0,0,0)', color: 'rgb(255,255,255)' } }, text: 'Buy' }]));
  const hit = r.all.find((x) => x.rule === 'button-contrast');
  assert.equal(hit.level, 'info');
});

test('button-contrast: transparent (ghost) buttons are skipped', () => {
  const r = lint(buttons([{ states: { default: { backgroundColor: 'rgba(0,0,0,0)', color: 'rgb(200,200,200)' } }, text: 'Ghost' }]));
  assert.equal(r.all.filter((x) => x.rule === 'button-contrast').length, 0);
});

test('button-contrast: reports the worst button and respects custom level', () => {
  const r = lint(
    buttons([
      { states: { default: { backgroundColor: 'rgb(0,0,0)', color: 'rgb(255,255,255)' } }, text: 'Good' },
      { states: { default: { backgroundColor: 'rgb(230,230,230)', color: 'rgb(255,255,255)' } }, text: 'Bad' },
    ]),
    { rules: { 'button-contrast': 'error' } },
  );
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /"Bad"/);
});

test('config accepts ESLint [level, options] and bare level forms together', () => {
  const r = lint(accents(9), {
    rules: { 'palette-size': ['error', { max: 4 }] },
  });
  const hit = r.all.find((x) => x.rule === 'palette-size');
  assert.equal(hit.level, 'error');
  assert.match(hit.message, /maximum of 4/);
});

// ---- body-text-size ----
test('body-text-size: body copy below 16px warns', () => {
  const styles = [{ context: 'body', size: '14px' }];
  const r = lint({ colors: { palette: [] }, typography: { styles }, frameworks: [] });
  assert.equal(r.warnings.filter((x) => x.rule === 'body-text-size').length, 1);
});

test('body-text-size: 16px body copy passes', () => {
  const styles = [{ context: 'body', size: '16px' }];
  const r = lint({ colors: { palette: [] }, typography: { styles }, frameworks: [] });
  assert.equal(r.all.find((x) => x.rule === 'body-text-size').level, 'info');
});

// ---- radius-consistency ----
test('radius-consistency: too many distinct radii warns, pills excluded', () => {
  const values = ['2px', '4px', '6px', '8px', '12px', '16px', '50%', '9999px'].map((value) => ({ value }));
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], borderRadius: { values } });
  const hit = r.all.find((x) => x.rule === 'radius-consistency');
  assert.equal(hit.level, 'warn');
  assert.equal(hit.value, '6'); // 6 real radii, 50% and 9999px excluded
});

test('radius-consistency: a tidy scale passes', () => {
  const values = ['4px', '8px', '12px'].map((value) => ({ value }));
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], borderRadius: { values } });
  assert.equal(r.all.find((x) => x.rule === 'radius-consistency').level, 'info');
});

// ---- shadow-scale ----
test('shadow-scale: too many distinct shadows warns', () => {
  const shadows = Array.from({ length: 8 }, (_, i) => ({ shadow: `0 ${i + 1}px ${i + 2}px rgba(0,0,0,0.1)` }));
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], shadows });
  assert.equal(r.all.find((x) => x.rule === 'shadow-scale').level, 'warn');
});

// ---- button-variants ----
test('button-variants: too many distinct button styles warns', () => {
  const buttons = Array.from({ length: 7 }, (_, i) => ({ states: { default: { backgroundColor: `rgb(${i},0,0)`, color: '#fff', borderRadius: '4px', border: 'none' } } }));
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], components: { buttons } });
  assert.equal(r.all.find((x) => x.rule === 'button-variants').level, 'warn');
});

// ---- focus-visible ----
test('focus-visible: inputs with no focus state warn', () => {
  const inputs = { text: [{ states: { default: {}, focus: null } }] };
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], components: { inputs } });
  assert.equal(r.warnings.filter((x) => x.rule === 'focus-visible').length, 1);
});

test('focus-visible: a visible focus indicator passes', () => {
  const inputs = { text: [{ states: { default: {}, focus: { outline: '2px solid blue' } } }] };
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], components: { inputs } });
  assert.equal(r.all.find((x) => x.rule === 'focus-visible').level, 'info');
});

// ---- logo-format ----
test('logo-format: raster logo warns', () => {
  const r = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], logo: { source: 'img', url: 'https://x.com/logo.png' } });
  const hit = r.all.find((x) => x.rule === 'logo-format');
  assert.equal(hit.level, 'warn');
  assert.equal(hit.value, 'png');
});

test('logo-format: SVG logo passes (by source or extension)', () => {
  const bySource = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], logo: { source: 'svg', url: 'https://x.com/brand' } });
  assert.equal(bySource.all.find((x) => x.rule === 'logo-format').level, 'info');
  const byExt = lint({ colors: { palette: [] }, typography: { styles: [] }, frameworks: [], logo: { source: 'img', url: 'https://x.com/logo.svg' } });
  assert.equal(byExt.all.find((x) => x.rule === 'logo-format').level, 'info');
});

test('DEFAULT_LINT_CONFIG exposes every rule with a level', () => {
  for (const [name, cfg] of Object.entries(DEFAULT_LINT_CONFIG)) {
    assert.ok(cfg.level, `${name} must declare a level`);
  }
});
