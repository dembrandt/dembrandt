/**
 * Spec-complete CSS color parser (CSS Color Level 4).
 *
 * One entry point, parseCssColor(), accepts every color notation a stylesheet
 * or computed style can contain — named colors, hex (3/4/6/8), legacy
 * comma-separated rgb()/rgba()/hsl()/hsla(), modern space-separated syntax
 * with slash alpha, hwb(), lab()/lch() (D50), oklab()/oklch(), and color()
 * with the common predefined spaces — and resolves it to sRGB 8-bit channels
 * plus float alpha. Out-of-gamut values are mapped by the CSS Color 4
 * chroma-reduction algorithm, not channel clipping.
 *
 * Kept dependency-free and strict-clean; the browser-context mirror in
 * lib/extractors/colors.ts must stay in sync with this module.
 */

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type Matrix3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

// ---------------------------------------------------------------------------
// Matrices and transfer functions
// ---------------------------------------------------------------------------

const XYZ_D65_TO_LINEAR_SRGB: Matrix3 = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252],
];

const LINEAR_P3_TO_XYZ_D65: Matrix3 = [
  [0.4865709486482162, 0.26566769316909306, 0.19821728523436247],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0.0, 0.04511338185890264, 1.043944368900976],
];

// Bradford chromatic adaptation. CSS lab()/lch() are specified at D50 while
// sRGB lives at D65, so parsing adapts D50 → D65.
const XYZ_D50_TO_D65: Matrix3 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

const D50_WHITE: Vec3 = { x: 0.96422, y: 1.0, z: 0.82521 };

