import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rgbToLch, rgbToOklch, formatLch, formatOklch, formatColor, COLOR_FORMATS } from '../lib/colors.js';
import { parseCssColor } from '../lib/color-parse.js';

// Safety net for the colour serialisers. These are exhaustive-ish sweeps rather
// than hand-picked cases: the failure mode they exist for is a rounding change
// that looks harmless and silently shifts every emitted colour.

/** Deterministic sweep over the sRGB cube. ~40k samples, still fast. */
function* srgbSweep() {
  for (let r = 0; r < 256; r += 7) {
    for (let g = 0; g < 256; g += 5) {
      for (let b = 0; b < 256; b += 11) yield [r, g, b] as [number, number, number];
    }
  }
}

test('oklch() round-trips exactly across the sRGB cube', () => {
  // A user pasting our oklch() into their stylesheet must get the colour we
  // extracted, not one up to 6/255 away from it.
  for (const [r, g, b] of srgbSweep()) {
    const emitted = formatOklch(rgbToOklch(r, g, b));
    const back = parseCssColor(emitted);
    assert.ok(back, `unparseable: ${emitted}`);
    assert.deepEqual(
      { r: back.r, g: back.g, b: back.b },
      { r, g, b },
      `${emitted} re-parsed to ${back.r},${back.g},${back.b} from ${r},${g},${b}`,
    );
  }
});

test('lch() round-trips exactly across the sRGB cube', () => {
  for (const [r, g, b] of srgbSweep()) {
    const emitted = formatLch(rgbToLch(r, g, b));
    const back = parseCssColor(emitted);
    assert.ok(back, `unparseable: ${emitted}`);
    assert.deepEqual({ r: back.r, g: back.g, b: back.b }, { r, g, b }, emitted);
  }
});

test('achromatic colours emit hue 0 in oklch instead of float noise', () => {
  // OKLab is defined on a D65 white point that matches sRGB's, so a grey lands
  // on exactly zero chroma and the hue must not carry an arbitrary angle.
  for (const v of [0, 1, 64, 128, 200, 254, 255]) {
    const ok = formatOklch(rgbToOklch(v, v, v));
    assert.match(ok, /^oklch\([\d.]+% 0 0\)$/, ok);
  }
});

test('greys keep a residual chroma in lch, which is D50 and not a bug', () => {
  // lch() is emitted at D50 as the CSS spec requires, and sRGB grey is not
  // neutral under D50: chroma lands near 0.01-0.03 with a constant hue. Zeroing
  // it would break the exact round trip above, so it is preserved and pinned
  // here so nobody "fixes" it into a colour shift.
  for (const v of [64, 128, 200, 255]) {
    const lch = formatLch(rgbToLch(v, v, v));
    const m = lch.match(/^lch\([\d.]+% ([\d.]+) ([\d.]+)\)$/);
    assert.ok(m, lch);
    assert.ok(parseFloat(m[1]) < 0.05, `chroma drifted: ${lch}`);
    assert.ok(Math.abs(parseFloat(m[2]) - 53.346) < 0.01, `hue drifted: ${lch}`);
  }
});

test('every format returns a non-empty string for every colour, and never throws', () => {
  for (const [r, g, b] of srgbSweep()) {
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    for (const f of COLOR_FORMATS) {
      const out = formatColor(hex, f);
      assert.ok(typeof out === 'string' && out.length > 0, `${f} on ${hex}`);
      assert.ok(!out.includes('NaN') && !out.includes('undefined'), `${f} on ${hex}: ${out}`);
    }
  }
});

test('alpha survives the round trip at 2-decimal fidelity', () => {
  for (const a of [0.01, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 0.99]) {
    for (const f of ['rgb', 'oklch', 'lch'] as const) {
      const emitted = formatColor(`rgba(26, 115, 232, ${a})`, f);
      const back = parseCssColor(emitted);
      assert.ok(back, emitted);
      assert.ok(Math.abs(back.a - a) < 0.005, `${f}: ${emitted} gave alpha ${back.a}`);
    }
  }
});

test('unparseable input is echoed back, never rewritten or fabricated', () => {
  const unparseable = ['', ' ', 'currentcolor', 'var(--x)', 'oklch()', 'oklch(NaN NaN NaN)',
    '#', '#12345', 'rgb(1,2)', 'color(unknownspace 1 1 1)', '\n\t', 'javascript:alert(1)'];
  for (const j of unparseable) {
    for (const f of COLOR_FORMATS) {
      const out = formatColor(j, f);
      assert.equal(typeof out, 'string', `${f} on ${JSON.stringify(j)}`);
      // The contract is echo-on-failure: unparseable input comes back verbatim
      // so the caller can still show what the site declared. What must never
      // happen is a fabricated value, i.e. NaN we introduced ourselves.
      assert.equal(out, j, `${f} on ${JSON.stringify(j)} rewrote it to ${out}`);
    }
  }
});

test('out-of-range but valid input is clamped and gamut-mapped, not echoed', () => {
  // These parse, so they must come back as real colours rather than verbatim.
  assert.equal(formatColor('rgb(999,999,999)', 'hex'), '#ffffff');
  const mapped = formatColor('oklch(200% 99 9999)', 'hex');
  assert.match(mapped, /^#[0-9a-f]{6}$/, mapped);
});
