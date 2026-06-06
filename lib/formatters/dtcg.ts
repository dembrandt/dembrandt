/**
 * DTCG (W3C Design Tokens CG) format exporter
 * Converts dembrandt extraction output to W3C DTCG format
 * Spec: https://www.designtokens.org/TR/2025.10/format/
 */

import { buildDembrandtProvenance, EXTENSION_KEY } from '../version.js';
import type { BrandingResult } from '../types.js';

interface DtcgColorValue {
  colorSpace: string;
  components: number[];
  hex: string;
  alpha?: number;
}

/**
 * Convert color value to DTCG color format
 * Spec: https://www.designtokens.org/TR/2025.10/format/#color
 *
 * Based on spec examples (Example 7, 45, 54), color format includes:
 * - colorSpace: "srgb"
 * - components: [r, g, b] (normalized 0-1)
 * - hex: "#rrggbb"
 * - alpha: 0-1 (optional, for transparency)
 */
function hexToDtcgColor(color, alpha = 1) {
  let r, g, b;

  // Handle rgba(r, g, b, a) format
  if (typeof color === 'string' && color.includes('rgba')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      r = parseInt(match[1]) / 255;
      g = parseInt(match[2]) / 255;
      b = parseInt(match[3]) / 255;
      alpha = match[4] ? parseFloat(match[4]) : 1;

      const hexR = parseInt(match[1]).toString(16).padStart(2, '0');
      const hexG = parseInt(match[2]).toString(16).padStart(2, '0');
      const hexB = parseInt(match[3]).toString(16).padStart(2, '0');
      const hexValue = `#${hexR}${hexG}${hexB}`;

      const result: DtcgColorValue = {
        colorSpace: 'srgb',
        components: [
          Math.round(r * 1000) / 1000,
          Math.round(g * 1000) / 1000,
          Math.round(b * 1000) / 1000
        ],
        hex: hexValue
      };

      // Include alpha only if it's not 1 (fully opaque)
      if (alpha !== 1) {
        result.alpha = Math.round(alpha * 1000) / 1000;
      }

      return result;
    }
  }

  // Handle rgb(r, g, b) format
  if (typeof color === 'string' && color.includes('rgb')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      r = parseInt(match[1]) / 255;
      g = parseInt(match[2]) / 255;
      b = parseInt(match[3]) / 255;

      const hexR = parseInt(match[1]).toString(16).padStart(2, '0');
      const hexG = parseInt(match[2]).toString(16).padStart(2, '0');
      const hexB = parseInt(match[3]).toString(16).padStart(2, '0');
      const hexValue = `#${hexR}${hexG}${hexB}`;

      return {
        colorSpace: 'srgb',
        components: [
          Math.round(r * 1000) / 1000,
          Math.round(g * 1000) / 1000,
          Math.round(b * 1000) / 1000
        ],
        hex: hexValue
      };
    }
  }

  // Handle hex format
  const cleanHex = color.replace('#', '');

  // Ensure it's 6 characters
  if (cleanHex.length !== 6) {
    return {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000'
    };
  }

  // Parse RGB components
  r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const result: DtcgColorValue = {
    colorSpace: 'srgb',
    components: [
      Math.round(r * 1000) / 1000,
      Math.round(g * 1000) / 1000,
      Math.round(b * 1000) / 1000
    ],
    hex: `#${cleanHex}`
  };

  // Include alpha only if it's not 1 (fully opaque)
  if (alpha !== 1) {
    result.alpha = Math.round(alpha * 1000) / 1000;
  }

  return result;
}

/**
 * Convert a dimension value to W3C DTCG dimension format.
 *
 * DTCG restricts dimensions to px or rem. We normalize what we can (em → rem,
 * 1:1, the closest valid unit) and return null for anything inexpressible
 * (%, vw, vh, unitless). Callers must skip the token/field on null rather than
 * emit an invalid dimension. The value stays in the native output regardless.
 *
 * @param {string | number | { px?: number } | null | undefined} value
 * @returns {{ value: number, unit: 'px' | 'rem' } | null}
 */
function toDtcgDimension(value) {
  let num;
  let unit = 'px';

  if (typeof value === 'string') {
    // Ignore anything in parentheses, e.g. "16px (1.00rem)"
    const cleanValue = value.split('(')[0].trim();
    const match = cleanValue.match(/^([-\d.]+)\s*([a-z%]*)$/i);
    if (!match) return null;
    num = parseFloat(match[1]);
    unit = (match[2] || 'px').toLowerCase();
  } else if (typeof value === 'number') {
    num = value;
  } else if (value && typeof value === 'object' && value.px !== undefined) {
    num = value.px;
  } else {
    num = parseFloat(value);
  }

  if (!Number.isFinite(num)) return null;
  if (unit === 'em') unit = 'rem'; // closest valid DTCG unit; 1em ≈ 1rem at root
  if (unit !== 'px' && unit !== 'rem') return null; // %, vw, vh, etc.: inexpressible

  return { value: num, unit };
}