function applyMatrix(m: Matrix3, v: Vec3): Vec3 {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

function srgbToLinear(c: number): number {
  const abs = Math.abs(c);
  const sign = c < 0 ? -1 : 1;
  return abs <= 0.04045 ? c / 12.92 : sign * Math.pow((abs + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const abs = Math.abs(c);
  const sign = c < 0 ? -1 : 1;
  return abs <= 0.0031308 ? c * 12.92 : sign * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
}

// ---------------------------------------------------------------------------
// OKLab
// ---------------------------------------------------------------------------

interface Oklab {
  l: number;
  a: number;
  b: number;
}

function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

function oklabToLinearSrgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

// ---------------------------------------------------------------------------
// Gamut mapping (CSS Color 4 §13.2: chroma reduction in OKLCH with local
// clipping when the clipped candidate is within a just-noticeable difference)
// ---------------------------------------------------------------------------

const GAMUT_EPS = 0.000075;
const JND = 0.02;

function inGamut(rgb: { r: number; g: number; b: number }): boolean {
  return (
    rgb.r >= -GAMUT_EPS && rgb.r <= 1 + GAMUT_EPS &&
    rgb.g >= -GAMUT_EPS && rgb.g <= 1 + GAMUT_EPS &&
    rgb.b >= -GAMUT_EPS && rgb.b <= 1 + GAMUT_EPS
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function deltaEok(c1: Oklab, c2: Oklab): number {
  return Math.sqrt((c1.l - c2.l) ** 2 + (c1.a - c2.a) ** 2 + (c1.b - c2.b) ** 2);
}

/** Map a (possibly out-of-gamut) linear sRGB triple into gamut, return 8-bit channels. */
function gamutMapLinear(lin: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const encode = (rgb: { r: number; g: number; b: number }) => ({
    r: Math.round(clamp01(linearToSrgb(rgb.r)) * 255),
    g: Math.round(clamp01(linearToSrgb(rgb.g)) * 255),
    b: Math.round(clamp01(linearToSrgb(rgb.b)) * 255),
  });

  if (inGamut(lin)) return encode(lin);

  const ok = linearSrgbToOklab(lin.r, lin.g, lin.b);
  if (ok.l >= 1) return { r: 255, g: 255, b: 255 };
  if (ok.l <= 0) return { r: 0, g: 0, b: 0 };

  const chroma = Math.sqrt(ok.a * ok.a + ok.b * ok.b);
  const hueA = chroma === 0 ? 0 : ok.a / chroma;
  const hueB = chroma === 0 ? 0 : ok.b / chroma;

  const EPSILON = 0.0001;
  let min = 0;
  let max = chroma;
  let minInGamut = true;
  let current = lin;
  while (max - min > EPSILON) {
    const mid = (min + max) / 2;
    current = oklabToLinearSrgb(ok.l, hueA * mid, hueB * mid);
    if (minInGamut && inGamut(current)) {
      min = mid;
    } else {
      const clipped = { r: clamp01(current.r), g: clamp01(current.g), b: clamp01(current.b) };
      const clippedOk = linearSrgbToOklab(clipped.r, clipped.g, clipped.b);
      const dE = deltaEok(clippedOk, { l: ok.l, a: hueA * mid, b: hueB * mid });
      if (dE < JND) {
        if (JND - dE < EPSILON) return encode(clipped);
        minInGamut = false;
        min = mid;
      } else {
        max = mid;
      }
    }
  }
  return encode({ r: clamp01(current.r), g: clamp01(current.g), b: clamp01(current.b) });
}

// ---------------------------------------------------------------------------
// Component tokenization
// ---------------------------------------------------------------------------

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Parse a number or percentage token; percentRef is what 100% maps to. 'none' is 0. */
function parseNumeric(token: string, percentRef: number): number | null {
  if (token === 'none') return 0;
  if (token.endsWith('%')) {
    const v = token.slice(0, -1);
    if (!NUMBER_RE.test(v)) return null;
    return (parseFloat(v) / 100) * percentRef;
  }
  if (!NUMBER_RE.test(token)) return null;
  return parseFloat(token);
}

/** Parse a hue token with optional angle unit, returned in degrees. 'none' is 0. */
function parseHue(token: string): number | null {
  if (token === 'none') return 0;
  const m = token.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|rad|grad|turn)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  switch ((m[2] || 'deg').toLowerCase()) {
    case 'rad': return (v * 180) / Math.PI;
    case 'grad': return v * 0.9;
    case 'turn': return v * 360;
    default: return v;
  }
}

function parseAlpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const v = parseNumeric(token, 1);
  if (v === null) return null;
  return clamp01(v);
}

interface FunctionArgs {
  channels: string[];
  alpha: string | undefined;
}

/**
 * Split a color function body into channel tokens + optional alpha, accepting
 * both the legacy comma grammar (alpha as 4th comma argument) and the modern
 * space grammar (alpha after a slash).
 */
function splitArgs(body: string): FunctionArgs | null {
  const trimmed = body.trim();
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts.some((p) => p === '')) return null;
    if (parts.length === 4) return { channels: parts.slice(0, 3), alpha: parts[3] };
    if (parts.length === 3) return { channels: parts, alpha: undefined };
    return null;
  }
  const slash = trimmed.split('/');
  if (slash.length > 2) return null;
  const channels = slash[0].trim().split(/\s+/);
  const alpha = slash.length === 2 ? slash[1].trim() : undefined;
  if (alpha === '') return null;
  return { channels, alpha };
}

// ---------------------------------------------------------------------------
// Per-notation parsers
// ---------------------------------------------------------------------------

function fromHex(input: string): RgbaColor | null {
  const m = input.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  const h = m[1];
  const dup = (c: string) => parseInt(c + c, 16);
  if (h.length === 3) return { r: dup(h[0]), g: dup(h[1]), b: dup(h[2]), a: 1 };
  if (h.length === 4) return { r: dup(h[0]), g: dup(h[1]), b: dup(h[2]), a: dup(h[3]) / 255 };
  const pair = (i: number) => parseInt(h.slice(i, i + 2), 16);
  if (h.length === 6) return { r: pair(0), g: pair(2), b: pair(4), a: 1 };
  if (h.length === 8) return { r: pair(0), g: pair(2), b: pair(4), a: pair(6) / 255 };
  return null;
}

function fromRgb(args: FunctionArgs): RgbaColor | null {
  const channel = (t: string) => parseNumeric(t, 255);
  const r = channel(args.channels[0]);
  const g = channel(args.channels[1]);
  const b = channel(args.channels[2]);
  const a = parseAlpha(args.alpha);
  if (r === null || g === null || b === null || a === null) return null;
  const clamp255 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a };
}

