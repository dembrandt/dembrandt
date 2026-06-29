import type { VariableFontAxis } from '../types.js';

/**
 * Pick the dominant body font family from a map of family -> total body text
 * length. Highest text coverage wins; ties keep the first-seen family for a
 * deterministic result. Returns null when no family carried any body text. Pure
 * and exported so the body-font disambiguation is unit-testable without a
 * browser.
 */
export function pickBodyFamily(weights: Record<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [family, weight] of Object.entries(weights || {})) {
    if (weight > max) { max = weight; best = family; }
  }
  return best;
}

/**
 * Parse `font-variation-settings` strings (e.g. `"wght" 600, "slnt" -4`) into
 * per-axis ranges across the page. Pure and exported so it is unit-testable
 * without a browser. Only explicit variation settings count — we do not infer
 * an axis from font-weight, which would conflate static and variable fonts.
 */
export function parseVariableAxes(settings: string[]): VariableFontAxis[] {
  const map = new Map<string, VariableFontAxis>();
  for (const setting of settings) {
    for (const m of String(setting).matchAll(/"([^"]+)"\s+(-?\d+(?:\.\d+)?)/g)) {
      const axis = m[1];
      const val = parseFloat(m[2]);
      const a = map.get(axis) || { axis, min: val, max: val, count: 0 };
      a.min = Math.min(a.min, val);
      a.max = Math.max(a.max, val);
      a.count++;
      map.set(axis, a);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Parse `font-feature-settings` strings (e.g. `"ss01" on, "tnum" off`) into a
 * deduped, sorted list of *enabled* OpenType feature tags. Features explicitly
 * turned off (`off` or `0`) are excluded — a brand's letterforms are defined by
 * what is on, not what was switched off.
 */
export function parseOpenTypeFeatures(settings: string[]): string[] {
  const set = new Set<string>();
  for (const setting of settings) {
    for (const m of String(setting).matchAll(/"([^"]+)"(?:\s+(on|off|\d+))?/g)) {
      const state = m[2];
      if (state === 'off' || state === '0') continue;
      set.add(m[1]);
    }
  }
  return [...set].sort();
}

export async function extractTypography(page) {
  const data = await page.evaluate(() => {
    const seen = new Map();
    const variationSettings: string[] = [];
    const featureSettings: string[] = [];
    // family -> total directly-contained visible body text length. Drives the
    // dominant-body-font pick: among everything the heuristic labels "body", the
    // family carrying the most reading text is the real body font.
    const familyBodyWeight: Record<string, number> = {};
    const sources = {
      googleFonts: [],
      adobeFonts: false,
      customFonts: [],
      variableFonts: new Set(),
    };

    document
      .querySelectorAll(
        'link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]'
      )
      .forEach((l: any) => {
        const matches = l.href.match(/family=([^&:%]+)/g) || [];
        matches.forEach((m) => {
          const name = decodeURIComponent(
            m.replace("family=", "").split(":")[0]
          ).replace(/\+/g, " ");
          if (!sources.googleFonts.includes(name))
            sources.googleFonts.push(name);
          if (l.href.includes("wght") || l.href.includes("ital"))
            sources.variableFonts.add(name);
        });
      });
    if (
      document.querySelector(
        'link[href*="typekit.net"], script[src*="use.typekit.net"]'
      )
    ) {
      sources.adobeFonts = true;
    }

    // Detect truly custom fonts: @font-face rules loading from own domain
    const thirdPartyHosts = ['googleapis.com', 'gstatic.com', 'typekit.net', 'adobe.com',
      'fonts.com', 'cloud.typography.com', 'fast.fonts.net', 'use.fontawesome.com'];
    const pageHost = window.location.hostname;
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule instanceof CSSFontFaceRule) {
              const src = rule.style.getPropertyValue('src') || '';
              const family = (rule.style.getPropertyValue('font-family') || '').replace(/['"]/g, '').trim();
              if (!family) continue;
              const isThirdParty = thirdPartyHosts.some(h => src.includes(h));
              const isSameOrigin = src.includes(pageHost) || src.startsWith('/') || src.startsWith('./') || (!src.includes('http') && src.includes('url('));
              if (!isThirdParty && (isSameOrigin || src.includes('url(')) && !sources.customFonts.includes(family)) {
                sources.customFonts.push(family);
              }
              const familyLower = family.toLowerCase();
              if (
                familyLower.includes('variable') ||
                familyLower.includes(' vf') ||
                familyLower.endsWith('-var') ||
                (src.includes('woff2') && rule.style.getPropertyValue('font-variation-settings'))
              ) {
                sources.variableFonts.add(family);
              }
            }
          }
        } catch {}
      }
    } catch {}

    let fontDisplay = null;
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule instanceof CSSFontFaceRule) {
              const display = (rule.style as any).fontDisplay;
              if (display && display !== 'auto') {
                fontDisplay = display;
                break;
              }
            }
          }
        } catch (e) {}
        if (fontDisplay) break;
      }
    } catch (e) {}
    (sources as any).fontDisplay = fontDisplay;

    const els = document.querySelectorAll(`
      h1,h2,h3,h4,h5,h6,p,span,a,button,[role="button"],.btn,.button,
      .hero,[class*="title"],[class*="heading"],[class*="text"],nav a
    `);

    els.forEach((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return;

      const size = parseFloat(s.fontSize);
      const weight = parseInt(s.fontWeight) || 400;
      const fontFamilies = s.fontFamily.split(",").map(f => f.replace(/['"]/g, "").trim());
      const family = fontFamilies[0];
      const fallbacks = fontFamilies.slice(1).filter(f => f && f !== 'sans-serif' && f !== 'serif' && f !== 'monospace');
      const letterSpacing = s.letterSpacing;
      const textTransform = s.textTransform;
      const lineHeight = s.lineHeight;

      const isFluid = s.fontSize.includes('clamp') || s.fontSize.includes('vw') || s.fontSize.includes('vh');
      const fontFeatures = s.fontFeatureSettings !== 'normal' ? s.fontFeatureSettings : null;
      if (fontFeatures) featureSettings.push(fontFeatures);
      if (s.fontVariationSettings && s.fontVariationSettings !== 'normal') {
        variationSettings.push(s.fontVariationSettings);
      }

      let context = "body";
      const className = typeof el.className === 'string' ? el.className : ((el as any).className.baseVal || '');
      const headingMatch = el.tagName.match(/^H([1-6])$/);
      if (
        el.tagName === "BUTTON" ||
        el.getAttribute("role") === "button" ||
        className.includes("btn")
      ) {
        context = "ui";
      } else if (el.tagName === "A" && (el as any).href) {
        context = "link";
      } else if (headingMatch) {
        const level = parseInt(headingMatch[1]);
        // h1 at very large size = display, otherwise heading
        context = (level === 1 && size >= 56) ? "display" : `heading-${level}`;
      } else if (size >= 56) {
        context = "display";  // non-heading super-sized text (hero, marketing)
      } else if (size <= 12) {
        context = "caption";
      } else if (el.tagName === "LABEL" || el.tagName === "SMALL" ||
                 className.includes("label") || className.includes("caption") || className.includes("badge")) {
        context = "ui";
      }

      if (context === "body") {
        let directTextLen = 0;
        el.childNodes.forEach((node: ChildNode) => {
          if (node.nodeType === 3) directTextLen += (node.textContent || "").trim().length;
        });
        if (directTextLen > 0) familyBodyWeight[family] = (familyBodyWeight[family] || 0) + directTextLen;
      }

      const key = `${family}|${size}|${weight}|${context}|${letterSpacing}|${textTransform}`;
      if (seen.has(key)) return;

      let lineHeightValue = null;
      if (lineHeight !== 'normal') {
        const lhNum = parseFloat(lineHeight);
        if (lineHeight.includes('px')) {
          lineHeightValue = (lhNum / size).toFixed(2);
        } else {
          lineHeightValue = lhNum.toFixed(2);
        }
      }

      seen.set(key, {
        context,
        family,
        fallbacks: fallbacks.length > 0 ? fallbacks.join(', ') : null,
        size: `${size}px (${(size / 16).toFixed(2)}rem)`,
        weight,
        lineHeight: lineHeightValue,
        spacing: letterSpacing !== "normal" ? letterSpacing : null,
        transform: textTransform !== "none" ? textTransform : null,
        isFluid: isFluid || undefined,
        fontFeatures: fontFeatures || undefined,
      });
    });

    const result = Array.from(seen.values()).sort((a, b) => {
      const aSize = parseFloat(a.size);
      const bSize = parseFloat(b.size);
      return bSize - aSize;
    });

    return {
      styles: result,
      sources: {
        googleFonts: sources.googleFonts,
        adobeFonts: sources.adobeFonts,
        variableFonts: [...sources.variableFonts].length > 0,
      },
      variationSettings,
      featureSettings,
      familyBodyWeight,
    };
  });

  // Aggregate the raw variation/feature strings in Node so the parsing stays
  // unit-testable. Attach to sources only when present — no empty arrays.
  const variableAxes = parseVariableAxes(data.variationSettings);
  const openTypeFeatures = parseOpenTypeFeatures(data.featureSettings);

  // Disambiguate the body font. The size/tag heuristic labels every non-special
  // element "body", so a decorative face on one stray element can masquerade as
  // the body font. Keep the "body" label only on the dominant reading-text
  // family; demote the rest to the generic "text" role (still text, not the
  // canonical body font). This makes the body token reflect the dominant
  // computed font rather than whichever element fell through the heuristic first.
  const bodyFamily = pickBodyFamily(data.familyBodyWeight);
  if (bodyFamily) {
    for (const style of data.styles) {
      if (style.context === "body" && style.family !== bodyFamily) style.context = "text";
    }
  }

  return {
    styles: data.styles,
    sources: {
      ...data.sources,
      ...(variableAxes.length ? { variableAxes } : {}),
      ...(openTypeFeatures.length ? { openTypeFeatures } : {}),
    },
  };
}
