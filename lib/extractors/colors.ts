import { convertColor } from '../colors.js';

export async function extractColors(page) {
  const result = await page.evaluate(() => {
    const _canvas = document.createElement('canvas');
    _canvas.width = _canvas.height = 1;
    const _ctx = _canvas.getContext('2d');
    const _colorMemo = new Map();
    function normalizeColor(color) {
      if (_colorMemo.has(color)) return _colorMemo.get(color);
      let result;
      const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbaMatch) {
        const alpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
        if (alpha < 0.05) { result = color.toLowerCase(); _colorMemo.set(color, result); return result; }
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
        result = `#${r}${g}${b}`;
      } else {
        const shortHex = color.match(/^#([0-9a-f]{3})$/i);
        if (shortHex) {
          const [, h] = shortHex;
          result = `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
        } else if (/^#[0-9a-f]{6}$/i.test(color)) {
          result = color.toLowerCase();
        } else if (/^#[0-9a-f]{8}$/i.test(color)) {
          result = color.toLowerCase().slice(0, 7);
        } else if (_ctx) {
          try {
            _ctx.clearRect(0, 0, 1, 1);
            _ctx.fillStyle = 'rgba(0,0,0,0)';
            _ctx.fillStyle = color;
            _ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = _ctx.getImageData(0, 0, 1, 1).data;
            result = a === 0 ? color.toLowerCase() : `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
          } catch (e) {
            result = color.toLowerCase();
          }
        } else {
          result = color.toLowerCase();
        }
      }
      _colorMemo.set(color, result);
      return result;
    }

    function colorAlpha(color) {
      if (!color) return 1;
      const m = color.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
      return m ? parseFloat(m[1]) : 1;
    }

    function isValidColorValue(value) {
      if (!value) return false;
      if (value.includes("calc(") || value.includes("clamp(") || value.includes("var(")) {
        return /#[0-9a-f]{3,6}|rgba?\(|hsla?\(/i.test(value);
      }
      if (/^(oklab|oklch|lch|lab|color)\s*\(/i.test(value)) return false;
      return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+)/i.test(value);
    }

    const colorMap = new Map();
    const semanticColors: any = {};
    const cssVariables = {};

    const styles = getComputedStyle(document.documentElement);
    const domain = window.location.hostname;

    for (let i = 0; i < styles.length; i++) {
      const prop = styles[i];
      if (!prop.startsWith("--")) continue;
      if (prop.startsWith("--wp--preset")) continue;
      if (
        prop.startsWith("--el-") || prop.startsWith("--p-") ||
        prop.startsWith("--chakra-") || prop.startsWith("--mantine-") ||
        prop.startsWith("--ant-") || prop.startsWith("--bs-") ||
        prop.startsWith("--swiper-") || prop.startsWith("--rsbs-") ||
        prop.startsWith("--toastify-")
      ) continue;
      if (prop.includes("--system-") || prop.includes("--default-")) continue;
      if (prop.includes("--cc-") && !domain.includes("cookie") && !domain.includes("consent")) continue;

      const nonColorUtilities = [
        '--tw-ring-offset-width', '--tw-ring-offset', '--tw-shadow', '--tw-blur',
        '--tw-brightness', '--tw-contrast', '--tw-grayscale', '--tw-hue-rotate',
        '--tw-invert', '--tw-saturate', '--tw-sepia', '--tw-drop-shadow',
        '--tw-translate-x', '--tw-translate-y', '--tw-translate-z',
        '--tw-rotate', '--tw-skew-x', '--tw-skew-y',
        '--tw-scale-x', '--tw-scale-y', '--tw-scale-z',
        '--tw-gradient-from-position', '--tw-gradient-via-position', '--tw-gradient-to-position',
        '--tw-divide-', '--tw-space-', '--bs-gutter', '--bs-border-spacing'
      ];
      if (nonColorUtilities.some(pattern => prop.includes(pattern))) continue;

      const value = styles.getPropertyValue(prop).trim();
      if (!value.match(/^(#|rgb|hsl|var\(--.*color|color\()/i)) continue;
      if (
        value.includes("color.adjust(") || value.includes("rgba(0, 0, 0, 0)") ||
        value.includes("rgba(0,0,0,0)") || value.includes("lighten(") ||
        value.includes("darken(") || value.includes("saturate(")
      ) continue;

      if (
        isValidColorValue(value) &&
        (prop.includes("color") || prop.includes("bg") || prop.includes("text") || prop.includes("brand"))
      ) {
        cssVariables[prop] = value;
      }
    }

    const elements = document.querySelectorAll("*");
    const totalElements = elements.length;
    const ctaPrimaryMap = new Map(); // normalized hex → original color for CTA backgrounds

    const contextScores = {
      logo: 5, brand: 5, primary: 4, cta: 4, hero: 3, button: 3, link: 2, header: 2, nav: 1,
    };

    elements.forEach((el) => {
      const computed = getComputedStyle(el);
      if (computed.display === "none" || computed.visibility === "hidden" || computed.opacity === "0") return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const bgColor = computed.backgroundColor;
      const textColor = computed.color;
      const borderColor = computed.borderColor;

      const context = (
        el.className + " " + el.id + " " +
        (el.getAttribute('data-tracking-linkid') || '') + " " +
        (el.getAttribute('data-cta') || '') + " " +
        (el.getAttribute('data-component') || '') + " " +
        el.tagName
      ).toLowerCase();

      let score = 1;
      for (const [keyword, weight] of Object.entries(contextScores)) {
        if (context.includes(keyword)) score = Math.max(score, weight);
      }

      const isCta = (context.includes('button') || context.includes('btn') || context.includes('cta')) &&
        bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' &&
        bgColor !== 'rgb(255, 255, 255)' && bgColor !== 'rgb(0, 0, 0)' && bgColor !== 'rgb(239, 239, 239)' &&
        colorAlpha(bgColor) >= 0.7;

      if (isCta) {
        score = Math.max(score, 25);
        // CTA background is a strong primary signal — count occurrences
        const ctaNorm = normalizeColor(bgColor);
        if (ctaNorm) {
          const existing = ctaPrimaryMap.get(ctaNorm) || { original: bgColor, count: 0 };
          existing.count++;
          ctaPrimaryMap.set(ctaNorm, existing);
        }
      }

      function extractColorsFromValue(colorValue) {
        if (!colorValue) return [];
        const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)/gi;
        const matches = colorValue.match(colorRegex) || [];
        const cssColorFunctions = new Set(['oklab','oklch','lch','lab','color','display','hsl','rgb','rgba','hsla','inherit','initial','unset','none','auto','normal']);
        return matches.filter(c =>
          c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgba(0,0,0,0)' &&
          c.length > 2 && !cssColorFunctions.has(c.toLowerCase())
        );
      }

      const allColors = [
        ...extractColorsFromValue(bgColor),
        ...extractColorsFromValue(textColor),
        ...extractColorsFromValue(borderColor),
      ];

      allColors.forEach((color) => {
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent" && colorAlpha(color) >= 0.3) {
          const normalized = normalizeColor(color);
          const existing = colorMap.get(normalized) || { original: color, count: 0, bgCount: 0, score: 0, sources: new Set() };
          existing.count++;
          if (extractColorsFromValue(bgColor).includes(color)) existing.bgCount++;
          existing.score += score;
          if (score > 1) {
            const source = context.split(" ")[0].substring(0, 30);
            if (source && !source.includes("__")) existing.sources.add(source);
          }
          colorMap.set(normalized, existing);
        }
      });

      if (context.includes("primary") || el.matches('[class*="primary"]')) {
        const candidate = bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent" ? bgColor : textColor;
        if (colorAlpha(candidate) >= 0.7) semanticColors.primary = candidate;
      }
      if (context.includes("secondary")) semanticColors.secondary = bgColor;
    });

    // Use most-common CTA background as primary if class-based detection missed it
    // Require at least 2 CTA occurrences to avoid single "Sign up" buttons dominating
    if (!semanticColors.primary && ctaPrimaryMap.size > 0) {
      let bestScore = -1;
      for (const [norm, entry] of ctaPrimaryMap) {
        if (entry.count < 2) continue;
        const data = colorMap.get(norm);
        if (data && data.score > bestScore) {
          bestScore = data.score;
          semanticColors.primary = entry.original;
        }
      }
    }

    const threshold = Math.max(3, Math.floor(totalElements * 0.01));

    function isStructuralColor(data, totalElements) {
      const usagePercent = (data.count / totalElements) * 100;
      const normalized = normalizeColor(data.original);
      if (data.original === "rgba(0, 0, 0, 0)" || data.original === "transparent") return true;
      if (usagePercent > 40 && data.score < data.count * 1.2) return true;
      if (data.bgCount === 0 && data.score < data.count * 1.5) {
        const hex = normalized.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (saturation > 0.3) return true;
      }
      return false;
    }

    function deltaE(rgb1, rgb2) {
      function hexToRgb(hex) {
        if (!hex.startsWith("#")) return null;
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
      }
      function rgbToXyz(r, g, b) {
        r = r / 255; g = g / 255; b = b / 255;
        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
        return {
          x: (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100,
          y: (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) * 100,
          z: (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) * 100,
        };
      }
      function xyzToLab(x, y, z) {
        x = x / 95.047; y = y / 100.000; z = z / 108.883;
        const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
        const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
        const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
        return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
      }
      const rgb1Obj = hexToRgb(rgb1);
      const rgb2Obj = hexToRgb(rgb2);
      if (!rgb1Obj || !rgb2Obj) return 999;
      const xyz1 = rgbToXyz(rgb1Obj.r, rgb1Obj.g, rgb1Obj.b);
      const lab1 = xyzToLab(xyz1.x, xyz1.y, xyz1.z);
      const xyz2 = rgbToXyz(rgb2Obj.r, rgb2Obj.g, rgb2Obj.b);
      const lab2 = xyzToLab(xyz2.x, xyz2.y, xyz2.z);
      const dL = lab1.L - lab2.L, dA = lab1.a - lab2.a, dB = lab1.b - lab2.b;
      return Math.sqrt(dL * dL + dA * dA + dB * dB);
    }

    const rawColors = Array.from(colorMap.entries())
      .filter(([, data]) => data.count >= threshold)
      .map(([normalized, data]) => ({ color: data.original, normalized, count: data.count }));

    const palette = Array.from(colorMap.entries())
      .filter(([, data]) => {
        const highScore = data.score >= 10 || (data.count > 0 && data.score / data.count >= 3);
        if (!highScore && data.count < threshold) return false;
        if (isStructuralColor(data, totalElements)) return false;
        return true;
      })
      .map(([normalizedColor, data]) => ({
        color: data.original,
        normalized: normalizedColor,
        count: data.count,
        confidence: data.score > 20 ? "high" : data.score > 5 ? "medium" : "low",
        sources: Array.from(data.sources).slice(0, 3),
      }))
      .sort((a, b) => b.count - a.count);

    const perceptuallyDeduped = [];
    const merged = new Set();
    palette.forEach((color, index) => {
      if (merged.has(index)) return;
      const similar = [color];
      for (let i = index + 1; i < palette.length; i++) {
        if (merged.has(i)) continue;
        if (deltaE(color.normalized, palette[i].normalized) < 15) {
          similar.push(palette[i]);
          merged.add(i);
        }
      }
      perceptuallyDeduped.push(similar.sort((a, b) => b.count - a.count)[0]);
    });

    const paletteNormalizedColors = new Set(perceptuallyDeduped.map((c) => c.normalized));
    const cssVarsByColor = new Map();
    Object.entries(cssVariables).forEach(([prop, value]) => {
      const normalized = normalizeColor(value);
      if (paletteNormalizedColors.has(normalized)) return;
      let isDuplicate = false;
      for (const paletteColor of perceptuallyDeduped) {
        if (deltaE(normalized, paletteColor.normalized) < 15) { isDuplicate = true; break; }
      }
      if (isDuplicate) return;
      if (!cssVarsByColor.has(normalized)) cssVarsByColor.set(normalized, { value, vars: [] });
      cssVarsByColor.get(normalized).vars.push(prop);
    });

    const filteredCssVariables = {};
    cssVarsByColor.forEach(({ value, vars }) => { filteredCssVariables[vars[0]] = value; });

    // Fallback: pick most chromatic non-gray palette color as primary
    if (!semanticColors.primary && perceptuallyDeduped.length > 0) {
      function chroma(hex) {
        if (!hex || !hex.startsWith('#')) return 0;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return 0;
        const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
        // Penalize near-black and near-white
        if (l < 0.08 || l > 0.92) return 0;
        return s;
      }
      const best = perceptuallyDeduped
        .filter(c => c.confidence !== 'low')
        .map(c => ({ c, chroma: chroma(c.normalized) }))
        .filter(({ chroma }) => chroma > 0.15)
        .sort((a, b) => b.chroma - a.chroma)[0];
      if (best) semanticColors.primary = best.c.color;
    }

    return { semantic: semanticColors, palette: perceptuallyDeduped, cssVariables: filteredCssVariables, _raw: rawColors };
  });

  if (result && result.palette) {
    result.palette = result.palette.map((colorItem) => {
      const converted = convertColor(colorItem.normalized || colorItem.color);
      if (converted) return { ...colorItem, lch: converted.lch, oklch: converted.oklch };
      return colorItem;
    });

    // Cluster alpha/lightness variants of the same hue under one token
    // e.g. rgba(99,91,255,0.1) is a variant of #635bff, not a separate brand color
    const primaryHex = result.semantic?.primary
      ? hexToRgb(toOpaque(result.semantic.primary)) : null;

    result.palette = result.palette.map((colorItem) => {
      const hex = colorItem.normalized || colorItem.color;
      const role = colorRole(hex, colorItem);
      const onColor = bestOnColor(hex);
      const hover = hoverVariant(hex);
      // Mark alpha/lightness variants of primary
      let variantOf = null;
      if (primaryHex && role !== 'surface') {
        const rgb = hexToRgb(hex);
        if (rgb && isSameHueFamily(rgb, primaryHex)) {
          variantOf = 'primary';
        }
      }
      return { ...colorItem, role, onColor, hover, ...(variantOf ? { variantOf } : {}) };
    });
  }

  if (result && result.cssVariables) {
    const enhancedCssVariables = {};
    for (const [name, value] of Object.entries(result.cssVariables)) {
      const converted = convertColor(value);
      if (converted) {
        enhancedCssVariables[name] = { value, lch: converted.lch, oklch: converted.oklch };
      } else {
        enhancedCssVariables[name] = { value };
      }
    }
    result.cssVariables = enhancedCssVariables;
  }

  return result;
}

function hexToRgb(hex) {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function relativeLuminance({ r, g, b }) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function bestOnColor(hex) {
  const onWhite = contrastRatio(hex, '#ffffff');
  const onBlack = contrastRatio(hex, '#000000');
  return onWhite >= onBlack ? '#ffffff' : '#000000';
}

function colorRole(hex, colorItem) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'unknown';
  const lum = relativeLuminance(rgb);
  // Surface: near-pure white or black only
  if (lum > 0.9 || lum < 0.005) return 'surface';
  // Neutral: low HSL saturation (grays, off-whites, taupes)
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.12) return 'neutral';
  // Accent: anything chromatic with meaningful confidence
  if (colorItem.confidence === 'high' || colorItem.confidence === 'medium') return 'accent';
  return 'supporting';
}

