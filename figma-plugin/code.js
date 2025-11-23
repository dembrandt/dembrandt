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
  const { metadata, colors, typography, logo, favicons } = data;

  // Statistics
  const stats = {
    colorStyles: 0,
    textStyles: 0,
    logoImages: 0,
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

  // Create Logo page
  if ((logo && logo.url) || (favicons && favicons.length > 0)) {
    stats.logoImages = await createLogoDocumentationPage(logo, favicons, metadata);
    stats.pages++;
  } else {
    await createPlaceholderPage('♦︎ Logo', 'Logo assets will appear here when extracted');
    stats.pages++;
  }

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

  const notificationParts = [];
  if (stats.colorStyles > 0) notificationParts.push(`${stats.colorStyles} colors`);
  if (stats.textStyles > 0) notificationParts.push(`${stats.textStyles} text styles`);
  if (stats.logoImages > 0) notificationParts.push(`${stats.logoImages} logo assets`);

  figma.notify(`✓ Imported ${notificationParts.join(', ')}`);

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
  const swatchGroupHeight = swatchSize + 60; // Height for swatch + labels

  let displayedCount = 0;
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];

    // Skip colors with null RGB values (unresolved CSS variables)
    if (color.rgb.r === null || color.rgb.g === null || color.rgb.b === null) {
      continue;
    }

    // Create a frame to group the swatch and its labels
    const swatchFrame = figma.createFrame();
    swatchFrame.name = `Color: ${color.name}`;
    swatchFrame.resize(swatchSize, swatchGroupHeight);
    swatchFrame.x = xPos;
    swatchFrame.y = yPos;
    swatchFrame.fills = []; // Transparent background
    swatchFrame.clipsContent = false; // Allow labels to extend beyond if needed

    // Create color rectangle (inside the frame)
    const rect = figma.createRectangle();
    rect.name = 'Swatch';
    rect.resize(swatchSize, swatchSize);
    rect.x = 0; // Relative to frame
    rect.y = 0; // Relative to frame
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

    // Add rectangle to frame
    swatchFrame.appendChild(rect);

    // Create label (inside the frame)
    const label = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    label.name = 'Color Name';
    label.fontName = { family: 'Inter', style: 'Medium' };
    label.fontSize = 12;
    label.characters = color.name;
    label.x = 0; // Relative to frame
    label.y = swatchSize + 12; // Below the swatch

    // Add label to frame
    swatchFrame.appendChild(label);

    // Create hex value label (inside the frame)
    const hexLabel = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    hexLabel.name = 'Hex Value';
    hexLabel.fontName = { family: 'Inter', style: 'Regular' };
    hexLabel.fontSize = 11;
    hexLabel.characters = color.hex.toUpperCase();
    hexLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    hexLabel.x = 0; // Relative to frame
    hexLabel.y = swatchSize + 32; // Below the color name

    // Add hex label to frame
    swatchFrame.appendChild(hexLabel);

    // Move to next position
    displayedCount++;
    if (displayedCount % maxPerRow === 0) {
      xPos = 100;
      yPos += swatchGroupHeight + 40; // Add more vertical spacing between rows
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
  const baseXPos = 100;

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

    // Calculate display font size (capped at 48px)
    const displayFontSize = Math.min(typo.fontSize, 48);

    // Calculate frame height based on actual text size
    const detailsHeight = 16; // Space for details text
    const gapBetweenTextAndDetails = 8;
    const frameHeight = displayFontSize + gapBetweenTextAndDetails + detailsHeight;

    // Create a frame to group the typography sample and its details
    const typoFrame = figma.createFrame();
    typoFrame.name = `Text Style: ${typo.name}`;
    typoFrame.resize(800, frameHeight); // Wide frame to accommodate text
    typoFrame.x = baseXPos;
    typoFrame.y = yPos;
    typoFrame.fills = []; // Transparent background
    typoFrame.clipsContent = false; // Allow text to extend beyond if needed

    // Create sample text (inside the frame)
    const sample = figma.createText();
    sample.name = 'Sample';
    sample.fontName = loadedFont;
    sample.fontSize = displayFontSize;
    sample.characters = typo.name;
    sample.x = 0; // Relative to frame
    sample.y = 0; // Relative to frame

    // Add sample to frame
    typoFrame.appendChild(sample);

    // Create details label (inside the frame)
    const details = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    details.name = 'Details';
    details.fontName = { family: 'Inter', style: 'Regular' };
    details.fontSize = 11;
    details.characters = `${typo.fontFamily} ${typo.fontStyle} • ${typo.fontSize}px • ${typo.fontWeight}`;
    details.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    details.x = 0; // Relative to frame
    details.y = displayFontSize + gapBetweenTextAndDetails; // Below the sample

    // Add details to frame
    typoFrame.appendChild(details);

    // Move to next position with calculated spacing
    yPos += frameHeight + 32; // Add spacing between typography samples
  }
}

/**
 * Create a visual documentation page for logo and favicons
 * @param {object} logo - Logo data
 * @param {array} favicons - Array of favicon objects
 * @param {object} metadata - Metadata from dembrandt
 * @returns {number} Number of images created
 */
