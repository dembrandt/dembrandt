/**
 * Color Conversion Utilities
 *
 * Converts colors between RGB, LCH, and OKLCH color spaces.
 * Parsing of arbitrary CSS color strings lives in color-parse.ts.
 */

import { parseCssColor } from './color-parse.js';

/**
 * Convert sRGB to linear RGB
 */
function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convert linear RGB to XYZ (D65 illuminant)
 */
function linearRgbToXyz(r, g, b) {
  return {
    x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    y: 0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    z: 0.0193339 * r + 0.1191920 * g + 0.9503041 * b
  };
}

/**
 * Convert XYZ to Lab against a reference white. Defaults to D65, which is what
 * the perceptual-distance helpers below use; CSS lch() emission passes D50.
 */
function xyzToLab(x, y, z, white = { x: 0.95047, y: 1.00000, z: 1.08883 }) {
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116;

  const fx = f(x / white.x);
  const fy = f(y / white.y);
  const fz = f(z / white.z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

// Bradford adaptation D65 → D50. CSS lab()/lch() are specified at D50 while
// sRGB lives at D65, so emitted lch() strings must adapt or they are ~ΔE 1 off
// (GitHub #149).
const D50_WHITE = { x: 0.96422, y: 1.00000, z: 0.82521 };
const XYZ_D65_TO_D50 = [
  [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
  [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
  [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];

/**
 * Convert Lab to LCH
 */
function labToLch(l, a, b) {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  return {
    l: l,
    c: c,
    h: h
  };
}

/**
 * Convert RGB to LCH
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ l: number, c: number, h: number }}
 */
export function rgbToLch(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const d65 = linearRgbToXyz(lr, lg, lb);
  const m = XYZ_D65_TO_D50;
  const xyz = {
    x: m[0][0] * d65.x + m[0][1] * d65.y + m[0][2] * d65.z,
    y: m[1][0] * d65.x + m[1][1] * d65.y + m[1][2] * d65.z,
    z: m[2][0] * d65.x + m[2][1] * d65.y + m[2][2] * d65.z,
  };
  const lab = xyzToLab(xyz.x, xyz.y, xyz.z, D50_WHITE);
  return labToLch(lab.l, lab.a, lab.b);
}

/**
 * Convert linear RGB to OKLab
 * Uses the OKLab color space for perceptual uniformity
 */
function linearRgbToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

/**
 * Convert OKLab to OKLCH
 */
function oklabToOklch(L, a, b) {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  return {
    l: L,
    c: c,
    h: h
  };
}

/**
 * Convert RGB to OKLCH
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ l: number, c: number, h: number }}
 */
export function rgbToOklch(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const oklab = linearRgbToOklab(lr, lg, lb);
  return oklabToOklch(oklab.L, oklab.a, oklab.b);
}

/**
 * Format LCH values as CSS lch() string
 * @param {{ l: number, c: number, h: number }} lch
 * @param {number} [alpha] - Optional alpha value (0-1)
 * @returns {string}
 */
export function formatLch(lch, alpha?: number) {
  // Precision is chosen so a serialise/parse round trip is lossless at 8-bit
  // sRGB: at 2 decimals the cycle shifted a channel by up to 1/255, which is a
  // silent colour change for anyone pasting the emitted value back into CSS.
  const l = Math.round(lch.l * 1000) / 1000;
  const c = Math.round(lch.c * 1000) / 1000;
  // Hue is meaningless once chroma rounds away (atan2 on denormal a/b yields a
  // stable but arbitrary angle for neutrals), so pin achromatic colours to 0
  // rather than emitting lch(53.59% 0 53.35) for mid grey.
  const h = c === 0 ? 0 : Math.round(lch.h * 1000) / 1000;

  if (alpha !== undefined && alpha < 1) {
    return `lch(${l}% ${c} ${h} / ${alpha})`;
  }
  return `lch(${l}% ${c} ${h})`;
}

/**
 * Format OKLCH values as CSS oklch() string
 * @param {{ l: number, c: number, h: number }} oklch
 * @param {number} [alpha] - Optional alpha value (0-1)
 * @returns {string}
 */
export function formatOklch(oklch, alpha?: number) {
  // OKLCH lightness is 0-1, displayed as percentage. Precision is chosen so a
  // serialise/parse round trip is lossless at 8-bit sRGB: at 2 decimals on L and
  // 3 on C the cycle shifted a channel by up to 6/255, a visible shift for
  // anyone pasting the emitted value back into their CSS.
  const l = Math.round(oklch.l * 1000000) / 10000;
  const c = Math.round(oklch.c * 100000) / 100000;
  // See formatLch: a neutral's hue is float noise, so pin it to 0.
  const h = c === 0 ? 0 : Math.round(oklch.h * 1000) / 1000;

  if (alpha !== undefined && alpha < 1) {
    return `oklch(${l}% ${c} ${h} / ${alpha})`;
  }
  return `oklch(${l}% ${c} ${h})`;
}

/**
 * Convert 0-255 sRGB to CIE Lab against D65. Exported because the drift engine
 * needs Lab from parsed rgb triples rather than from hex, and a second hand-
 * rolled copy of this maths is how the same metric ends up disagreeing with
 * itself (DEM-211).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{ l: number, a: number, b: number }}
 */
export function rgbToLab(r, g, b) {
  const xyz = linearRgbToXyz(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

/**
 * Compute CIE76 delta-E perceptual distance between two hex colors.
 * Returns 0 for identical colors, ~100 for maximally different.
 * @param {string} hex1 - Hex color string (e.g. "#ff0000")
 * @param {string} hex2 - Hex color string
 * @returns {number}
 */
export function deltaE(hex1, hex2) {
  const toLab = (hex) => {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToLab(rgb.r, rgb.g, rgb.b) : null;
  };
  const lab1 = toLab(hex1);
  const lab2 = toLab(hex2);
  if (!lab1 || !lab2) return 999;
  return Math.sqrt(
    Math.pow(lab1.l - lab2.l, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

/**
 * Perceptual color distance using CIEDE2000 — the accurate successor to the
 * CIE76 Euclidean distance in deltaE(). Accepts hex or rgb()/rgba() strings.
 * Returns 0 for identical inputs and 100 when either color cannot be parsed.
 * A just-noticeable difference is ~2.3.
 * @param {string} c1
 * @param {string} c2
 * @returns {number}
 */
export function deltaE2000(c1, c2) {
  if (c1 === c2) return 0;
  const lab1 = toLabFlexible(c1);
  const lab2 = toLabFlexible(c2);
  if (!lab1 || !lab2) return 100;
  return ciede2000(lab1, lab2);
}

function toLabFlexible(input) {
  let rgb = hexToRgb(input);
  if (!rgb) {
    const m = String(input).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) rgb = { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  if (!rgb) return null;
  const xyz = linearRgbToXyz(srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b));
  return xyzToLab(xyz.x, xyz.y, xyz.z); // { l, a, b }
}

function ciede2000(lab1, lab2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const { l: L1, a: a1, b: b1 } = lab1;
  const { l: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.sqrt(a1 ** 2 + b1 ** 2);
  const C2 = Math.sqrt(a2 ** 2 + b2 ** 2);
  const Cab = (C1 + C2) / 2;
  const Cab7 = Cab ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p ** 2 + b1 ** 2);
  const C2p = Math.sqrt(a2p ** 2 + b2 ** 2);

  let h1p = deg(Math.atan2(b1, a1p)); if (h1p < 0) h1p += 360;
  let h2p = deg(Math.atan2(b2, a2p)); if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;

  let hpm;
  if (C1p * C2p === 0) hpm = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hpm = (h1p + h2p + 360) / 2;
  else hpm = (h1p + h2p - 360) / 2;

  const T = 1
    - 0.17 * Math.cos(rad(hpm - 30))
    + 0.24 * Math.cos(rad(2 * hpm))
    + 0.32 * Math.cos(rad(3 * hpm + 6))
    - 0.20 * Math.cos(rad(4 * hpm - 63));

  const SL = 1 + 0.015 * (Lpm - 50) ** 2 / Math.sqrt(20 + (Lpm - 50) ** 2);
  const SC = 1 + 0.045 * Cpm;
  const SH = 1 + 0.015 * Cpm * T;

  const Cpm7 = Cpm ** 7;
  const RC = 2 * Math.sqrt(Cpm7 / (Cpm7 + 25 ** 7));
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 +
    (dCp / SC) ** 2 +
    (dHp / SH) ** 2 +
    RT * (dCp / SC) * (dHp / SH)
  );
}

/**
 * Parse a hex color string and return RGB values
 * @param {string} hex - Hex color (#fff, #ffffff, #ffffffaa)
 * @returns {{ r: number, g: number, b: number, a?: number } | null}
 */
export function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return null;

  // Remove #
  hex = hex.slice(1);

  // Handle 3-digit hex
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16)
    };
  }

  // Handle 6-digit hex
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  // Handle 8-digit hex (with alpha)
  if (hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255
    };
  }

  return null;
}

/**
 * Compute WCAG 2.1 relative luminance for a hex color.
 * @param {string} hex
 * @returns {number|null}
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

/**
 * Compute WCAG contrast ratios for all pairs in a color palette.
 * @param {Array<{color: string, normalized: string, confidence: string}>} palette
 * @returns {Array<{fg: string, bg: string, ratio: number, aa: boolean, aaLarge: boolean, aaa: boolean}>}
 */
export function computeWcag(palette) {
  const colors = palette
    .filter(c => c.normalized && c.normalized.startsWith('#'))
    .slice(0, 10);

  const pairs = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const l1 = relativeLuminance(colors[i].normalized);
      const l2 = relativeLuminance(colors[j].normalized);
      if (l1 === null || l2 === null) continue;
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const fg = l1 >= l2 ? colors[i].normalized : colors[j].normalized;
      const bg = l1 >= l2 ? colors[j].normalized : colors[i].normalized;
      pairs.push({
        fg,
        bg,
        ratio: Math.round(ratio * 100) / 100,
        aa: ratio >= 4.5,
        aaLarge: ratio >= 3,
        aaa: ratio >= 7,
      });
    }
  }

  return pairs.sort((a, b) => b.ratio - a.ratio);
}

/**
 * Notations a user may select for emitted colors. `source` keeps the string as
 * authored (only meaningful where provenance survived extraction, i.e. declared
 * custom properties); the rest are computed from the parsed sRGB identity.
 */
export const COLOR_FORMATS = ['hex', 'rgb', 'oklch', 'lch', 'source'] as const;

export type ColorFormat = (typeof COLOR_FORMATS)[number];

export function isColorFormat(value: string): value is ColorFormat {
  return (COLOR_FORMATS as readonly string[]).includes(value);
}

/**
 * Render one color in the requested notation.
 *
 * Presentation only: the caller keeps whatever identity key it already had, so
 * dedup, drift comparison and ML features are unaffected by the choice. An
 * unparseable input is returned verbatim rather than dropped, matching how the
 * formatters already degrade.
 *
 * @param {string} colorString - any CSS color, or an already-authored token value
 * @param {ColorFormat} format - target notation, default 'hex'
 * @returns {string}
 */
export function formatColor(colorString, format: ColorFormat = 'hex'): string {
  const input = String(colorString);
  if (format === 'source') return input;
  const converted = convertColor(input);
  if (!converted) return input;
  return converted[format];
}

/**
 * Convert any supported color format to all formats
 * @param {string} colorString - Color in hex, rgb(), or rgba() format
 * @returns {{ hex: string, rgb: string, lch: string, oklch: string, hasAlpha: boolean } | null}
 */
export function convertColor(colorString) {
  // Spec-complete parsing (hex, named, rgb/hsl legacy+modern, hwb, lab/lch,
  // oklab/oklch, color()) with CSS Color 4 gamut mapping.
  const parsed = parseCssColor(String(colorString));
  if (!parsed) return null;
  const { r, g, b } = parsed;
  const a = parsed.a < 1 ? parsed.a : undefined;

  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  const rgbStr = a !== undefined ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;

  const lchValues = rgbToLch(r, g, b);
  const oklchValues = rgbToOklch(r, g, b);

  return {
    hex: hex.toLowerCase(),
    rgb: rgbStr,
    lch: formatLch(lchValues, a),
    oklch: formatOklch(oklchValues, a),
    hasAlpha: a !== undefined && a < 1
  };
}
