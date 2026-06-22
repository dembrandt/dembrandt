// features.ts — the single source of truth for turning a dembrandt extraction's
// color palette into numeric feature vectors.
//
// CRITICAL: this is the ONE place features are computed. The dataset builder
// (training) and the runtime (inference) both call `candidatesFrom()`, so the
// model never sees different features at train vs serve time. If you change a
// feature here, retrain — the ONNX input width changes with FEATURE_NAMES.
// Ordered feature names. The ONNX model's input width == FEATURE_NAMES.length.
// Keep this list and the vector in `candidatesFrom` in lockstep.
export const FEATURE_NAMES = [
    'usage_frac', // share of total color usage
    'log_count', // log1p(count), scaled
    'confidence', // high=1, medium=0.5, low=0
    'lightness', // OKLab L (0..1)
    'chroma', // OKLab C (~0..0.4)
    'hue_sin', // sin(hue) — continuous hue
    'hue_cos', // cos(hue)
    'is_grayish', // chroma < 0.02
    'is_near_black', // L < 0.15
    'is_near_white', // L > 0.95
    'n_sources', // log1p(#sources), scaled
    'src_button',
    'src_link',
    'src_nav',
    'src_logo',
    'src_hero',
    'src_cta',
    'src_brand',
    'src_header',
    'src_primary',
    'src_text',
    'src_bg',
    'is_root_token', // hex is a declared :root custom property (author-named token)
    'is_brand_token', // ...and that property is brand-named (--brand/--primary/--accent…)
    'rank', // position in palette, normalized 0..1
];
export const FEATURE_DIM = FEATURE_NAMES.length;
// Bump this whenever FEATURE_NAMES changes (add/remove/reorder a feature, or change
// how a value is computed). Training stamps it into model/meta.json; the runtime
// refuses a model whose version doesn't match this code and lets the caller fall
// back to the heuristic instead of crashing on a shape/semantics mismatch.
export const FEATURE_VERSION = 1;
// ---- color: hex -> OKLCH (Björn Ottosson), computed deterministically ----
export function normHex(c) {
    if (!c)
        return null;
    const s = String(c).trim();
    let m = s.match(/^#?([0-9a-f]{3})$/i);
    if (m) {
        const [r, g, b] = m[1].split('');
        return ('#' + r + r + g + g + b + b).toLowerCase();
    }
    m = s.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m)
        return ('#' + m[1]).toLowerCase();
    // legacy: rgb(r, g, b)
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) {
        const h = (n) => Math.round(Number(n)).toString(16).padStart(2, '0');
        return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toLowerCase();
    }
    // CSS Color Level 4: rgb(r g b / a)
    m = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    if (m) {
        const h = (n) => Math.round(Number(n)).toString(16).padStart(2, '0');
        return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toLowerCase();
    }
    return null;
}
function srgbToLinear(c) {
    c /= 255;
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}
export function hexToOklch(hex) {
    const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
    const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
    const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    const C = Math.sqrt(a * a + bb * bb);
    let H = Math.atan2(bb, a); // radians
    if (H < 0)
        H += 2 * Math.PI;
    return { L, C, H };
}
const SRC_KEYS = {
    src_button: /button|btn/,
    src_link: /link|anchor|\ba\b/,
    src_nav: /nav|menu/,
    src_logo: /logo|brand-?mark|wordmark/,
    src_hero: /hero|banner|jumbotron|masthead/,
    src_cta: /cta|call-?to-?action|signup|sign-?up|get-?started/,
    src_brand: /brand|primary|accent/,
    src_header: /header|head\b|top/,
    src_primary: /primary|main/,
    src_text: /text|body|paragraph|copy|label/,
    src_bg: /background|\bbg\b|surface|fill/,
};
function confToNum(c) {
    if (c === 'high')
        return 1;
    if (c === 'medium')
        return 0.5;
    return 0;
}
// :root custom-property names that signal a brand token (vs. neutral/util tokens).
const BRAND_TOKEN_RE = /brand|primary|accent|\bcta\b|theme|signature/i;
export function candidatesFrom(extraction) {
    const palette = extraction.colors?.palette ?? [];
    const totalCount = palette.reduce((sum, p) => sum + (p.count ?? 0), 0) || 1;
    // Author-named :root tokens — a color defined as a brand-named custom property
    // is strong evidence it is a brand color.
    const tokenHexes = new Set();
    const brandTokenHexes = new Set();
    const cssVars = extraction.colors?.cssVariables ?? {};
    for (const [name, v] of Object.entries(cssVars)) {
        const raw = typeof v === 'string' ? v : v?.value;
        const hex = normHex(raw);
        if (!hex)
            continue;
        tokenHexes.add(hex);
        if (BRAND_TOKEN_RE.test(name))
            brandTokenHexes.add(hex);
    }
    const out = [];
    palette.forEach((p, i) => {
        const hex = normHex(p.normalized ?? p.color);
        if (!hex)
            return;
        const count = p.count ?? 0;
        const sources = (p.sources ?? (p.source ? [p.source] : [])).map(String);
        const srcBlob = sources.join(' ').toLowerCase();
        const { L, C, H } = hexToOklch(hex);
        const f = {
            usage_frac: count / totalCount,
            log_count: Math.log1p(count) / 8, // scaled into ~0..1
            confidence: confToNum(p.confidence),
            lightness: L,
            chroma: C,
            hue_sin: Math.sin(H),
            hue_cos: Math.cos(H),
            is_grayish: C < 0.02 ? 1 : 0,
            is_near_black: L < 0.15 ? 1 : 0,
            is_near_white: L > 0.95 ? 1 : 0,
            n_sources: Math.log1p(sources.length) / 4,
            is_root_token: tokenHexes.has(hex) ? 1 : 0,
            is_brand_token: brandTokenHexes.has(hex) ? 1 : 0,
            rank: palette.length > 1 ? i / (palette.length - 1) : 0,
        };
        for (const [name, re] of Object.entries(SRC_KEYS)) {
            f[name] = re.test(srcBlob) ? 1 : 0;
        }
        const features = FEATURE_NAMES.map((name) => f[name] ?? 0);
        out.push({ hex, features, count, sources, rank: i });
    });
    return out;
}
