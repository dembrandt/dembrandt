/**
 * W3C Design Tokens Format Exporter
 * Converts dembrandt extraction output to W3C DTCG format
 * Spec: https://www.designtokens.org/TR/2025.10/format/
 */

import { URL } from 'url';

/**
 * Convert color value to W3C DTCG color format
 * Spec: https://www.designtokens.org/TR/2025.10/format/#color
 *
 * Based on spec examples (Example 7, 45, 54), color format includes:
 * - colorSpace: "srgb"
 * - components: [r, g, b] (normalized 0-1)
 * - hex: "#rrggbb"
 * - alpha: 0-1 (optional, for transparency)
 */
function hexToW3CColor(color, alpha = 1) {
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

      const result = {
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

  const result = {
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
 * Convert dimension value to W3C dimension format
 */
function toW3CDimension(value) {
  // Handle string values like "16px", "1rem", "50%", "16px (1.00rem)"
  if (typeof value === 'string') {
    // Extract just the main value and unit, ignore anything in parentheses
    const cleanValue = value.split('(')[0].trim();
    const match = cleanValue.match(/^([-\d.]+)\s*([a-z%]*)$/i);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: match[2] || 'px'
      };
    }
  }

  // Handle numeric values (assume px)
  if (typeof value === 'number') {
    return {
      value: value,
      unit: 'px'
    };
  }

  // Handle object format
  if (value && typeof value === 'object' && value.px !== undefined) {
    return {
      value: value.px,
      unit: 'px'
    };
  }

  return {
    value: parseFloat(value) || 0,
    unit: 'px'
  };
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
 * Export colors to W3C format
 */
function exportColors(colors) {
  if (!colors || !colors.palette || colors.palette.length === 0) {
    return null;
  }

  const colorTokens = {};

  // Add semantic colors if available
  if (colors.semantic) {
    const semantic = {};
    for (const [key, value] of Object.entries(colors.semantic)) {
      if (value) {
        // Handle both direct color values and objects with color property
        const colorValue = typeof value === 'string' ? value : value.color;
        if (colorValue) {
          semantic[sanitizeTokenName(key)] = {
            $type: 'color',
            $value: hexToW3CColor(colorValue)
          };
        }
      }
    }
    if (Object.keys(semantic).length > 0) {
      colorTokens.semantic = semantic;
    }
  }

  // Add palette colors (only high and medium confidence)
  const palette = {};
  colors.palette
    .filter(colorEntry => colorEntry.confidence !== 'low')
    .slice(0, 30) // Limit to top 30 colors
    .forEach((colorEntry, index) => {
      // Use normalized hex as base name
      const normalized = colorEntry.normalized || colorEntry.color;
      const cleanName = normalized.replace('#', '');
      const name = `palette-${index + 1}`; // Use numbered names with prefix

      palette[name] = {
        $type: 'color',
        $value: hexToW3CColor(colorEntry.color),
        $description: `Count: ${colorEntry.count || 0}, Confidence: ${colorEntry.confidence || 'unknown'}`
      };
    });

  if (Object.keys(palette).length > 0) {
    colorTokens.palette = palette;
  }

  return Object.keys(colorTokens).length > 0 ? colorTokens : null;
}

/**
 * Export typography to W3C format
 */
function exportTypography(typography) {
  if (!typography || !typography.styles || typography.styles.length === 0) {
    return null;
  }

  const typographyTokens = {};

  // Export font families
  const uniqueFamilies = new Set();
  typography.styles.forEach(style => {
    if (style.family) {
      uniqueFamilies.add(style.family);
    }
  });

  if (uniqueFamilies.size > 0) {
    const fontFamilies = {};
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
  const textStyles = {};
  typography.styles.slice(0, 10).forEach((style, index) => {
    const name = style.context
      ? `text-${sanitizeTokenName(style.context)}`
      : `text-${index + 1}`;

    const token = {
      $type: 'typography',
      $value: {}
    };

    if (style.family) {
      // Reference the font family token
      const familyName = sanitizeTokenName(style.family) || `font-${index + 1}`;
      token.$value.fontFamily = `{typography.font-family.${familyName}}`;
    }

    if (style.size) {
      token.$value.fontSize = {
        $type: 'dimension',
        $value: toW3CDimension(style.size)
      };
    }

    if (style.weight) {
      token.$value.fontWeight = {
        $type: 'fontWeight',
        $value: typeof style.weight === 'number' ? style.weight : parseInt(style.weight) || 400
      };
    }

    if (style.lineHeight) {
      token.$value.lineHeight = {
        $type: 'number',
        $value: parseFloat(style.lineHeight) || 1.5
      };
    }

    if (style.letterSpacing) {
      token.$value.letterSpacing = {
        $type: 'dimension',
        $value: toW3CDimension(style.letterSpacing)
      };
    }

    textStyles[name] = token;
  });

  if (Object.keys(textStyles).length > 0) {
    typographyTokens.style = textStyles;
  }

  return Object.keys(typographyTokens).length > 0 ? typographyTokens : null;
}

/**
 * Export spacing to W3C format
 */
function exportSpacing(spacing) {
  if (!spacing || !spacing.commonValues || spacing.commonValues.length === 0) {
    return null;
  }

  const spacingTokens = {};

  spacing.commonValues.slice(0, 12).forEach((value, index) => {
    const name = `spacing-${index + 1}`;
    spacingTokens[name] = {
      $type: 'dimension',
      $value: toW3CDimension(value.px || value)
    };
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

  const radiusTokens = {};

  borderRadius.values
    .filter(entry => entry.confidence !== 'low')
    .slice(0, 6)
    .forEach((entry, index) => {
      const name = `radius-${index + 1}`;
      radiusTokens[name] = {
        $type: 'dimension',
        $value: toW3CDimension(entry.value)
      };
    });

  return Object.keys(radiusTokens).length > 0 ? radiusTokens : null;
}

/**
 * Export borders to W3C format
 */
function exportBorders(borders) {
  if (!borders || !borders.combinations || borders.combinations.length === 0) {
    return null;
  }

  const borderTokens = {};
  const widths = {};
  const colors = {};
  const seenWidths = new Set();
  const seenColors = new Set();

  // Extract unique widths and colors from combinations
  borders.combinations
    .filter(combo => combo.confidence !== 'low')
    .slice(0, 10)
    .forEach((combo) => {
      // Add width if not seen
      if (combo.width && !seenWidths.has(combo.width)) {
        const widthIndex = seenWidths.size + 1;
        widths[`border-width-${widthIndex}`] = {
          $type: 'dimension',
          $value: toW3CDimension(combo.width)
        };
        seenWidths.add(combo.width);
      }

      // Add color if not seen and valid
      if (combo.color && !seenColors.has(combo.color)) {
        const colorIndex = seenColors.size + 1;
        colors[`border-color-${colorIndex}`] = {
          $type: 'color',
          $value: hexToW3CColor(combo.color)
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
 * Export shadows to W3C format
 */
function exportShadows(shadows) {
  if (!shadows || shadows.length === 0) {
    return null;
  }

  const shadowTokens = {};

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

      shadowTokens[name] = {
        $type: 'shadow',
        $value: {
          offsetX: toW3CDimension(parts[0] || '0px'),
          offsetY: toW3CDimension(parts[1] || '0px'),
          blur: toW3CDimension(parts[2] || '0px'),
          spread: toW3CDimension(parts[3] || '0px'),
          color: hexToW3CColor(shadowColor)
        }
      };
    });

  return Object.keys(shadowTokens).length > 0 ? shadowTokens : null;
}

/**
 * Main export function - converts dembrandt output to W3C Design Tokens format
 */
export function toW3CFormat(extractionResult) {
  const w3cTokens = {};

  // Add source metadata
  const domain = extractionResult.url ? new URL(extractionResult.url).hostname.replace('www.', '') : 'unknown';
  w3cTokens.$extensions = {
    'com.dembrandt': {
      url: extractionResult.url,
      domain: domain,
      extractedAt: extractionResult.extractedAt
    }
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