async function createLogoDocumentationPage(logo, favicons, metadata) {
  const page = figma.createPage();
  page.name = '♦︎ Logo';
  figma.currentPage = page;

  let imagesCreated = 0;

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
  subtitle.characters = 'Logo & Brand Assets';
  subtitle.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  subtitle.x = 100;
  subtitle.y = 145;

  let yPos = 200;
  const xPos = 100;

  // Create main logo section if available
  if (logo && logo.url) {
    // Create section header
    const logoHeader = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    logoHeader.fontName = { family: 'Inter', style: 'Medium' };
    logoHeader.fontSize = 18;
    logoHeader.characters = 'Primary Logo';
    logoHeader.x = xPos;
    logoHeader.y = yPos;

    yPos += 40;

    // Create a frame for the logo
    const logoFrame = figma.createFrame();
    logoFrame.name = 'Logo';
    logoFrame.resize(400, 200);
    logoFrame.x = xPos;
    logoFrame.y = yPos;
    logoFrame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
    logoFrame.cornerRadius = 8;

    // Add placeholder rectangle for the logo image
    const logoPlaceholder = figma.createRectangle();
    logoPlaceholder.name = 'Logo Image Placeholder';
    logoPlaceholder.resize(logo.width || 200, logo.height || 100);
    // Center the placeholder in the frame
    logoPlaceholder.x = (400 - (logo.width || 200)) / 2;
    logoPlaceholder.y = (200 - (logo.height || 100)) / 2;
    logoPlaceholder.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
    logoFrame.appendChild(logoPlaceholder);

    // Add info text about the logo URL
    const logoInfo = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    logoInfo.fontName = { family: 'Inter', style: 'Regular' };
    logoInfo.fontSize = 11;
    logoInfo.characters = `Source: ${logo.source}\nURL: ${logo.url}\nSize: ${logo.width}×${logo.height}px`;
    logoInfo.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    logoInfo.x = xPos;
    logoInfo.y = yPos + 220;

    // Add safe zone info if available
    if (logo.safeZone && (logo.safeZone.top || logo.safeZone.right || logo.safeZone.bottom || logo.safeZone.left)) {
      const safeZoneInfo = figma.createText();
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      safeZoneInfo.fontName = { family: 'Inter', style: 'Regular' };
      safeZoneInfo.fontSize = 11;
      safeZoneInfo.characters = `Safe Zone: ${logo.safeZone.top}px (top) ${logo.safeZone.right}px (right) ${logo.safeZone.bottom}px (bottom) ${logo.safeZone.left}px (left)`;
      safeZoneInfo.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
      safeZoneInfo.x = xPos;
      safeZoneInfo.y = yPos + 270;
      yPos += 50;
    }

    yPos += 280;
    imagesCreated++;
  }

  // Create favicons section if available
  if (favicons && favicons.length > 0) {
    // Create section header
    const faviconHeader = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    faviconHeader.fontName = { family: 'Inter', style: 'Medium' };
    faviconHeader.fontSize = 18;
    faviconHeader.characters = 'Favicons & Icons';
    faviconHeader.x = xPos;
    faviconHeader.y = yPos;

    yPos += 40;

    // Group favicons by type
    const faviconsByType = {};
    for (const favicon of favicons) {
      if (!faviconsByType[favicon.type]) {
        faviconsByType[favicon.type] = [];
      }
      faviconsByType[favicon.type].push(favicon);
    }

    // Display favicons grouped by type
    let faviconXPos = xPos;
    let faviconYPos = yPos;
    const iconSize = 80;
    const iconGap = 24;
    const maxPerRow = 6;
    let count = 0;

    for (const [type, icons] of Object.entries(faviconsByType)) {
      for (const favicon of icons) {
        // Create a frame for each favicon
        const faviconFrame = figma.createFrame();
        faviconFrame.name = `${type}${favicon.sizes ? ` (${favicon.sizes})` : ''}`;
        faviconFrame.resize(iconSize, iconSize + 50);
        faviconFrame.x = faviconXPos;
        faviconFrame.y = faviconYPos;
        faviconFrame.fills = [];
        faviconFrame.clipsContent = false;

        // Create placeholder for the icon
        const iconPlaceholder = figma.createRectangle();
        iconPlaceholder.name = 'Icon Placeholder';
        iconPlaceholder.resize(iconSize, iconSize);
        iconPlaceholder.x = 0;
        iconPlaceholder.y = 0;
        iconPlaceholder.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        iconPlaceholder.cornerRadius = 8;
        faviconFrame.appendChild(iconPlaceholder);

        // Add label
        const iconLabel = figma.createText();
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        iconLabel.name = 'Label';
        iconLabel.fontName = { family: 'Inter', style: 'Regular' };
        iconLabel.fontSize = 9;
        iconLabel.characters = favicon.sizes || type;
        iconLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
        iconLabel.x = 0;
        iconLabel.y = iconSize + 8;
        faviconFrame.appendChild(iconLabel);

        count++;
        imagesCreated++;

        // Move to next position
        if (count % maxPerRow === 0) {
          faviconXPos = xPos;
          faviconYPos += iconSize + 70;
        } else {
          faviconXPos += iconSize + iconGap;
        }
      }
    }

    yPos = faviconYPos + iconSize + 100;
  }

  // Add note about image fetching
  const note = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  note.fontName = { family: 'Inter', style: 'Regular' };
  note.fontSize = 12;
  note.characters = 'Note: Due to Figma plugin limitations, actual images cannot be automatically fetched.\nPlease manually download images from the URLs provided and replace the placeholders.';
  note.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.5, b: 0.3 } }];
  note.x = xPos;
  note.y = yPos;

  return imagesCreated;
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
