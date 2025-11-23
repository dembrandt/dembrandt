/**
 * Figma Exporter
 *
 * Transforms dembrandt extraction data into a Figma plugin-compatible format.
 * Handles color conversion, typography mapping, and data structuring for the Figma plugin.
 */

/**
 * Converts hex color to Figma RGB format (0-1 range)
 * @param {string} hex - Hex color code (e.g., "#3b82f6")
 * @returns {{r: number, g: number, b: number}} RGB object with values 0-1
 */
function hexToFigmaRgb(hex) {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse hex values
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  return { r, g, b };
}

/**
 * Converts any color format to hex
 * @param {string} color - Color in any format (rgb, rgba, hex)
 * @returns {string} Hex color code
 */
function anyColorToHex(color) {
  // If already hex, return as is
  if (color.startsWith('#')) {
    return color;
  }

  // Parse RGB/RGBA format
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // Fallback - return as is and let it fail gracefully
  return color;
}

/**
 * Maps numeric font weight to Figma style name
 * @param {string|number} weight - Font weight (e.g., "400", "700", 400)
 * @returns {string} Figma style name (e.g., "Regular", "Bold")
 */
function mapFontWeightToStyle(weight) {
  const numericWeight = typeof weight === 'string' ? parseInt(weight) : weight;

  const weightMap = {
    100: 'Thin',
    200: 'Extra Light',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semi Bold',
    700: 'Bold',
    800: 'Extra Bold',
    900: 'Black'
  };

  return weightMap[numericWeight] || 'Regular';
}

/**
 * Generates a unique, descriptive name for a color style
 * @param {object} color - Color object from dembrandt
 * @param {number} index - Index in the color array
 * @param {string} hexColor - Hex color value
 * @returns {string} Style name (e.g., "Primary Blue", "Color 1")
 */
function generateColorStyleName(color, index, hexColor) {
  // If color has semantic meaning, use it
  if (color.sources && color.sources.length > 0) {
    const source = color.sources[0];

    // Extract meaningful names from class names or IDs
    const semanticTerms = ['primary', 'secondary', 'accent', 'success', 'error', 'warning', 'info', 'brand', 'background', 'text', 'border'];

    for (const term of semanticTerms) {
      if (source.toLowerCase().includes(term)) {
        // Capitalize first letter
        const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
        return `${capitalizedTerm}`;
      }
    }
  }

  // Fallback to hex value
  return `Color ${index + 1} (${hexColor})`;
}

/**
 * Generates a descriptive name for a text style
 * @param {object} typography - Typography object from dembrandt
 * @param {number} index - Index in the typography array
 * @returns {string} Style name (e.g., "Heading H1", "Body Regular")
 */
function generateTextStyleName(typography, index) {
  const contexts = typography.contexts || [];

  // Check for heading tags
  const headingMatch = contexts.find(ctx => /^h[1-6]$/i.test(ctx));
  if (headingMatch) {
    return `Heading ${headingMatch.toUpperCase()}`;
  }

  // Check for body/paragraph
  if (contexts.includes('p') || contexts.includes('body')) {
    const weight = mapFontWeightToStyle(typography.fontWeight);
    return `Body ${weight}`;
  }

  // Check for button
  if (contexts.includes('button') || contexts.includes('a')) {
    return `${contexts.includes('button') ? 'Button' : 'Link'} Text`;
  }

  // Fallback to font size description
  const size = parseInt(typography.fontSize);
  if (size >= 32) return `Display ${index + 1}`;
  if (size >= 24) return `Heading ${index + 1}`;
  if (size >= 18) return `Subheading ${index + 1}`;
  return `Body ${index + 1}`;
}

/**
 * Transforms dembrandt extraction data to Figma plugin format
 * @param {object} extractionData - Raw dembrandt extraction output
 * @returns {object} Figma plugin-ready data structure
 */