function hslChannels(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sat = clamp01(s);
  const light = clamp01(l);
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

function fromHsl(args: FunctionArgs): RgbaColor | null {
  const h = parseHue(args.channels[0]);
  const s = parseNumeric(args.channels[1], 1);
  const l = parseNumeric(args.channels[2], 1);
  const a = parseAlpha(args.alpha);
  if (h === null || s === null || l === null || a === null) return null;
  // Bare numbers for s/l are percentages in disguise (hsl(120 100 50) is valid
  // modern syntax): a token without '%' still means 0-100.
  const norm = (raw: string, v: number) => (raw.endsWith('%') || raw === 'none' ? v : v / 100);
  return { ...hslChannels(h, norm(args.channels[1], s), norm(args.channels[2], l)), a };
}

function fromHwb(args: FunctionArgs): RgbaColor | null {
  const h = parseHue(args.channels[0]);
  const wRaw = parseNumeric(args.channels[1], 1);
  const bRaw = parseNumeric(args.channels[2], 1);
  const a = parseAlpha(args.alpha);
  if (h === null || wRaw === null || bRaw === null || a === null) return null;
  const norm = (raw: string, v: number) => (raw.endsWith('%') || raw === 'none' ? v : v / 100);
  const w = clamp01(norm(args.channels[1], wRaw));
  const blk = clamp01(norm(args.channels[2], bRaw));
  if (w + blk >= 1) {
    const gray = Math.round((w / (w + blk)) * 255);
    return { r: gray, g: gray, b: gray, a };
  }
  const base = hslChannels(h, 1, 0.5);
  const mix = (c: number) => Math.round(((c / 255) * (1 - w - blk) + w) * 255);
  return { r: mix(base.r), g: mix(base.g), b: mix(base.b), a };
}

function fromOklab(args: FunctionArgs): RgbaColor | null {
  const L = parseNumeric(args.channels[0], 1);
  const aCh = parseNumeric(args.channels[1], 0.4);
  const bCh = parseNumeric(args.channels[2], 0.4);
  const alpha = parseAlpha(args.alpha);
  if (L === null || aCh === null || bCh === null || alpha === null) return null;
  const lin = oklabToLinearSrgb(clamp01(L), aCh, bCh);
  return { ...gamutMapLinear(lin), a: alpha };
}

function fromOklch(args: FunctionArgs): RgbaColor | null {
  const L = parseNumeric(args.channels[0], 1);
  const C = parseNumeric(args.channels[1], 0.4);
  const H = parseHue(args.channels[2]);
  const alpha = parseAlpha(args.alpha);
  if (L === null || C === null || H === null || alpha === null) return null;
  const hRad = (H * Math.PI) / 180;
  const lin = oklabToLinearSrgb(clamp01(L), Math.max(0, C) * Math.cos(hRad), Math.max(0, C) * Math.sin(hRad));
  return { ...gamutMapLinear(lin), a: alpha };
}

function labD50ToLinearSrgb(l: number, a: number, b: number): { r: number; g: number; b: number } {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const finv = (t: number) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (116 * t - 16) / 903.3;
  };
  const xyzD50: Vec3 = {
    x: finv(fx) * D50_WHITE.x,
    y: finv(fy) * D50_WHITE.y,
    z: finv(fz) * D50_WHITE.z,
  };
  const xyzD65 = applyMatrix(XYZ_D50_TO_D65, xyzD50);
  const lin = applyMatrix(XYZ_D65_TO_LINEAR_SRGB, xyzD65);
  return { r: lin.x, g: lin.y, b: lin.z };
}

function fromLab(args: FunctionArgs): RgbaColor | null {
  const L = parseNumeric(args.channels[0], 100);
  const aCh = parseNumeric(args.channels[1], 125);
  const bCh = parseNumeric(args.channels[2], 125);
  const alpha = parseAlpha(args.alpha);
  if (L === null || aCh === null || bCh === null || alpha === null) return null;
  const lin = labD50ToLinearSrgb(Math.min(100, Math.max(0, L)), aCh, bCh);
  return { ...gamutMapLinear(lin), a: alpha };
}

function fromLch(args: FunctionArgs): RgbaColor | null {
  const L = parseNumeric(args.channels[0], 100);
  const C = parseNumeric(args.channels[1], 150);
  const H = parseHue(args.channels[2]);
  const alpha = parseAlpha(args.alpha);
  if (L === null || C === null || H === null || alpha === null) return null;
  const hRad = (H * Math.PI) / 180;
  const lin = labD50ToLinearSrgb(
    Math.min(100, Math.max(0, L)),
    Math.max(0, C) * Math.cos(hRad),
    Math.max(0, C) * Math.sin(hRad)
  );
  return { ...gamutMapLinear(lin), a: alpha };
}