function hoverVariant(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lum = relativeLuminance(rgb);
  // Lighten dark colors, darken light ones — always move toward better contrast
  const factor = lum < 0.18 ? 1.2 : 0.85;
  const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
  const r = clamp(rgb.r * factor);
  const g = clamp(rgb.g * factor);
  const b = clamp(rgb.b * factor);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function toOpaque(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  return `#${(+m[1]).toString(16).padStart(2,'0')}${(+m[2]).toString(16).padStart(2,'0')}${(+m[3]).toString(16).padStart(2,'0')}`;
}

function isSameHueFamily(rgb, primaryRgb, threshold = 30) {
  // Compare hue in HSL space — same hue ±threshold degrees = variant
  function toHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s, l };
  }
  const h1 = toHsl(rgb);
  const h2 = toHsl(primaryRgb);
  // Low saturation colors are not hue-family variants
  if (h1.s < 0.1 || h2.s < 0.1) return false;
  const diff = Math.abs(h1.h - h2.h);
  return Math.min(diff, 360 - diff) < threshold;
}

export async function extractWcagPairs(page) {
  let rawPairs = [];
  try {
    rawPairs = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');

      function toHex(color) {
        if (!color) return null;
        try {
          const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m) {
            if (m[4] !== undefined && parseFloat(m[4]) < 0.1) return null;
            const r = parseInt(m[1]).toString(16).padStart(2, '0');
            const g = parseInt(m[2]).toString(16).padStart(2, '0');
            const b = parseInt(m[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
          }
          if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
          if (!ctx) return null;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = 'rgba(0,0,0,0)';
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          if (a < 25) return null;
          return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        } catch {
          return null;
        }
      }

      function findBg(el) {
        let node = el;
        while (node && node.tagName !== 'HTML') {
          try {
            const bg = toHex(getComputedStyle(node).backgroundColor);
            if (bg) return bg;
          } catch { /* skip stale node */ }
          node = node.parentElement;
        }
        return null;
      }

      const seen = new Map();
      let checked = 0;
      const els = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, button, label, span, li, td, th, [role="button"]');

      for (const el of els) {
        if (checked++ > 1500) break;
        try {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const fg = toHex(s.color);
          if (!fg) continue;
          const bg = findBg(el);
          if (!bg || fg === bg) continue;
          const key = [fg, bg].sort().join('/');
          const entry = seen.get(key);
          if (entry) { entry.count++; } else { seen.set(key, { fg, bg, count: 1 }); }
        } catch { /* skip any element that throws */ }
      }

      return Array.from(seen.values()).sort((a, b) => b.count - a.count).slice(0, 50);
    });
  } catch {
    return [];
  }

  const { relativeLuminance } = await import('../colors.js');
  const pairs = [];
  const seen = new Set();

  for (const { fg, bg, count } of rawPairs) {
    try {
      const key = [fg, bg].sort().join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      const l1 = relativeLuminance(fg);
      const l2 = relativeLuminance(bg);
      if (l1 === null || l2 === null) continue;
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      const ratio = Math.round((lighter + 0.05) / (darker + 0.05) * 100) / 100;
      pairs.push({ fg, bg, ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, count });
    } catch { /* skip malformed pair */ }
  }

  return pairs.sort((a, b) => b.count - a.count);
}
