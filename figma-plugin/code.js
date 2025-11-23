/**
 * Dembrandt Design System Importer - Figma Plugin
 *
 * This plugin imports design tokens extracted by dembrandt CLI into Figma,
 * creating color styles, text styles, and visual documentation pages.
 */

// Show the plugin UI
figma.showUI(__html__, {
  width: 420,
  height: 520
});

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'import') {
    try {
      const stats = await importDesignSystem(msg.data);

      // Notify UI of success
      figma.ui.postMessage({
        type: 'import-complete',
        stats: stats
      });

      // Don't close immediately - let UI show success message
      // The UI will send cancel message after 2 seconds
    } catch (err) {
      figma.ui.postMessage({
        type: 'import-error',
        error: err.message
      });
    }
  }
};

/**
 * Main import function
 * @param {object} data - Dembrandt JSON data
 * @returns {object} Import statistics
 */
async function importDesignSystem(data) {
  const { metadata, colors, typography } = data;

  // Statistics
  const stats = {
    colorStyles: 0,
    textStyles: 0,
    pages: 0
  };

  // Create Colors page
  if (colors && colors.length > 0) {
    stats.colorStyles = await createColorStyles(colors);
    await createColorDocumentationPage(colors, metadata);
    stats.pages++;
  } else {
    await createPlaceholderPage('♦︎ Colors', 'Color palette will appear here when extracted');
    stats.pages++;
  }

  // Create Typography page
  if (typography && typography.length > 0) {
    stats.textStyles = await createTextStyles(typography);
    await createTypographyDocumentationPage(typography, metadata);
    stats.pages++;
  } else {
    await createPlaceholderPage('♦︎ Typography', 'Typography system will appear here when extracted');
    stats.pages++;
  }

  // Create placeholder pages for future features
  await createPlaceholderPage('♦︎ Logo', 'Logo assets will appear here when extracted');
  stats.pages++;

  await createPlaceholderPage('♦︎ Icons', 'Icon library will appear here when extracted');
  stats.pages++;

  await createPlaceholderPage('♦︎ Components', 'Component library will appear here when extracted');
  stats.pages++;

  // Focus on the Colors page
  const colorsPage = figma.root.findChild(node => node.name.includes('Colors'));
  if (colorsPage) {
    figma.currentPage = colorsPage;
    figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
  }

  figma.notify(`✓ Imported ${stats.colorStyles} colors and ${stats.textStyles} text styles`);

  return stats;
}

/**
 * Create color styles from dembrandt color data
 * @param {array} colors - Array of color objects
 * @returns {number} Number of styles created
 */
async function createColorStyles(colors) {
  let count = 0;

  for (const color of colors) {
    try {
      // Skip colors with null RGB values (unresolved CSS variables)
      if (color.rgb.r === null || color.rgb.g === null || color.rgb.b === null) {
        console.warn(`Skipping color with null RGB values: ${color.name}`);
        continue;
      }

      const style = figma.createPaintStyle();
      style.name = `Dembrandt/${color.name}`;

      const paint = {
        type: 'SOLID',
        color: {
          r: color.rgb.r,
          g: color.rgb.g,
          b: color.rgb.b
        },
        opacity: 1
      };

      style.paints = [paint];

      // Add description with source information
      if (color.sources && color.sources.length > 0) {
        style.description = `Source: ${color.sources.join(', ')}\nConfidence: ${color.confidence}\nHex: ${color.hex}`;
      } else {
        style.description = `Confidence: ${color.confidence}\nHex: ${color.hex}`;
      }

      count++;
    } catch (err) {
      console.error(`Failed to create color style: ${color.name}`, err);
    }
  }

  return count;
}

/**
 * Create text styles from dembrandt typography data
 * @param {array} typography - Array of typography objects
 * @returns {number} Number of styles created
 */