function transformToFigmaFormat(extractionData) {
  const { url, colors, typography, logo, favicons, extractedAt } = extractionData;

  // Extract domain from URL for file naming
  const domain = new URL(url).hostname.replace('www.', '');

  // Process colors - filter high confidence and convert to Figma RGB
  const figmaColors = [];

  if (colors && colors.palette) {
    const highConfidenceColors = colors.palette.filter(
      color => color.confidence === 'high' || color.confidence === 'medium'
    );

    // Limit to top 20 colors to avoid overwhelming the file
    const topColors = highConfidenceColors.slice(0, 20);

    topColors.forEach((color, index) => {
      // Handle both old format (color field with RGB) and new format (normalized field with hex)
      const hexColor = color.normalized || anyColorToHex(color.color);

      figmaColors.push({
        name: generateColorStyleName(color, index, hexColor),
        hex: hexColor,
        rgb: hexToFigmaRgb(hexColor),
        confidence: color.confidence,
        sources: color.sources || []
      });
    });
  }

  // Process CSS variables as colors if available
  if (colors && colors.cssVariables) {
    Object.entries(colors.cssVariables).forEach(([varName, varValue]) => {
      // Only process color-related CSS variables
      if (varName.includes('color') || varName.includes('bg') || varName.includes('text')) {
        // Try to extract hex value
        const hexMatch = varValue.match(/#[0-9a-fA-F]{6}/);
        if (hexMatch) {
          const hex = hexMatch[0];
          figmaColors.push({
            name: `CSS Variable/${varName.replace('--', '')}`,
            hex: hex,
            rgb: hexToFigmaRgb(hex),
            confidence: 'high',
            sources: [varName]
          });
        }
      }
    });
  }

  // Process typography - filter high confidence
  const figmaTypography = [];

  if (typography && typography.styles) {
    const highConfidenceTypography = typography.styles.filter(
      style => style.confidence === 'high' || style.confidence === 'medium'
    );

    // Limit to top 15 typography styles
    const topTypography = highConfidenceTypography.slice(0, 15);

    topTypography.forEach((style, index) => {
      // Parse font size to numeric value
      const fontSizeMatch = style.fontSize.match(/(\d+\.?\d*)/);
      const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 16;

      // Parse line height
      let lineHeight = { unit: 'AUTO' };
      if (style.lineHeight && style.lineHeight !== 'normal') {
        const lineHeightMatch = style.lineHeight.match(/(\d+\.?\d*)/);
        if (lineHeightMatch) {
          const lineHeightValue = parseFloat(lineHeightMatch[1]);
          if (style.lineHeight.includes('px')) {
            lineHeight = { value: lineHeightValue, unit: 'PIXELS' };
          } else if (style.lineHeight.includes('%')) {
            lineHeight = { value: lineHeightValue, unit: 'PERCENT' };
          } else {
            // Relative line height (e.g., 1.5)
            lineHeight = { value: lineHeightValue * 100, unit: 'PERCENT' };
          }
        }
      }

      // Parse letter spacing
      let letterSpacing = { value: 0, unit: 'PIXELS' };
      if (style.letterSpacing && style.letterSpacing !== 'normal') {
        const letterSpacingMatch = style.letterSpacing.match(/(-?\d+\.?\d*)/);
        if (letterSpacingMatch) {
          const letterSpacingValue = parseFloat(letterSpacingMatch[1]);
          letterSpacing = {
            value: letterSpacingValue,
            unit: style.letterSpacing.includes('%') ? 'PERCENT' : 'PIXELS'
          };
        }
      }

      // Map font weight to Figma style name
      const fontWeight = parseInt(style.fontWeight) || 400;
      const fontStyle = mapFontWeightToStyle(fontWeight);

      figmaTypography.push({
        name: generateTextStyleName(style, index),
        fontFamily: style.fontFamily,
        fontStyle: fontStyle,
        fontSize: fontSize,
        fontWeight: fontWeight,
        lineHeight: lineHeight,
        letterSpacing: letterSpacing,
        textTransform: style.textTransform === 'uppercase' ? 'UPPER' :
                       style.textTransform === 'lowercase' ? 'LOWER' :
                       style.textTransform === 'capitalize' ? 'TITLE' : 'ORIGINAL',
        textDecoration: style.textDecoration === 'underline' ? 'UNDERLINE' :
                        style.textDecoration === 'line-through' ? 'STRIKETHROUGH' : 'NONE',
        contexts: style.contexts || [],
        confidence: style.confidence
      });
    });
  }

  // Process logo and favicons
  const figmaLogo = logo ? {
    source: logo.source,
    url: logo.url,
    width: logo.width,
    height: logo.height,
    alt: logo.alt || '',
    safeZone: logo.safeZone || { top: 0, right: 0, bottom: 0, left: 0 }
  } : null;

  const figmaFavicons = favicons ? favicons.map(favicon => ({
    type: favicon.type,
    url: favicon.url,
    sizes: favicon.sizes
  })) : [];

  // Return Figma plugin-ready structure
  return {
    version: '1.0.0',
    metadata: {
      sourceDomain: domain,
      sourceUrl: url,
      extractedAt: extractedAt,
      generatedBy: 'dembrandt'
    },
    colors: figmaColors,
    typography: figmaTypography,
    logo: figmaLogo,
    favicons: figmaFavicons
  };
}

export {
  transformToFigmaFormat,
  hexToFigmaRgb,
  mapFontWeightToStyle
};