/**
 * Sanitize token names to be W3C compliant
 * - Cannot start with $
 * - Cannot contain {, }, or .
 */
function sanitizeTokenName(name) {
  return name
    .replace(/^\$/, '')
    .replace(/[{}.]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/**
 * Export colors to DTCG format
 */
function exportColors(colors) {
  if (!colors || !colors.palette || colors.palette.length === 0) {
    return null;
  }

  const colorTokens: Record<string, any> = {};

  // Add semantic colors if available
  if (colors.semantic) {
    const semantic: Record<string, any> = {};
    for (const [key, value] of Object.entries(colors.semantic)) {
      if (value) {
        // Handle both direct color values and objects with color property
        const colorValue = typeof value === 'string' ? value : (value as any).color;
        if (colorValue) {
          semantic[sanitizeTokenName(key)] = {
            $type: 'color',
            $value: hexToDtcgColor(colorValue)
          };
        }
      }
    }
    if (Object.keys(semantic).length > 0) {
      colorTokens.semantic = semantic;
    }
  }

  // Add palette colors (only high and medium confidence)
  const palette: Record<string, any> = {};
  colors.palette
    .filter(colorEntry => colorEntry.confidence !== 'low')
    .slice(0, 30) // Limit to top 30 colors
    .forEach((colorEntry, index) => {
      const name = `palette-${index + 1}`; // Use numbered names with prefix

      palette[name] = {
        $type: 'color',
        $value: hexToDtcgColor(colorEntry.color),
        $description: `Count: ${colorEntry.count || 0}, Confidence: ${colorEntry.confidence || 'unknown'}`
      };
    });

  if (Object.keys(palette).length > 0) {
    colorTokens.palette = palette;
  }

  return Object.keys(colorTokens).length > 0 ? colorTokens : null;
}

/**
 * Export typography to DTCG format
 */
function exportTypography(typography) {
  if (!typography || !typography.styles || typography.styles.length === 0) {
    return null;
  }

  const typographyTokens: Record<string, any> = {};

  // Export font families
  const uniqueFamilies = new Set();
  typography.styles.forEach(style => {
    if (style.family) {
      uniqueFamilies.add(style.family);
    }
  });

  if (uniqueFamilies.size > 0) {
    const fontFamilies: Record<string, any> = {};
    Array.from(uniqueFamilies).forEach((family, index) => {
      const name = sanitizeTokenName(family) || `font-${index + 1}`;
      fontFamilies[name] = {
        $type: 'fontFamily',
        $value: family
      };
    });
    typographyTokens['font-family'] = fontFamilies;
  }

  // Export text styles as composite typography tokens
  const textStyles: Record<string, any> = {};
  typography.styles.slice(0, 10).forEach((style, index) => {
    // fontFamily and fontSize identify the style; without them a DTCG typography
    // token cannot be both valid and honest, so skip rather than fabricate.
    if (!style.family || !style.size) return;

    // fontSize must be expressible as a px/rem dimension; skip the token if not
    // (e.g. a "%" size) rather than emit an invalid one.
    const fontSize = toDtcgDimension(style.size);
    if (!fontSize) return;

    const name = style.context
      ? `text-${sanitizeTokenName(style.context)}`
      : `text-${index + 1}`;
    const familyName = sanitizeTokenName(style.family) || `font-${index + 1}`;

    // DTCG typography is a composite that requires all five sub-fields. weight,
    // lineHeight and letterSpacing have legitimate CSS-normal defaults (400, 1.5,
    // 0px), so fill them when the source did not capture one. That is the
    // computed-normal value, not invented brand data.
    // DTCG composite typography (§9.8): each sub-field is a RAW value of its
    // type (or a reference), NOT a nested {$type,$value} token. fontFamily is a
    // reference to the font-family token; the rest are raw dimension/number values.
    textStyles[name] = {
      $type: 'typography',
      $value: {
        fontFamily: `{typography.font-family.${familyName}}`,
        fontSize,
        fontWeight: typeof style.weight === 'number' ? style.weight : parseInt(style.weight) || 400,
        lineHeight: style.lineHeight ? (parseFloat(style.lineHeight) || 1.5) : 1.5,
        letterSpacing: (style.letterSpacing && toDtcgDimension(style.letterSpacing)) || { value: 0, unit: 'px' }
      }
    };
  });

  if (Object.keys(textStyles).length > 0) {
    typographyTokens.style = textStyles;
  }

  return Object.keys(typographyTokens).length > 0 ? typographyTokens : null;
}

/**
 * Export spacing to DTCG format
 */
function exportSpacing(spacing) {
  if (!spacing || !spacing.commonValues || spacing.commonValues.length === 0) {
    return null;
  }

  const spacingTokens: Record<string, any> = {};

  spacing.commonValues.slice(0, 12).forEach((value, index) => {
    const dim = toDtcgDimension(value.px || value);
    if (!dim) return; // inexpressible unit (%, vw, …): omit from DTCG output
    spacingTokens[`spacing-${index + 1}`] = { $type: 'dimension', $value: dim };
  });

  return Object.keys(spacingTokens).length > 0 ? spacingTokens : null;
}

/**
 * Export border radius to W3C format
 */
function exportBorderRadius(borderRadius) {
  if (!borderRadius || !borderRadius.values || borderRadius.values.length === 0) {
    return null;
  }

  const radiusTokens: Record<string, any> = {};

  borderRadius.values
    .filter(entry => entry.confidence !== 'low')
    .slice(0, 6)
    .forEach((entry, index) => {
      const dim = toDtcgDimension(entry.value);
      if (!dim) return; // e.g. a "50%" pill radius: no valid px/rem form, omit
      radiusTokens[`radius-${index + 1}`] = { $type: 'dimension', $value: dim };
    });

  return Object.keys(radiusTokens).length > 0 ? radiusTokens : null;
}

/**
 * Export borders to DTCG format
 */
function exportBorders(borders) {
  if (!borders || !borders.combinations || borders.combinations.length === 0) {
    return null;
  }

  const borderTokens: Record<string, any> = {};
  const widths: Record<string, any> = {};
  const colors: Record<string, any> = {};
  const seenWidths = new Set();
  const seenColors = new Set();

  // Extract unique widths and colors from combinations
  borders.combinations
    .filter(combo => combo.confidence !== 'low')
    .slice(0, 10)
    .forEach((combo) => {
      // Add width if not seen and expressible as px/rem
      if (combo.width && !seenWidths.has(combo.width)) {
        const dim = toDtcgDimension(combo.width);
        if (dim) {
          widths[`border-width-${seenWidths.size + 1}`] = { $type: 'dimension', $value: dim };
          seenWidths.add(combo.width);
        }
      }

      // Add color if not seen and valid
      if (combo.color && !seenColors.has(combo.color)) {
        const colorIndex = seenColors.size + 1;
        colors[`border-color-${colorIndex}`] = {
          $type: 'color',
          $value: hexToDtcgColor(combo.color)
        };
        seenColors.add(combo.color);
      }
    });

  if (Object.keys(widths).length > 0) {
    borderTokens.width = widths;
  }

  if (Object.keys(colors).length > 0) {
    borderTokens.color = colors;
  }

  return Object.keys(borderTokens).length > 0 ? borderTokens : null;
}

/**
 * Export shadows to DTCG format
 */
function exportShadows(shadows) {
  if (!shadows || shadows.length === 0) {
    return null;
  }

  const shadowTokens: Record<string, any> = {};

  shadows
    .filter(entry => entry.confidence !== 'low')
    .slice(0, 6)
    .forEach((entry, index) => {
      const name = `shadow-${index + 1}`;

      // Parse shadow string (simplified parsing)
      // Format: offsetX offsetY blur spread color
      const parts = entry.shadow.trim().split(/\s+/);

      // Parse shadow (W3C format requires proper color object)
      const shadowColor = parts[4] && parts[4].match(/^#[0-9a-fA-F]{6}$/)
        ? parts[4]
        : '#000000';

      const zero = { value: 0, unit: 'px' };
      const dim = (v) => toDtcgDimension(v) || zero;
      shadowTokens[name] = {
        $type: 'shadow',
        $value: {
          offsetX: dim(parts[0]),
          offsetY: dim(parts[1]),
          blur: dim(parts[2]),
          spread: dim(parts[3]),
          color: hexToDtcgColor(shadowColor)
        }
      };
    });

  return Object.keys(shadowTokens).length > 0 ? shadowTokens : null;
}

/**
 * Main export function - converts dembrandt output to W3C Design Tokens format
 */
export function toDtcgTokens(extractionResult: BrandingResult): Record<string, any> {
  const w3cTokens: Record<string, any> = {};

  // Document-level provenance + version contract. The DTCG $extensions mechanism
  // is the only sanctioned channel for vendor data, and the spec requires other
  // tools to preserve it across a round-trip. Single source of truth: version.js.
  w3cTokens.$extensions = {
    [EXTENSION_KEY]: buildDembrandtProvenance(extractionResult),
  };

  // Export colors
  const colors = exportColors(extractionResult.colors);
  if (colors) {
    w3cTokens.color = colors;
  }

  // Export typography
  const typography = exportTypography(extractionResult.typography);
  if (typography) {
    w3cTokens.typography = typography;
  }

  // Export spacing
  const spacing = exportSpacing(extractionResult.spacing);
  if (spacing) {
    w3cTokens.spacing = spacing;
  }

  // Export border radius
  const borderRadius = exportBorderRadius(extractionResult.borderRadius);
  if (borderRadius) {
    w3cTokens.radius = borderRadius;
  }

  // Export borders
  const borders = exportBorders(extractionResult.borders);
  if (borders) {
    w3cTokens.border = borders;
  }

  // Export shadows
  const shadows = exportShadows(extractionResult.shadows);
  if (shadows) {
    w3cTokens.shadow = shadows;
  }

  return w3cTokens;
}
