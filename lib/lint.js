/**
 * Design lint rules — expert knowledge encoded as validators.
 *
 * Each rule takes an ExtractionResult and returns an array of LintResult.
 * Pure functions, no side effects, no I/O.
 */

// ----------------------------- color math -----------------------------

function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function parseRGB(hex) {
  if (!hex) return null;
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function contrastRatio(hex1, hex2) {
  const rgb1 = parseRGB(hex1);
  const rgb2 = parseRGB(hex2);
  if (!rgb1 || !rgb2) return null;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isDataVizContext(result) {
  // Heuristic: SVG-heavy pages with many colors are likely data viz
  const frameworks = result.frameworks ?? [];
  const hasChartLib = frameworks.some((f) =>
    /chart|d3|recharts|plotly|vega|highchart/i.test(f.name ?? f)
  );
  return hasChartLib;
}

// ----------------------------- typography math -----------------------------

const COMMON_RATIOS = [1.125, 1.200, 1.250, 1.333, 1.414, 1.500, 1.618];

function closestRatio(r) {
  return COMMON_RATIOS.reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a);
}

function typographyScaleConsistency(sizes) {
  if (sizes.length < 3) return { violations: 0, ratios: [] };

  const numeric = sizes
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (numeric.length < 3) return { violations: 0, ratios: [] };

  const ratios = [];
  for (let i = 0; i < numeric.length - 1; i++) {
    const r = numeric[i + 1] / numeric[i];
    if (r > 1.01) ratios.push(r); // skip near-identical sizes
  }

  const target = closestRatio(ratios.reduce((a, b) => a + b, 0) / ratios.length);
  const violations = ratios.filter((r) => Math.abs(r - target) / target > 0.15).length;

  return { violations, ratios, target };
}

// ----------------------------- rules -----------------------------

/**
 * @typedef {{ rule: string, level: 'error'|'warn'|'info', message: string, value?: string }} LintResult
 */

/**
 * Rule 1: Primary color contrast in buttons >= 5.4:1 (WCAG AA + 20% safety margin)
 */
function rulePrimaryContrast(result) {
  const results = [];
  const primary = result.colors?.semantic?.primary;
  if (!primary) return results;

  const hex = typeof primary === "string" ? primary : primary?.hex ?? primary?.normalized;
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return results;

  const onWhite = contrastRatio(hex, "#ffffff");
  const onBlack = contrastRatio(hex, "#000000");

  if (onWhite !== null && onWhite < 5.4) {
    results.push({
      rule: "primary-contrast",
      level: onWhite < 3.0 ? "error" : "warn",
      message: `Primary color ${hex} has contrast ${onWhite.toFixed(2)}:1 on white — below 5.4:1 threshold (WCAG AA + 20% margin)`,
      value: hex,
    });
  }

  if (onWhite !== null && onWhite >= 5.4) {
    results.push({
      rule: "primary-contrast",
      level: "info",
      message: `Primary color ${hex} passes contrast check: ${onWhite.toFixed(2)}:1 on white`,
      value: hex,
    });
  }

  return results;
}

/**
 * Rule 2: Palette size — max 8 accent/brand colors
 */
function rulePaletteSize(result) {
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

  if (accentColors.length > 8) {
    results.push({
      rule: "palette-size",
      level: "warn",
      message: `${accentColors.length} accent/brand colors found — exceeds recommended maximum of 8`,
      value: String(accentColors.length),
    });
  } else {
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
 * Max 2 values may deviate >15% from nearest common ratio
 */
function ruleTypographyScale(result) {
  const results = [];
  const styles = result.typography?.styles ?? [];

  const sizes = [...new Set(
    styles.map((s) => s.size ?? s.fontSize).filter(Boolean)
  )];

  if (sizes.length < 3) return results;

  const { violations, target } = typographyScaleConsistency(sizes);

  if (violations > 2) {
    results.push({
      rule: "typography-scale",
      level: "warn",
      message: `Typography scale has ${violations} irregular steps (target ratio ~${target?.toFixed(3)}) — more than 2 deviations suggest inconsistent scale`,
      value: String(violations),
    });
  } else {
    results.push({
      rule: "typography-scale",
      level: "info",
      message: `Typography scale ok: ${violations} irregular step(s) within tolerance`,
    });
  }

  return results;
}

/**
 * Rule 4: Dark background + light text requires font-weight >= 400
 */
function ruleDarkBgFontWeight(result) {
  const results = [];
  const styles = result.typography?.styles ?? [];

  for (const style of styles) {
    const bg = style.background ?? style.backgroundColor;
    const color = style.color ?? style.textColor;
    const weight = parseInt(style.fontWeight ?? style.weight ?? "400");

    if (!bg || !color) continue;

    const bgRGB = parseRGB(bg);
    const textRGB = parseRGB(color);
    if (!bgRGB || !textRGB) continue;

    const bgLum = relativeLuminance(bgRGB);
    const textLum = relativeLuminance(textRGB);

    const isDarkBg = bgLum < 0.18;
    const isLightText = textLum > 0.50;

    if (isDarkBg && isLightText && weight < 400) {
      results.push({
        rule: "dark-bg-font-weight",
        level: "warn",
        message: `Light text on dark background with font-weight ${weight} — recommend 400+ (semibold 500+ preferred)`,
        value: String(weight),
      });
    }
  }

  return results;
}

// ----------------------------- entry -----------------------------

/**
 * Run all lint rules against an extraction result.
 * @param {object} result — ExtractionResult from extractBranding()
 * @returns {{ errors: LintResult[], warnings: LintResult[], info: LintResult[] }}
 */
export function lint(result) {
  const all = [
    ...rulePrimaryContrast(result),
    ...rulePaletteSize(result),
    ...ruleTypographyScale(result),
    ...ruleDarkBgFontWeight(result),
  ];

  return {
    errors: all.filter((r) => r.level === "error"),
    warnings: all.filter((r) => r.level === "warn"),
    info: all.filter((r) => r.level === "info"),
    all,
  };
}