async function createTextStyles(typography) {
  let count = 0;

  for (const typo of typography) {
    try {
      const style = figma.createTextStyle();
      style.name = `Dembrandt/${typo.name}`;

      // Try to load the specified font, fallback to Inter/Roboto
      let fontLoaded = false;
      const fontsToTry = [
        { family: typo.fontFamily, style: typo.fontStyle },
        { family: typo.fontFamily, style: 'Regular' },
        { family: 'Inter', style: typo.fontStyle },
        { family: 'Inter', style: 'Regular' },
        { family: 'Roboto', style: typo.fontStyle },
        { family: 'Roboto', style: 'Regular' }
      ];

      for (const font of fontsToTry) {
        try {
          await figma.loadFontAsync(font);
          style.fontName = font;
          fontLoaded = true;
          break;
        } catch (err) {
          // Try next font
          continue;
        }
      }

      if (!fontLoaded) {
        console.warn(`Could not load font for ${typo.name}, skipping`);
        continue;
      }

      // Set font size
      style.fontSize = typo.fontSize;

      // Set line height
      if (typo.lineHeight.unit === 'AUTO') {
        style.lineHeight = { unit: 'AUTO' };
      } else if (typo.lineHeight.unit === 'PIXELS') {
        style.lineHeight = {
          value: typo.lineHeight.value,
          unit: 'PIXELS'
        };
      } else if (typo.lineHeight.unit === 'PERCENT') {
        style.lineHeight = {
          value: typo.lineHeight.value,
          unit: 'PERCENT'
        };
      }

      // Set letter spacing
      if (typo.letterSpacing.value !== 0) {
        style.letterSpacing = {
          value: typo.letterSpacing.value,
          unit: typo.letterSpacing.unit
        };
      }

      // Set text case
      if (typo.textTransform) {
        style.textCase = typo.textTransform;
      }

      // Set text decoration
      if (typo.textDecoration) {
        style.textDecoration = typo.textDecoration;
      }

      // Add description with context information
      const contexts = typo.contexts && typo.contexts.length > 0
        ? `Used in: ${typo.contexts.join(', ')}`
        : '';
      style.description = `${contexts}\nFont Weight: ${typo.fontWeight}\nConfidence: ${typo.confidence}`;

      count++;
    } catch (err) {
      console.error(`Failed to create text style: ${typo.name}`, err);
    }
  }

  return count;
}

/**
 * Create a visual documentation page for colors
 * @param {array} colors - Array of color objects
 * @param {object} metadata - Metadata from dembrandt
 */
async function createColorDocumentationPage(colors, metadata) {
  const page = figma.createPage();
  page.name = '♦︎ Colors';
  figma.currentPage = page;

  // Create title
  const title = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  title.fontName = { family: 'Inter', style: 'Bold' };
  title.fontSize = 32;
  title.characters = metadata.sourceDomain;
  title.x = 100;
  title.y = 100;

  // Create subtitle
  const subtitle = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  subtitle.fontName = { family: 'Inter', style: 'Regular' };
  subtitle.fontSize = 16;
  subtitle.characters = 'Color Palette';
  subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  subtitle.x = 100;
  subtitle.y = 145;

  // Create metadata info
  const metaInfo = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  metaInfo.fontName = { family: 'Inter', style: 'Regular' };
  metaInfo.fontSize = 11;
  const validColors = colors.filter(c => c.rgb.r !== null && c.rgb.g !== null && c.rgb.b !== null);
  metaInfo.characters = `${validColors.length} colors • Extracted ${new Date(metadata.extractedAt).toLocaleDateString()}`;
  metaInfo.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  metaInfo.x = 100;
  metaInfo.y = 175;

  // Create color swatches
  let xPos = 100;
  let yPos = 210;
  const swatchSize = 120;
  const gap = 40;
  const maxPerRow = 5;

  let displayedCount = 0;
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];

    // Skip colors with null RGB values (unresolved CSS variables)
    if (color.rgb.r === null || color.rgb.g === null || color.rgb.b === null) {
      continue;
    }

    // Create color rectangle
    const rect = figma.createRectangle();
    rect.resize(swatchSize, swatchSize);
    rect.x = xPos;
    rect.y = yPos;
    rect.fills = [{
      type: 'SOLID',
      color: {
        r: color.rgb.r,
        g: color.rgb.g,
        b: color.rgb.b
      }
    }];
    rect.cornerRadius = 8;

    // Add drop shadow
    rect.effects = [{
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 4 },
      radius: 12,
      visible: true,
      blendMode: 'NORMAL'
    }];

    // Create label
    const label = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    label.fontName = { family: 'Inter', style: 'Medium' };
    label.fontSize = 12;
    label.characters = color.name;
    label.x = xPos;
    label.y = yPos + swatchSize + 12;

    // Create hex value label
    const hexLabel = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    hexLabel.fontName = { family: 'Inter', style: 'Regular' };
    hexLabel.fontSize = 11;
    hexLabel.characters = color.hex.toUpperCase();
    hexLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    hexLabel.x = xPos;
    hexLabel.y = yPos + swatchSize + 32;

    // Move to next position
    displayedCount++;
    if (displayedCount % maxPerRow === 0) {
      xPos = 100;
      yPos += swatchSize + 80;
    } else {
      xPos += swatchSize + gap;
    }
  }
}

