/**
 * Color Conversion Utilities
 *
 * Converts colors between RGB, LCH, and OKLCH color spaces.
 */

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
 * Convert XYZ to Lab (D65 reference white)
 */
function xyzToLab(x, y, z) {
  // D65 reference white
  const xn = 0.95047;
  const yn = 1.00000;
  const zn = 1.08883;

  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116;

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

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

  const xyz = linearRgbToXyz(lr, lg, lb);
  const lab = xyzToLab(xyz.x, xyz.y, xyz.z);
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
export function formatLch(lch, alpha) {
  const l = Math.round(lch.l * 100) / 100;
  const c = Math.round(lch.c * 100) / 100;
  const h = Math.round(lch.h * 100) / 100;

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
export function formatOklch(oklch, alpha) {
  // OKLCH lightness is 0-1, displayed as percentage
  const l = Math.round(oklch.l * 10000) / 100;
  const c = Math.round(oklch.c * 1000) / 1000;
  const h = Math.round(oklch.h * 100) / 100;

  if (alpha !== undefined && alpha < 1) {
    return `oklch(${l}% ${c} ${h} / ${alpha})`;
  }
  return `oklch(${l}% ${c} ${h})`;
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
 * Convert any supported color format to all formats
 * @param {string} colorString - Color in hex, rgb(), or rgba() format
 * @returns {{ hex: string, rgb: string, lch: string, oklch: string, hasAlpha: boolean } | null}
 */
export function convertColor(colorString) {
  let r, g, b, a;

  // Parse rgba/rgb
  const rgbaMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    r = parseInt(rgbaMatch[1]);
    g = parseInt(rgbaMatch[2]);
    b = parseInt(rgbaMatch[3]);
    a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : undefined;
  } else {
    // Try hex
    const rgb = hexToRgb(colorString);
    if (!rgb) return null;
    r = rgb.r;
    g = rgb.g;
    b = rgb.b;
    a = rgb.a;
  }

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
