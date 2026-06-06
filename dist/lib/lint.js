/**
 * Design lint rules — expert knowledge encoded as validators.
 *
 * Each rule takes an ExtractionResult plus its resolved config and returns an
 * array of LintResult. Pure functions, no side effects, no I/O.
 *
 * Rules are configurable via the ESLint `[level, options]` model. See
 * DEFAULT_LINT_CONFIG for per-rule levels and options.
 */
// ----------------------------- config -----------------------------
/**
 * Per-rule defaults. `level` is the severity a violation is reported at;
 * the remaining keys are rule options. Setting a rule's level to "off"
 * disables it entirely (no violations, no info).
 */
export const DEFAULT_LINT_CONFIG = {
    "primary-contrast": { level: "warn", min: 5.4 },
    "button-contrast": { level: "warn", min: 4.5 },
    "body-text-size": { level: "warn", min: 16 },
    "palette-size": { level: "warn", max: 8 },
    "typography-scale": { level: "warn", tolerance: 0.15, maxDeviations: 2 },
    "radius-consistency": { level: "warn", max: 5 },
    "shadow-scale": { level: "warn", max: 6 },
    "button-variants": { level: "warn", max: 5 },
    "focus-visible": { level: "warn" },
    "logo-format": { level: "warn" },
};
// Contrast below this is an outright WCAG AA failure for normal text and is
// always escalated to "error" regardless of the configured level.
const CONTRAST_HARD_FAIL = 3.0;
const LEVELS = new Set(["off", "info", "warn", "error"]);
/**
 * Resolve one rule's config from a raw entry following the ESLint model:
 *   undefined            → defaults
 *   "off" | "warn" | …   → defaults with level overridden
 *   [level, options]     → defaults merged with options, level overridden
 */
function resolveRule(raw, defaults) {
    if (raw === undefined || raw === null)
        return { ...defaults };
    if (typeof raw === "string") {
        return { ...defaults, level: LEVELS.has(raw) ? raw : defaults.level };
    }
    if (Array.isArray(raw)) {
        const [level, options] = raw;
        return {
            ...defaults,
            ...(options && typeof options === "object" ? options : {}),
            level: LEVELS.has(level) ? level : defaults.level,
        };
    }
    return { ...defaults };
}
/**
 * Build the effective per-rule config from user config.
 * @param {{ rules?: Record<string, any> }} config
 */