/**
 * Create a visual documentation page for typography
 * @param {array} typography - Array of typography objects
 * @param {object} metadata - Metadata from dembrandt
 */
async function createTypographyDocumentationPage(typography, metadata) {
  const page = figma.createPage();
  page.name = '♦︎ Typography';
  figma.currentPage = page;

  // Create title
  const title = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  title.fontName = { family: 'Inter', style: 'Bold' };
  title.fontSize = 32;
  title.characters = metadata.sourceDomain;
  title.x = 100;
  title.y = 100;

  // Create subtitle
  const subtitle = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  subtitle.fontName = { family: 'Inter', style: 'Regular' };
  subtitle.fontSize = 16;
  subtitle.characters = 'Typography System';
  subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  subtitle.x = 100;
  subtitle.y = 145;

  // Create metadata info
  const metaInfo = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  metaInfo.fontName = { family: 'Inter', style: 'Regular' };
  metaInfo.fontSize = 11;
  metaInfo.characters = `${typography.length} text styles • Extracted ${new Date(metadata.extractedAt).toLocaleDateString()}`;
  metaInfo.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  metaInfo.x = 100;
  metaInfo.y = 175;

  // Create typography samples
  let yPos = 210;
  const lineHeight = 80;

  for (const typo of typography) {
    // Try to load the font
    let fontLoaded = false;
    const fontsToTry = [
      { family: typo.fontFamily, style: typo.fontStyle },
      { family: typo.fontFamily, style: 'Regular' },
      { family: 'Inter', style: 'Regular' }
    ];

    let loadedFont;
    for (const font of fontsToTry) {
      try {
        await figma.loadFontAsync(font);
        loadedFont = font;
        fontLoaded = true;
        break;
      } catch (err) {
        continue;
      }
    }

    if (!fontLoaded) continue;

    // Create sample text
    const sample = figma.createText();
    sample.fontName = loadedFont;
    sample.fontSize = Math.min(typo.fontSize, 48); // Cap at 48px for display
    sample.characters = typo.name;
    sample.x = 100;
    sample.y = yPos;

    // Create details label
    const details = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    details.fontName = { family: 'Inter', style: 'Regular' };
    details.fontSize = 11;
    details.characters = `${typo.fontFamily} ${typo.fontStyle} • ${typo.fontSize}px • ${typo.fontWeight}`;
    details.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    details.x = 100;
    details.y = yPos + Math.min(typo.fontSize, 48) + 8;

    yPos += lineHeight;
  }
}

/**
 * Create a placeholder page for future features
 * @param {string} pageName - Name of the page
 * @param {string} message - Placeholder message
 */
async function createPlaceholderPage(pageName, message) {
  const page = figma.createPage();
  page.name = pageName;
  figma.currentPage = page;

  // Create title
  const title = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  title.fontName = { family: 'Inter', style: 'Bold' };
  title.fontSize = 32;
  title.characters = pageName.replace('♦︎ ', '');
  title.x = 100;
  title.y = 100;

  // Create message
  const messageText = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  messageText.fontName = { family: 'Inter', style: 'Regular' };
  messageText.fontSize = 14;
  messageText.characters = message;
  messageText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  messageText.x = 100;
  messageText.y = 145;
}
