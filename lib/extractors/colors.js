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
      const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbaMatch) {
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

    function isValidColorValue(value) {
      if (!value) return false;
      if (value.includes("calc(") || value.includes("clamp(") || value.includes("var(")) {
        return /#[0-9a-f]{3,6}|rgba?\(|hsla?\(/i.test(value);
      }
      if (/^(oklab|oklch|lch|lab|color)\s*\(/i.test(value)) return false;
      return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+)/i.test(value);
    }

    const colorMap = new Map();
    const semanticColors = {};
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

      if (
        (context.includes('button') || context.includes('btn') || context.includes('cta')) &&
        bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' &&
        bgColor !== 'rgb(255, 255, 255)' && bgColor !== 'rgb(0, 0, 0)' && bgColor !== 'rgb(239, 239, 239)'
      ) {
        score = Math.max(score, 25);
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
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
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
        semanticColors.primary = bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent" ? bgColor : textColor;
      }
      if (context.includes("secondary")) semanticColors.secondary = bgColor;
    });

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

    return { semantic: semanticColors, palette: perceptuallyDeduped, cssVariables: filteredCssVariables, _raw: rawColors };
  });

  if (result && result.palette) {
    result.palette = result.palette.map((colorItem) => {
      const converted = convertColor(colorItem.normalized || colorItem.color);
      if (converted) return { ...colorItem, lch: converted.lch, oklch: converted.oklch };
      return colorItem;
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