function fromColorFunction(args: FunctionArgs): RgbaColor | null {
  const [space, ...rest] = args.channels;
  if (!space || rest.length !== 3) return null;
  const c1 = parseNumeric(rest[0], 1);
  const c2 = parseNumeric(rest[1], 1);
  const c3 = parseNumeric(rest[2], 1);
  const alpha = parseAlpha(args.alpha);
  if (c1 === null || c2 === null || c3 === null || alpha === null) return null;

  let lin: { r: number; g: number; b: number };
  switch (space) {
    case 'srgb':
      lin = { r: srgbToLinear(c1), g: srgbToLinear(c2), b: srgbToLinear(c3) };
      break;
    case 'srgb-linear':
      lin = { r: c1, g: c2, b: c3 };
      break;
    case 'display-p3': {
      const p3: Vec3 = { x: srgbToLinear(c1), y: srgbToLinear(c2), z: srgbToLinear(c3) };
      const xyz = applyMatrix(LINEAR_P3_TO_XYZ_D65, p3);
      const s = applyMatrix(XYZ_D65_TO_LINEAR_SRGB, xyz);
      lin = { r: s.x, g: s.y, b: s.z };
      break;
    }
    case 'xyz':
    case 'xyz-d65': {
      const s = applyMatrix(XYZ_D65_TO_LINEAR_SRGB, { x: c1, y: c2, z: c3 });
      lin = { r: s.x, g: s.y, b: s.z };
      break;
    }
    case 'xyz-d50': {
      const d65 = applyMatrix(XYZ_D50_TO_D65, { x: c1, y: c2, z: c3 });
      const s = applyMatrix(XYZ_D65_TO_LINEAR_SRGB, d65);
      lin = { r: s.x, g: s.y, b: s.z };
      break;
    }
    default:
      return null;
  }
  return { ...gamutMapLinear(lin), a: alpha };
}

// ---------------------------------------------------------------------------
// Named colors (CSS Color 4 §6.1, full table + transparent)
// ---------------------------------------------------------------------------

const NAMED_COLORS: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4',
  azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000',
  blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a',
  burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00', chocolate: 'd2691e',
  coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b',
  darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b',
  darkmagenta: '8b008b', darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc',
  darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b',
  darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3',
  deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969',
  dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22',
  fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700',
  goldenrod: 'daa520', gray: '808080', green: '008000', greenyellow: 'adff2f',
  grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c',
  indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa',
  lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6',
  lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3',
  lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a',
  lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899',
  lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32',
  linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa',
  mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371',
  mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585',
  midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5',
  navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000',
  olivedrab: '6b8e23', orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6',
  palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093',
  papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb',
  plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399',
  red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513',
  salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee',
  sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f',
  steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8',
  tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3',
  white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse any CSS color string to sRGB 8-bit channels + float alpha.
 * Returns null for anything that is not an absolute color (currentcolor,
 * inherit, var() references, malformed input).
 */
export function parseCssColor(input: string): RgbaColor | null {
  if (typeof input !== 'string') return null;
  const str = input.trim();
  if (str === '') return null;

  if (str.startsWith('#')) return fromHex(str);

  const lower = str.toLowerCase();
  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED_COLORS[lower];
  if (named) return fromHex(`#${named}`);

  const fn = lower.match(/^([a-z-]+)\(\s*([^)]*)\s*\)$/);
  if (!fn) return null;
  const args = splitArgs(fn[2]);
  if (!args || args.channels.length < 3) return null;

  switch (fn[1]) {
    case 'rgb':
    case 'rgba':
      return args.channels.length === 3 ? fromRgb(args) : null;
    case 'hsl':
    case 'hsla':
      return args.channels.length === 3 ? fromHsl(args) : null;
    case 'hwb':
      return args.channels.length === 3 ? fromHwb(args) : null;
    case 'oklab':
      return args.channels.length === 3 ? fromOklab(args) : null;
    case 'oklch':
      return args.channels.length === 3 ? fromOklch(args) : null;
    case 'lab':
      return args.channels.length === 3 ? fromLab(args) : null;
    case 'lch':
      return args.channels.length === 3 ? fromLch(args) : null;
    case 'color':
      return fromColorFunction(args);
    default:
      return null;
  }
}

/** #rrggbb for opaque colors, #rrggbbaa when alpha < 1. */
export function serializeHex(c: RgbaColor): string {
  const pair = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const base = `#${pair(c.r)}${pair(c.g)}${pair(c.b)}`;
  if (c.a >= 1) return base;
  return `${base}${pair(clamp01(c.a) * 255)}`;
}

/** Legacy rgb()/rgba() serialisation, the canonical interchange form in the extractor. */
export function serializeRgb(c: RgbaColor): string {
  if (c.a >= 1) return `rgb(${c.r}, ${c.g}, ${c.b})`;
  const alpha = Math.round(clamp01(c.a) * 10000) / 10000;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}