function resolveConfig(config = {}) {
    const rules = config?.rules ?? {};
    const resolved = {};
    for (const name of Object.keys(DEFAULT_LINT_CONFIG)) {
        resolved[name] = resolveRule(rules[name], DEFAULT_LINT_CONFIG[name]);
    }
    return resolved;
}
import { convertColor } from "./colors.js";
// ----------------------------- color math -----------------------------
function relativeLuminance([r, g, b]) {
    const lin = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function parseRGB(hex) {
    if (!hex)
        return null;
    const h = hex.replace(/^#/, "");
    if (h.length !== 6)
        return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function contrastRatio(hex1, hex2) {
    const rgb1 = parseRGB(hex1);
    const rgb2 = parseRGB(hex2);
    if (!rgb1 || !rgb2)
        return null;
    const l1 = relativeLuminance(rgb1);
    const l2 = relativeLuminance(rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}
function isDataVizContext(result) {
    // Heuristic: SVG-heavy pages with many colors are likely data viz
    const frameworks = result.frameworks ?? [];
    const hasChartLib = frameworks.some((f) => /chart|d3|recharts|plotly|vega|highchart/i.test(f.name ?? f));
    return hasChartLib;
}
// ----------------------------- typography math -----------------------------
const COMMON_RATIOS = [1.125, 1.200, 1.250, 1.333, 1.414, 1.500, 1.618];
function closestRatio(r) {
    return COMMON_RATIOS.reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a);
}
function typographyScaleConsistency(sizes, tolerance) {
    if (sizes.length < 3)
        return { violations: 0, ratios: [] };
    const numeric = sizes
        .map((s) => parseFloat(s))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
    if (numeric.length < 3)
        return { violations: 0, ratios: [] };
    const ratios = [];
    for (let i = 0; i < numeric.length - 1; i++) {
        const r = numeric[i + 1] / numeric[i];
        if (r > 1.01)
            ratios.push(r); // skip near-identical sizes
    }
    const target = closestRatio(ratios.reduce((a, b) => a + b, 0) / ratios.length);
    const violations = ratios.filter((r) => Math.abs(r - target) / target > tolerance).length;
    return { violations, ratios, target };
}
// ----------------------------- rules -----------------------------
/**
 * @typedef {{ rule: string, level: 'error'|'warn'|'info', message: string, value?: string }} LintResult
 */
/**
 * Rule 1: Primary color contrast on white >= configured min (default 5.4:1,
 * i.e. WCAG AA + 20% safety margin). Contrast below CONTRAST_HARD_FAIL is
 * always escalated to "error".
 */
function rulePrimaryContrast(result, cfg) {
    const results = [];
    const primary = result.colors?.semantic?.primary;
    if (!primary)
        return results;
    const hex = typeof primary === "string" ? primary : primary?.hex ?? primary?.normalized;
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex))
        return results;
    const onWhite = contrastRatio(hex, "#ffffff");
    if (onWhite === null)
        return results;
    if (onWhite < cfg.min) {
        results.push({
            rule: "primary-contrast",
            level: onWhite < CONTRAST_HARD_FAIL ? "error" : cfg.level,
            message: `Primary color ${hex} has contrast ${onWhite.toFixed(2)}:1 on white — below ${cfg.min}:1 threshold`,
            value: hex,
        });
    }
    else {
        results.push({
            rule: "primary-contrast",
            level: "info",
            message: `Primary color ${hex} passes contrast check: ${onWhite.toFixed(2)}:1 on white (>= ${cfg.min}:1)`,
            value: hex,
        });
    }
    return results;
}
function toHex(c) {
    if (!c)
        return null;
    if (/^#[0-9a-f]{6}$/i.test(c))
        return c.toLowerCase();
    return convertColor(c)?.hex ?? null;
}
function isTransparentColor(c) {
    if (!c || c === "transparent")
        return true;
    // Only an explicit 4-argument rgba() alpha counts — matching the last channel
    // of an rgb() triplet would wrongly treat solid colors like rgb(0,0,0) as transparent.
    const m = c.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
    return Boolean(m) && parseFloat(m[1]) < 0.1;
}
/**
 * Rule: solid-background buttons must have readable text (WCAG AA, default 4.5:1).
 * Outline/ghost buttons (transparent background) are skipped — their text sits on
 * the page background, which is not known from button data alone. Defaults to
 * warn and does not auto-escalate, because the extractor cannot tell a disabled
 * button (legitimately low contrast, WCAG-exempt) from a broken one.
 */
function ruleButtonContrast(result, cfg) {
    const results = [];
    const buttons = result.components?.buttons ?? [];
    let worst = null;
    for (const b of buttons) {
        const s = b.states?.default ?? b;
        if (isTransparentColor(s.backgroundColor))
            continue;
        const bgHex = toHex(s.backgroundColor);
        const fgHex = toHex(s.color);
        if (!bgHex || !fgHex)
            continue;
        const ratio = contrastRatio(fgHex, bgHex);
        if (ratio === null)
            continue;
        if (!worst || ratio < worst.ratio)
            worst = { ratio, bg: bgHex, fg: fgHex, text: b.text };
    }
    if (!worst)
        return results;
    if (worst.ratio < cfg.min) {
        results.push({
            rule: "button-contrast",
            level: cfg.level,
            message: `Button text ${worst.fg} on ${worst.bg} has contrast ${worst.ratio.toFixed(2)}:1 — below ${cfg.min}:1 (WCAG AA)${worst.text ? ` ("${worst.text}")` : ""}`,
            value: worst.ratio.toFixed(2),
        });
    }
    else {
        results.push({
            rule: "button-contrast",
            level: "info",
            message: `Buttons pass contrast: worst pair ${worst.ratio.toFixed(2)}:1`,
            value: worst.ratio.toFixed(2),
        });
    }
    return results;
}
/**
 * Rule 2: Palette size — max accent/brand colors (default 8)
 */
function rulePaletteSize(result, cfg) {
    const results = [];
    const palette = result.colors?.palette ?? [];
    const accentRoles = new Set(["accent", "primary", "brand", "cta"]);
    const accentColors = palette.filter((c) => accentRoles.has((c.role ?? "").toLowerCase()));
    if (isDataVizContext(result)) {
        results.push({
            rule: "palette-size",
            level: "info",
            message: `Data viz context detected — palette size rule skipped (${accentColors.length} accent colors found)`,
        });
        return results;
    }
    if (accentColors.length > cfg.max) {
        results.push({
            rule: "palette-size",
            level: cfg.level,
            message: `${accentColors.length} accent/brand colors found — exceeds recommended maximum of ${cfg.max}`,
            value: String(accentColors.length),
        });
    }
    else {
        results.push({
            rule: "palette-size",
            level: "info",
            message: `Palette size ok: ${accentColors.length} accent/brand colors`,
            value: String(accentColors.length),
        });
    }
    return results;
}
/**
 * Rule 3: Typography scale consistency
 * At most `maxDeviations` values may deviate more than `tolerance` from the
 * nearest common ratio (defaults: 2 deviations, 15% tolerance).
 */
function ruleTypographyScale(result, cfg) {
    const results = [];
    const styles = result.typography?.styles ?? [];
    const sizes = [...new Set(styles.map((s) => s.size ?? s.fontSize).filter(Boolean))];
    if (sizes.length < 3)
        return results;
    const { violations, target } = typographyScaleConsistency(sizes, cfg.tolerance);
    if (violations > cfg.maxDeviations) {
        results.push({
            rule: "typography-scale",
            level: cfg.level,
            message: `Typography scale has ${violations} irregular steps (target ratio ~${target?.toFixed(3)}) — more than ${cfg.maxDeviations} deviations suggest inconsistent scale`,
            value: String(violations),
        });
    }
    else {
        results.push({
            rule: "typography-scale",
            level: "info",
            message: `Typography scale ok: ${violations} irregular step(s) within tolerance`,
        });
    }
    return results;
}
// Removed: dark-bg-font-weight. It read per-style background/color, which the
// typography extractor does not capture, so the rule could never fire. Re-add
// once the extractor records each style's effective background and text color.
/**
 * Rule: body copy is at least `min` px (default 16). Small body text hurts readability.
 */
function ruleBodyTextSize(result, cfg) {
    const styles = result.typography?.styles ?? [];
    const sizes = styles
        .filter((s) => (s.context ?? "").toLowerCase() === "body")
        .map((s) => parseFloat(s.size ?? s.fontSize))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (sizes.length === 0)
        return [];
    const smallest = Math.min(...sizes);
    if (smallest < cfg.min) {
        return [{ rule: "body-text-size", level: cfg.level, message: `Body text ${smallest}px is below ${cfg.min}px — small body copy hurts readability`, value: String(smallest) }];
    }
    return [{ rule: "body-text-size", level: "info", message: `Body text ${smallest}px meets the ${cfg.min}px minimum`, value: String(smallest) }];
}
/**
 * Rule: border-radius follows a consistent scale — at most `max` distinct values
 * (default 5). Pills (50%, 9999px) are excluded; they are an intentional shape.
 */
function ruleRadiusConsistency(result, cfg) {
    const distinct = [...new Set((result.borderRadius?.values ?? [])
            .map((r) => String(r.value ?? r))
            .filter((v) => !v.includes("%"))
            .map((v) => parseFloat(v))
            .filter((n) => Number.isFinite(n) && n > 0 && n < 999))].sort((a, b) => a - b);
    if (distinct.length === 0)
        return [];
    if (distinct.length > cfg.max) {
        return [{ rule: "radius-consistency", level: cfg.level, message: `${distinct.length} distinct border-radius values (${distinct.join(", ")}px) — exceeds ${cfg.max}, suggests no consistent radius scale`, value: String(distinct.length) }];
    }
    return [{ rule: "radius-consistency", level: "info", message: `Border-radius scale ok: ${distinct.length} distinct value(s)`, value: String(distinct.length) }];
}
/**
 * Rule: shadows form an elevation scale — at most `max` distinct shadows (default 6).
 */
function ruleShadowScale(result, cfg) {
    const distinct = [...new Set((result.shadows ?? [])
            .map((s) => (s.shadow ?? s))
            .filter((s) => typeof s === "string" && s !== "none")
            .map((s) => s.replace(/\s+/g, " ").trim()))];
    if (distinct.length === 0)
        return [];
    if (distinct.length > cfg.max) {
        return [{ rule: "shadow-scale", level: cfg.level, message: `${distinct.length} distinct shadows — exceeds ${cfg.max}, suggests no consistent elevation scale`, value: String(distinct.length) }];
    }
    return [{ rule: "shadow-scale", level: "info", message: `Shadow scale ok: ${distinct.length} elevation level(s)`, value: String(distinct.length) }];
}
/**
 * Rule: buttons share a limited set of styles — at most `max` distinct variants
 * (default 5). Many distinct button styles signal inconsistency.
 */
function ruleButtonVariants(result, cfg) {
    const buttons = result.components?.buttons ?? [];
    if (buttons.length === 0)
        return [];
    const distinct = [...new Set(buttons.map((b) => {
            const s = b.states?.default ?? b;
            return `${s.backgroundColor}|${s.color}|${s.borderRadius}|${s.border}`;
        }))];
    if (distinct.length > cfg.max) {
        return [{ rule: "button-variants", level: cfg.level, message: `${distinct.length} distinct button styles — exceeds ${cfg.max}, buttons may be inconsistent`, value: String(distinct.length) }];
    }
    return [{ rule: "button-variants", level: "info", message: `Button styles ok: ${distinct.length} variant(s)`, value: String(distinct.length) }];
}
/**
 * Rule: form inputs have a visible focus state (WCAG 2.4.7). Conservative — only
 * flags when NO input shows any focus change, so a single missed CSS rule does
 * not cause a false alarm.
 */
function ruleFocusVisible(result, cfg) {
    const inputs = result.components?.inputs;
    if (!inputs)
        return [];
    const all = [...(inputs.text ?? []), ...(inputs.checkbox ?? []), ...(inputs.radio ?? []), ...(inputs.select ?? [])];
    if (all.length === 0)
        return [];
    const hasFocus = (item) => {
        const f = item.states?.focus;
        return Boolean(f && (f.outline || f.boxShadow || f.border || f.borderColor || f.backgroundColor || f.color));
    };
    if (!all.some(hasFocus)) {
        return [{ rule: "focus-visible", level: cfg.level, message: `No visible focus state on ${all.length} input(s) — keyboard users may not see focus (WCAG 2.4.7)`, value: "0" }];
    }
    return [{ rule: "focus-visible", level: "info", message: "Inputs have visible focus states" }];
}
/**
 * Rule: logo is a vector (SVG). Raster logos blur when scaled.
 * Unknown formats are skipped to avoid false alarms.
 */
function ruleLogoFormat(result, cfg) {
    const logo = result.logo;
    if (!logo)
        return [];
    const url = logo.url ?? "";
    if (logo.source === "svg" || /\.svg(\?|$)/i.test(url)) {
        return [{ rule: "logo-format", level: "info", message: "Logo is SVG (vector)" }];
    }
    const m = url.match(/\.(png|jpe?g|webp|gif)(\?|$)/i);
    if (m) {
        return [{ rule: "logo-format", level: cfg.level, message: `Logo is ${m[1].toUpperCase()} (raster) — prefer SVG for crisp scaling`, value: m[1].toLowerCase() }];
    }
    return [];
}
// ----------------------------- entry -----------------------------
const RULES = {
    "primary-contrast": rulePrimaryContrast,
    "button-contrast": ruleButtonContrast,
    "body-text-size": ruleBodyTextSize,
    "palette-size": rulePaletteSize,
    "typography-scale": ruleTypographyScale,
    "radius-consistency": ruleRadiusConsistency,
    "shadow-scale": ruleShadowScale,
    "button-variants": ruleButtonVariants,
    "focus-visible": ruleFocusVisible,
    "logo-format": ruleLogoFormat,
};
/**
 * Run all lint rules against an extraction result.
 * @param {object} result — ExtractionResult from extractBranding()
 * @param {{ rules?: Record<string, any> }} [config] — lint config (ESLint [level, options] model)
 * @returns {{ errors: LintResult[], warnings: LintResult[], info: LintResult[] }}
 */
export function lint(result, config = {}) {
    const resolved = resolveConfig(config);
    const all = [];
    for (const [name, run] of Object.entries(RULES)) {
        const cfg = resolved[name];
        if (cfg.level === "off")
            continue;
        all.push(...run(result, cfg));
    }
    return {
        errors: all.filter((r) => r.level === "error"),
        warnings: all.filter((r) => r.level === "warn"),
        info: all.filter((r) => r.level === "info"),
        all,
    };
}
//# sourceMappingURL=lint.js.map