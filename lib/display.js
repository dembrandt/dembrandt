/**
 * Terminal Display Formatter
 *
 * Formats extracted brand data into clean, readable terminal output
 * with color swatches and minimal design.
 */

import chalk from 'chalk';
import { convertColor } from './colors.js';

/**
 * Creates a clickable terminal link using ANSI escape codes
 * Supported in iTerm2, VSCode terminal, GNOME Terminal, Windows Terminal
 * @param {string} url - The URL to link to
 * @param {string} text - The text to display (defaults to url)
 * @returns {string} ANSI-formatted clickable link
 */
function terminalLink(url, text = url) {
  // OSC 8 hyperlink format: \x1b]8;;URL\x1b\\TEXT\x1b]8;;\x1b\\
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

/**
 * Main display function - outputs formatted extraction results to terminal
 * @param {Object} data - Extraction results from extractBranding()
 */
export function displayResults(data) {
  console.log('\n' + chalk.bold.cyan('🎨 Brand Extraction'));
  console.log(chalk.dim('│'));
  console.log(chalk.dim('├─') + ' ' + chalk.blue(terminalLink(data.url)));
  const timeString = new Date(data.extractedAt).toLocaleTimeString('en-US', {
    minute: '2-digit',
    second: '2-digit'
  });
  console.log(chalk.dim('├─') + ' ' + chalk.dim(timeString));
  console.log(chalk.dim('│'));

  displayLogo(data.logo);
  displayFavicons(data.favicons);
  displayColors(data.colors);
  displayTypography(data.typography);
  displaySpacing(data.spacing);
  displayBorderRadius(data.borderRadius);
  displayBorders(data.borders);
  displayShadows(data.shadows);
  displayButtons(data.components?.buttons);
  displayBadges(data.components?.badges);
  displayInputs(data.components?.inputs);
  displayLinks(data.components?.links);
  displayBreakpoints(data.breakpoints);
  displayIconSystem(data.iconSystem);
  displayFrameworks(data.frameworks);

  console.log(chalk.dim('│'));
  console.log(chalk.dim('└─') + ' ' + chalk.hex('#50FA7B')('✓ Complete'));
  console.log('');
}

function displayLogo(logo) {
  if (!logo) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Logo'));

  if (logo.url) {
    console.log(chalk.dim('│  ├─') + ' ' + chalk.blue(terminalLink(logo.url)));
  }

  if (logo.width && logo.height) {
    console.log(chalk.dim('│  ├─') + ' ' + chalk.dim(`${logo.width}×${logo.height}px`));
  }

  if (logo.safeZone) {
    const { top, right, bottom, left } = logo.safeZone;
    if (top > 0 || right > 0 || bottom > 0 || left > 0) {
      console.log(chalk.dim('│  └─') + ' ' + chalk.dim(`Safe zone: ${top}px ${right}px ${bottom}px ${left}px`));
    }
  }

  console.log(chalk.dim('│'));
}

function displayFavicons(favicons) {
  if (!favicons || favicons.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Favicons'));

  favicons.forEach((favicon, index) => {
    const isLast = index === favicons.length - 1;
    const branch = isLast ? '└─' : '├─';
    const sizeInfo = favicon.sizes ? chalk.dim(` · ${favicon.sizes}`) : '';
    console.log(chalk.dim(`│  ${branch}`) + ' ' + `${chalk.hex('#8BE9FD')(favicon.type.padEnd(18))} ${terminalLink(favicon.url)}${sizeInfo}`);
  });

  console.log(chalk.dim('│'));
}

function normalizeColorFormat(colorString) {
  // Use the centralized color conversion utility
  const converted = convertColor(colorString);
  if (converted) {
    return converted;
  }

  // Fallback for unparseable colors
  return {
    hex: colorString,
    rgb: colorString,
    lch: colorString,
    oklch: colorString,
    hasAlpha: false
  };
}

function displayColors(colors) {
  console.log(chalk.dim('├─') + ' ' + chalk.bold('Colors'));

  // All colors in one list with consistent formatting
  const allColors = [];

  // Add semantic colors
  if (colors.semantic) {
    Object.entries(colors.semantic)
      .filter(([_, color]) => color)
      .forEach(([role, color]) => {
        const formats = normalizeColorFormat(color);
        allColors.push({
          hex: formats.hex,
          rgb: formats.rgb,
          lch: formats.lch,
          oklch: formats.oklch,
          hasAlpha: formats.hasAlpha,
          label: role,
          type: 'semantic',
          confidence: 'high'
        });
      });
  }

  // Add CSS variables
  if (colors.cssVariables) {
    const limit = 15;
    Object.entries(colors.cssVariables).slice(0, limit).forEach(([name, varData]) => {
      try {
        // Handle both old format (string) and new format (object with value, lch, oklch)
        const colorValue = typeof varData === 'string' ? varData : varData.value;
        const formats = normalizeColorFormat(colorValue);

        // Use pre-computed LCH/OKLCH from extractor if available
        allColors.push({
          hex: formats.hex,
          rgb: formats.rgb,
          lch: (typeof varData === 'object' && varData.lch) || formats.lch,
          oklch: (typeof varData === 'object' && varData.oklch) || formats.oklch,
          hasAlpha: formats.hasAlpha,
          label: name,
          type: 'variable',
          confidence: 'high'
        });
      } catch {
        // Skip invalid colors
      }
    });
  }

  // Add palette colors - show high and medium confidence
  if (colors.palette) {
    const limit = 20;
    const filtered = colors.palette.filter(c => c.confidence === 'high' || c.confidence === 'medium');

    filtered.slice(0, limit).forEach(c => {
      const formats = normalizeColorFormat(c.color);
      allColors.push({
        hex: formats.hex,
        rgb: formats.rgb,
        lch: c.lch || formats.lch,
        oklch: c.oklch || formats.oklch,
        hasAlpha: formats.hasAlpha,
        label: '',
        type: 'palette',
        confidence: c.confidence
      });
    });
  }

  // Deduplicate colors by hex value
  const colorMap = new Map();
  allColors.forEach(color => {
    const key = color.hex.toLowerCase();
    if (colorMap.has(key)) {
      const existing = colorMap.get(key);
      // Merge labels
      if (color.label && !existing.label) {
        existing.label = color.label;
      } else if (color.label && existing.label) {
        // Split existing labels and check for exact match
        const existingLabels = existing.label.split(', ');
        if (!existingLabels.includes(color.label)) {
          existing.label = `${existing.label}, ${color.label}`;
        }
      }
      // Keep highest confidence
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      if (confidenceOrder[color.confidence] > confidenceOrder[existing.confidence]) {
        existing.confidence = color.confidence;
      }
    } else {
      colorMap.set(key, { ...color });
    }
  });

  const uniqueColors = Array.from(colorMap.values());

  // Display all colors with hex, RGB, LCH, and OKLCH formats
  uniqueColors.forEach(({ hex, rgb, lch, oklch, label, confidence }, index) => {
    const isLast = index === uniqueColors.length - 1;
    const branch = isLast ? '└─' : '├─';
    const indent = isLast ? '   ' : '│  ';

    try {
      const colorBlock = chalk.bgHex(hex)('  ');
      let conf;
      if (confidence === 'high') conf = chalk.hex('#50FA7B')('●');
      else if (confidence === 'medium') conf = chalk.hex('#FFB86C')('●');
      else conf = chalk.gray('●'); // low confidence

      const labelText = label ? chalk.dim(` ${label}`) : '';

      // First line: color swatch, hex, and label
      console.log(chalk.dim(`│  ${branch}`) + ' ' + `${conf} ${colorBlock} ${hex}${labelText}`);
      // Second line: RGB and LCH
      console.log(chalk.dim(`│  ${indent}├─`) + ' ' + chalk.dim('rgb:   ') + rgb);
      console.log(chalk.dim(`│  ${indent}├─`) + ' ' + chalk.dim('lch:   ') + lch);
      console.log(chalk.dim(`│  ${indent}└─`) + ' ' + chalk.dim('oklch: ') + oklch);
    } catch {
      console.log(chalk.dim(`│  ${branch}`) + ' ' + `${hex} ${label ? chalk.dim(label) : ''}`);
      console.log(chalk.dim(`│  ${indent}├─`) + ' ' + chalk.dim('rgb:   ') + rgb);
      console.log(chalk.dim(`│  ${indent}├─`) + ' ' + chalk.dim('lch:   ') + lch);
      console.log(chalk.dim(`│  ${indent}└─`) + ' ' + chalk.dim('oklch: ') + oklch);
    }
  });

  const cssVarLimit = 15;
  const paletteLimit = 20;
  const remaining = (colors.cssVariables ? Math.max(0, Object.keys(colors.cssVariables).length - cssVarLimit) : 0) +
    (colors.palette ? Math.max(0, colors.palette.length - paletteLimit) : 0);
  if (remaining > 0) {
    console.log(chalk.dim(`│  └─`) + ' ' + chalk.dim(`+${remaining} more in JSON`));
  }
  console.log(chalk.dim('│'));
}

function displayTypography(typography) {
  console.log(chalk.dim('├─') + ' ' + chalk.bold('Typography'));

  // Font sources with font-display
  const sources = [];
  if (typography.sources?.googleFonts?.length > 0) {
    sources.push(...typography.sources.googleFonts);
  }
  if (sources.length > 0) {
    const fontDisplayInfo = typography.sources?.fontDisplay ? ` · font-display: ${typography.sources.fontDisplay}` : '';
    console.log(chalk.dim('│  ├─') + ' ' + chalk.dim(`Fonts: ${sources.slice(0, 3).join(', ')}${fontDisplayInfo}`));
    if (sources.length > 3) {
      console.log(chalk.dim('│  ├─') + ' ' + chalk.dim(`+${sources.length - 3} more`));
    }
  }

  // Group styles by font family, then by context
  if (typography.styles?.length > 0) {
    const fontFamilies = new Map();

    typography.styles.forEach(style => {
      // Skip styles without a family name
      if (!style.family) return;

      if (!fontFamilies.has(style.family)) {
        fontFamilies.set(style.family, {
          fallbacks: style.fallbacks,
          contexts: new Map()
        });
      }

      const familyData = fontFamilies.get(style.family);
      const contextKey = style.context || 'unknown';
      if (!familyData.contexts.has(contextKey)) {
        familyData.contexts.set(contextKey, []);
      }
      familyData.contexts.get(contextKey).push(style);
    });

    let fontIndex = 0;
    const totalFonts = fontFamilies.size;

    for (const [family, data] of fontFamilies) {
      fontIndex++;
      const isFontLast = fontIndex === totalFonts;
      const fontBranch = isFontLast ? '└─' : '├─';

      console.log(chalk.dim(`│  ${fontBranch}`) + ' ' + chalk.bold(family));

      if (data.fallbacks) {
        const indent = isFontLast ? '   ' : '│  ';
        console.log(chalk.dim(`│  ${indent}├─`) + ' ' + chalk.dim(`fallbacks: ${data.fallbacks}`));
      }

      let contextIndex = 0;
      const totalContexts = data.contexts.size;

      for (const [context, styles] of data.contexts) {
        contextIndex++;
        const isContextLast = contextIndex === totalContexts;
        const indent = isFontLast ? '   ' : '│  ';
        const contextBranch = isContextLast ? '└─' : '├─';

        console.log(chalk.dim(`│  ${indent}${contextBranch}`) + ' ' + chalk.hex('#8BE9FD')(context));

        styles.forEach((style, styleIndex) => {
          const isStyleLast = styleIndex === styles.length - 1;
          const styleIndent = isFontLast ? '   ' : '│  ';
          const contextIndent = isContextLast ? '   ' : '│  ';
          const styleBranch = isStyleLast ? '└─' : '├─';
          const propIndent = isStyleLast ? '   ' : '│  ';

          // Main size line
          console.log(chalk.dim(`│  ${styleIndent}${contextIndent}${styleBranch}`) + ' ' + `${style.size}`);

          // Collect properties
          const props = [];
          if (style.weight && style.weight !== 400) {
            props.push({ key: 'weight', value: style.weight });
          }
          if (style.lineHeight) {
            const lh = parseFloat(style.lineHeight);
            let lhLabel = '';
            if (lh <= 1.3) lhLabel = ' (tight)';
            else if (lh >= 1.6) lhLabel = ' (relaxed)';
            props.push({ key: 'line-height', value: `${style.lineHeight}${lhLabel}` });
          }
          if (style.transform) {
            props.push({ key: 'transform', value: style.transform });
          }
          if (style.spacing) {
            props.push({ key: 'letter-spacing', value: style.spacing });
          }
          if (style.isFluid) {
            props.push({ key: 'fluid', value: 'yes' });
          }
          if (style.fontFeatures) {
            props.push({ key: 'features', value: style.fontFeatures });
          }

          // Display properties
          props.forEach((prop, propIndex) => {
            const isLastProp = propIndex === props.length - 1;
            const propBranch = isLastProp ? '└─' : '├─';
            console.log(
              chalk.dim(`│  ${styleIndent}${contextIndent}${propIndent}${propBranch}`) + ' ' +
              chalk.dim(`${prop.key}: `) + `${prop.value}`
            );
          });
        });
      }
    }
  }
  console.log(chalk.dim('│'));
}

function displaySpacing(spacing) {
  console.log(chalk.dim('├─') + ' ' + chalk.bold('Spacing'));
  console.log(chalk.dim('│  ├─') + ' ' + chalk.dim(`System: ${spacing.scaleType}`));
  spacing.commonValues.slice(0, 15).forEach((v, index) => {
    const isLast = index === Math.min(spacing.commonValues.length, 15) - 1;
    const branch = isLast ? '└─' : '├─';
    console.log(chalk.dim(`│  ${branch}`) + ' ' + `${v.px.padEnd(8)} ${chalk.dim(v.rem)}`);
  });
  console.log(chalk.dim('│'));
}

function displayBorderRadius(borderRadius) {
  if (!borderRadius || borderRadius.values.length === 0) return;

  const highConfRadius = borderRadius.values.filter(r => r.confidence === 'high' || r.confidence === 'medium');
  if (highConfRadius.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Border Radius'));

  highConfRadius.slice(0, 12).forEach((r, index) => {
    const isLast = index === highConfRadius.slice(0, 12).length - 1;
    const branch = isLast ? '└─' : '├─';
    const elements = r.elements && r.elements.length > 0
      ? chalk.dim(` (${r.elements.join(', ')})`)
      : '';
    console.log(chalk.dim(`│  ${branch}`) + ' ' + `${r.value}${elements}`);
  });

  console.log(chalk.dim('│'));
}

function displayBorders(borders) {
  if (!borders) return;

  const hasCombinations = borders.combinations && borders.combinations.length > 0;
  if (!hasCombinations) return;

  const highConfCombos = borders.combinations.filter(c => c.confidence === 'high' || c.confidence === 'medium');
  if (highConfCombos.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Borders'));

  highConfCombos.slice(0, 10).forEach((combo, index) => {
    const isLast = index === Math.min(highConfCombos.length, 10) - 1;
    const branch = isLast ? '└─' : '├─';
    const conf = combo.confidence === 'high' ? chalk.hex('#50FA7B')('●') : chalk.hex('#FFB86C')('●');

    try {
      const formats = normalizeColorFormat(combo.color);
      const colorBlock = chalk.bgHex(formats.hex)('  ');

      const elementsText = combo.elements && combo.elements.length > 0
        ? chalk.dim(` (${combo.elements.join(', ')})`)
        : '';

      console.log(
        chalk.dim(`│  ${branch}`) + ' ' +
        `${conf} ${colorBlock} ${combo.width} ${combo.style} ${formats.hex.padEnd(9)} ${formats.rgb}` +
        elementsText
      );
    } catch {
      const elementsText = combo.elements && combo.elements.length > 0
        ? chalk.dim(` (${combo.elements.join(', ')})`)
        : '';

      console.log(
        chalk.dim(`│  ${branch}`) + ' ' +
        `${conf} ${combo.width} ${combo.style} ${combo.color}` +
        elementsText
      );
    }
  });

  if (highConfCombos.length > 10) {
    console.log(chalk.dim('│  └─') + ' ' + chalk.dim(`+${highConfCombos.length - 10} more`));
  }

  console.log(chalk.dim('│'));
}

function displayShadows(shadows) {
  if (!shadows || shadows.length === 0) return;

  const highConfShadows = shadows.filter(s => s.confidence === 'high' || s.confidence === 'medium');
  if (highConfShadows.length === 0) return;

  // Sort by confidence first (high > medium), then by count
  const sorted = highConfShadows.sort((a, b) => {
    const confOrder = { 'high': 2, 'medium': 1 };
    const confDiff = (confOrder[b.confidence] || 0) - (confOrder[a.confidence] || 0);
    if (confDiff !== 0) return confDiff;
    return (b.count || 0) - (a.count || 0); // Higher count first
  });

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Shadows'));
  sorted.slice(0, 8).forEach((s, index) => {
    const isLast = index === Math.min(sorted.length, 8) - 1 && sorted.length <= 8;
    const branch = isLast ? '└─' : '├─';
    const conf = s.confidence === 'high' ? chalk.hex('#50FA7B')('●') : chalk.hex('#FFB86C')('●');
    console.log(chalk.dim(`│  ${branch}`) + ' ' + `${conf} ${s.shadow}`);
  });
  if (highConfShadows.length > 8) {
    console.log(chalk.dim('│  └─') + ' ' + chalk.dim(`+${highConfShadows.length - 8} more`));
  }
  console.log(chalk.dim('│'));
}

function displayButtons(buttons) {
  if (!buttons || buttons.length === 0) return;

  const highConfButtons = buttons.filter(b => b.confidence === 'high');
  if (highConfButtons.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Buttons'));

  highConfButtons.slice(0, 6).forEach((btn, btnIndex) => {
    const isLastBtn = btnIndex === Math.min(highConfButtons.length, 6) - 1 && highConfButtons.length <= 6;
    const btnBranch = isLastBtn ? '└─' : '├─';
    const btnIndent = isLastBtn ? '   ' : '│  ';

    // Show button variant header
    try {
      const defaultBg = btn.states.default.backgroundColor;
      const isTransparent = defaultBg.includes('rgba(0, 0, 0, 0)') || defaultBg === 'transparent';

      if (isTransparent) {
        console.log(chalk.dim(`│  ${btnBranch}`) + ' ' + chalk.bold('Variant: transparent'));
      } else {
        const formats = normalizeColorFormat(defaultBg);
        const colorBlock = chalk.bgHex(formats.hex)('  ');
        console.log(chalk.dim(`│  ${btnBranch}`) + ' ' + chalk.bold(`Variant: ${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}`));
      }
    } catch {
      console.log(chalk.dim(`│  ${btnBranch}`) + ' ' + chalk.bold(`Variant: ${btn.states.default.backgroundColor}`));
    }

    // Display states
    const stateOrder = [
      { key: 'default', label: 'Default' },
      { key: 'hover', label: 'Hover' },
      { key: 'active', label: 'Active' },
      { key: 'focus', label: 'Focus' },
    ];

    const availableStates = stateOrder.filter(s => btn.states[s.key]);

    availableStates.forEach((stateInfo, stateIndex) => {
      const state = btn.states[stateInfo.key];
      const isLastState = stateIndex === availableStates.length - 1;
      const stateBranch = isLastState ? '└─' : '├─';
      const stateIndent = isLastState ? '   ' : '│  ';

      console.log(chalk.dim(`│  ${btnIndent}${stateBranch}`) + ' ' + chalk.hex('#8BE9FD')(stateInfo.label));

      const props = [];

      // Only show properties that exist and are meaningful
      if (state.backgroundColor && state.backgroundColor !== 'rgba(0, 0, 0, 0)' && state.backgroundColor !== 'transparent') {
        try {
          const formats = normalizeColorFormat(state.backgroundColor);
          const colorBlock = chalk.bgHex(formats.hex)('  ');
          props.push({ key: 'bg', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
        } catch {
          props.push({ key: 'bg', value: state.backgroundColor });
        }
      }

      if (state.color) {
        try {
          const formats = normalizeColorFormat(state.color);
          const colorBlock = chalk.bgHex(formats.hex)('  ');
          props.push({ key: 'text', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
        } catch {
          props.push({ key: 'text', value: state.color });
        }
      }

      if (stateInfo.key === 'default') {
        if (state.padding && state.padding !== '0px') {
          props.push({ key: 'padding', value: state.padding });
        }
        if (state.borderRadius && state.borderRadius !== '0px') {
          props.push({ key: 'radius', value: state.borderRadius });
        }
      }

      if (state.border && state.border !== 'none' && !state.border.includes('0px')) {
        props.push({ key: 'border', value: state.border });
      }

      if (state.boxShadow && state.boxShadow !== 'none') {
        const shortShadow = state.boxShadow.length > 40
          ? state.boxShadow.substring(0, 37) + '...'
          : state.boxShadow;
        props.push({ key: 'shadow', value: shortShadow });
      }

      if (state.outline && state.outline !== 'none') {
        props.push({ key: 'outline', value: state.outline });
      }

      if (state.transform && state.transform !== 'none') {
        props.push({ key: 'transform', value: state.transform });
      }

      if (state.opacity && state.opacity !== '1') {
        props.push({ key: 'opacity', value: state.opacity });
      }

      // Display properties
      props.forEach((prop, propIndex) => {
        const isLastProp = propIndex === props.length - 1;
        const propBranch = isLastProp ? '└─' : '├─';
        console.log(
          chalk.dim(`│  ${btnIndent}${stateIndent}${propBranch}`) + ' ' +
          chalk.dim(`${prop.key}: `) + `${prop.value}`
        );
      });
    });
  });

  if (highConfButtons.length > 6) {
    console.log(chalk.dim('│  └─') + ' ' + chalk.dim(`+${highConfButtons.length - 6} more`));
  }
  console.log(chalk.dim('│'));
}

function displayBadges(badges) {
  if (!badges || !badges.all || badges.all.length === 0) return;

  const highConfBadges = badges.all.filter(b => b.confidence === 'high');
  if (highConfBadges.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Badges / Tags / Pills'));

  // Group by variant
  const variants = ['error', 'warning', 'success', 'info', 'neutral'];
  const variantLabels = {
    error: 'Error',
    warning: 'Warning',
    success: 'Success',
    info: 'Info',
    neutral: 'Neutral'
  };

  let displayedCount = 0;
  const maxDisplay = 8;

  variants.forEach((variantKey, variantIndex) => {
    if (displayedCount >= maxDisplay) return;

    const variantBadges = highConfBadges.filter(b => b.variant === variantKey);
    if (variantBadges.length === 0) return;

    const isLastVariant = variantIndex === variants.length - 1 || displayedCount + variantBadges.length >= maxDisplay;
    const variantBranch = isLastVariant && displayedCount + variantBadges.length >= maxDisplay ? '└─' : '├─';
    const variantIndent = isLastVariant && displayedCount + variantBadges.length >= maxDisplay ? '   ' : '│  ';

    console.log(chalk.dim(`│  ${variantBranch}`) + ' ' + chalk.bold(variantLabels[variantKey]));

    const badgesToShow = variantBadges.slice(0, Math.min(2, maxDisplay - displayedCount));

    badgesToShow.forEach((badge, badgeIndex) => {
      if (displayedCount >= maxDisplay) return;

      const isLastBadge = badgeIndex === badgesToShow.length - 1;
      const badgeBranch = isLastBadge ? '└─' : '├─';
      const badgeIndent = isLastBadge ? '   ' : '│  ';

      // Show badge type
      const typeLabel = badge.isRounded ? 'Pill' : badge.styleType === 'outline' ? 'Outline' : badge.styleType === 'subtle' ? 'Subtle' : 'Filled';
      console.log(chalk.dim(`│  ${variantIndent}${badgeBranch}`) + ' ' + chalk.hex('#8BE9FD')(typeLabel));

      const props = [];

      // Background color
      if (badge.backgroundColor && badge.backgroundColor !== 'rgba(0, 0, 0, 0)' && badge.backgroundColor !== 'transparent') {
        try {
          const formats = normalizeColorFormat(badge.backgroundColor);
          const colorBlock = chalk.bgHex(formats.hex)('  ');
          props.push({ key: 'bg', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
        } catch {
          props.push({ key: 'bg', value: badge.backgroundColor });
        }
      }

      // Text color
      if (badge.color) {
        try {
          const formats = normalizeColorFormat(badge.color);
          const colorBlock = chalk.bgHex(formats.hex)('  ');
          props.push({ key: 'text', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
        } catch {
          props.push({ key: 'text', value: badge.color });
        }
      }

      // Other properties
      if (badge.padding && badge.padding !== '0px') {
        props.push({ key: 'padding', value: badge.padding });
      }
      if (badge.borderRadius && badge.borderRadius !== '0px') {
        props.push({ key: 'radius', value: badge.borderRadius });
      }
      if (badge.fontSize) {
        props.push({ key: 'font-size', value: badge.fontSize });
      }
      if (badge.fontWeight && badge.fontWeight !== '400' && badge.fontWeight !== 'normal') {
        props.push({ key: 'font-weight', value: badge.fontWeight });
      }
      if (badge.border && badge.border !== 'none' && !badge.border.includes('0px')) {
        props.push({ key: 'border', value: badge.border });
      }

      // Display properties
      props.forEach((prop, propIndex) => {
        const isLastProp = propIndex === props.length - 1;
        const propBranch = isLastProp ? '└─' : '├─';
        console.log(
          chalk.dim(`│  ${variantIndent}${badgeIndent}${propBranch}`) + ' ' +
          chalk.dim(`${prop.key}: `) + `${prop.value}`
        );
      });

      displayedCount++;
    });
  });

  if (highConfBadges.length > maxDisplay) {
    console.log(chalk.dim('│  └─') + ' ' + chalk.dim(`+${highConfBadges.length - maxDisplay} more`));
  }
  console.log(chalk.dim('│'));
}

function displayInputs(inputs) {
  if (!inputs) return;

  const hasText = inputs.text && inputs.text.length > 0;
  const hasCheckbox = inputs.checkbox && inputs.checkbox.length > 0;
  const hasRadio = inputs.radio && inputs.radio.length > 0;
  const hasSelect = inputs.select && inputs.select.length > 0;

  if (!hasText && !hasCheckbox && !hasRadio && !hasSelect) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Inputs'));

  const displayGroup = (groupName, items, isLastGroup) => {
    if (!items || items.length === 0) return;

    const groupBranch = isLastGroup ? '└─' : '├─';
    const groupIndent = isLastGroup ? '   ' : '│  ';

    console.log(chalk.dim(`│  ${groupBranch}`) + ' ' + chalk.bold(groupName));

    items.forEach((input, index) => {
      const isLast = index === items.length - 1;
      const branch = isLast ? '└─' : '├─';
      const indent = isLast ? '   ' : '│  ';

      console.log(chalk.dim(`│  ${groupIndent}${branch}`) + ' ' + chalk.hex('#8BE9FD')(input.specificType));

      // Display default state
      const defaultState = input.states.default;
      console.log(chalk.dim(`│  ${groupIndent}${indent}├─`) + ' ' + chalk.hex('#8BE9FD')('Default'));

      const defaultProps = [];

      if (defaultState.backgroundColor && defaultState.backgroundColor !== 'rgba(0, 0, 0, 0)' && defaultState.backgroundColor !== 'transparent') {
        try {
          const formats = normalizeColorFormat(defaultState.backgroundColor);
          const colorBlock = chalk.bgHex(formats.hex)('  ');
          defaultProps.push({ key: 'bg', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
        } catch {
          defaultProps.push({ key: 'bg', value: defaultState.backgroundColor });
        }
      }

      if (defaultState.color) {
        try {
          const formats = normalizeColorFormat(defaultState.color);
          const colorBlock = chalk.bgHex(formats.hex)('  ');
          defaultProps.push({ key: 'text', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
        } catch {
          defaultProps.push({ key: 'text', value: defaultState.color });
        }
      }

      if (defaultState.border && defaultState.border !== 'none' && !defaultState.border.includes('0px')) {
        defaultProps.push({ key: 'border', value: defaultState.border });
      }

      if (defaultState.padding && defaultState.padding !== '0px') {
        defaultProps.push({ key: 'padding', value: defaultState.padding });
      }

      if (defaultState.borderRadius && defaultState.borderRadius !== '0px') {
        defaultProps.push({ key: 'radius', value: defaultState.borderRadius });
      }

      defaultProps.forEach((prop, propIndex) => {
        const isLastProp = propIndex === defaultProps.length - 1 && !input.states.focus;
        const propBranch = isLastProp ? '└─' : '├─';
        console.log(
          chalk.dim(`│  ${groupIndent}${indent}│  ${propBranch}`) + ' ' +
          chalk.dim(`${prop.key}: `) + `${prop.value}`
        );
      });

      // Display focus state if available
      if (input.states.focus) {
        const focusState = input.states.focus;
        console.log(chalk.dim(`│  ${groupIndent}${indent}└─`) + ' ' + chalk.hex('#8BE9FD')('Focus'));

        const focusProps = [];

        if (focusState.backgroundColor) {
          try {
            const formats = normalizeColorFormat(focusState.backgroundColor);
            const colorBlock = chalk.bgHex(formats.hex)('  ');
            focusProps.push({ key: 'bg', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
          } catch {
            focusProps.push({ key: 'bg', value: focusState.backgroundColor });
          }
        }

        if (focusState.border) {
          focusProps.push({ key: 'border', value: focusState.border });
        }

        if (focusState.borderColor) {
          try {
            const formats = normalizeColorFormat(focusState.borderColor);
            const colorBlock = chalk.bgHex(formats.hex)('  ');
            focusProps.push({ key: 'border-color', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
          } catch {
            focusProps.push({ key: 'border-color', value: focusState.borderColor });
          }
        }

        if (focusState.boxShadow && focusState.boxShadow !== 'none') {
          const shortShadow = focusState.boxShadow.length > 40
            ? focusState.boxShadow.substring(0, 37) + '...'
            : focusState.boxShadow;
          focusProps.push({ key: 'shadow', value: shortShadow });
        }

        if (focusState.outline && focusState.outline !== 'none') {
          focusProps.push({ key: 'outline', value: focusState.outline });
        }

        focusProps.forEach((prop, propIndex) => {
          const isLastProp = propIndex === focusProps.length - 1;
          const propBranch = isLastProp ? '└─' : '├─';
          console.log(
            chalk.dim(`│  ${groupIndent}${indent}   ${propBranch}`) + ' ' +
            chalk.dim(`${prop.key}: `) + `${prop.value}`
          );
        });
      }
    });
  };

  let remaining = 0;
  if (hasText) remaining++;
  if (hasCheckbox) remaining++;
  if (hasRadio) remaining++;
  if (hasSelect) remaining++;

  if (hasText) {
    remaining--;
    displayGroup('Text Inputs', inputs.text, remaining === 0);
  }
  if (hasCheckbox) {
    remaining--;
    displayGroup('Checkboxes', inputs.checkbox, remaining === 0);
  }
  if (hasRadio) {
    remaining--;
    displayGroup('Radio Buttons', inputs.radio, remaining === 0);
  }
  if (hasSelect) {
    remaining--;
    displayGroup('Select Dropdowns', inputs.select, remaining === 0);
  }

  console.log(chalk.dim('│'));
}

function displayBreakpoints(breakpoints) {
  if (!breakpoints || breakpoints.length === 0) return;

  // Sort from larger to smaller, filtering out invalid entries
  const sorted = [...breakpoints]
    .filter(bp => bp.px && !isNaN(parseFloat(bp.px)))
    .sort((a, b) => {
      const aVal = parseFloat(a.px);
      const bVal = parseFloat(b.px);
      return bVal - aVal;
    });

  if (sorted.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Breakpoints'));
  console.log(chalk.dim('│  └─') + ' ' + `${sorted.map(bp => bp.px).join(' → ')}`);
  console.log(chalk.dim('│'));
}

function displayLinks(links) {
  if (!links || links.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Links'));

  links.slice(0, 6).forEach((link, linkIndex) => {
    const isLastLink = linkIndex === Math.min(links.length, 6) - 1;
    const linkBranch = isLastLink ? '└─' : '├─';
    const linkIndent = isLastLink ? '   ' : '│  ';

    // Show link variant header with color
    try {
      const formats = normalizeColorFormat(link.color);
      const colorBlock = chalk.bgHex(formats.hex)('  ');
      console.log(chalk.dim(`│  ${linkBranch}`) + ' ' + `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}`);
    } catch {
      console.log(chalk.dim(`│  ${linkBranch}`) + ' ' + `${link.color}`);
    }

    // Display default state
    if (link.states && link.states.default) {
      const defaultState = link.states.default;
      const hasHover = link.states.hover;
      const hasDecoration = defaultState.textDecoration && defaultState.textDecoration !== 'none';

      // Only show default state if there's decoration or hover state
      if (hasDecoration || hasHover) {
        console.log(chalk.dim(`│  ${linkIndent}├─`) + ' ' + chalk.hex('#8BE9FD')('Default'));

        if (hasDecoration) {
          const decorBranch = hasHover ? '├─' : '└─';
          console.log(chalk.dim(`│  ${linkIndent}│  ${decorBranch}`) + ' ' + chalk.dim(`decoration: ${defaultState.textDecoration}`));
        }
      }

      // Display hover state if available
      if (hasHover) {
        const hoverState = link.states.hover;
        console.log(chalk.dim(`│  ${linkIndent}└─`) + ' ' + chalk.hex('#8BE9FD')('Hover'));

        const hoverProps = [];

        if (hoverState.color) {
          try {
            const formats = normalizeColorFormat(hoverState.color);
            const colorBlock = chalk.bgHex(formats.hex)('  ');
            hoverProps.push({ key: 'color', value: `${colorBlock} ${formats.hex.padEnd(9)} ${formats.rgb}` });
          } catch {
            hoverProps.push({ key: 'color', value: hoverState.color });
          }
        }

        if (hoverState.textDecoration) {
          hoverProps.push({ key: 'decoration', value: hoverState.textDecoration });
        }

        hoverProps.forEach((prop, propIndex) => {
          const isLastProp = propIndex === hoverProps.length - 1;
          const propBranch = isLastProp ? '└─' : '├─';
          console.log(
            chalk.dim(`│  ${linkIndent}   ${propBranch}`) + ' ' +
            chalk.dim(`${prop.key}: `) + `${prop.value}`
          );
        });
      }
    } else {
      // Fallback for old format
      if (link.textDecoration && link.textDecoration !== 'none') {
        console.log(chalk.dim(`│  ${linkIndent}└─`) + ' ' + chalk.dim(`decoration: ${link.textDecoration}`));
      }
    }
  });

  if (links.length > 6) {
    console.log(chalk.dim('│  └─') + ' ' + chalk.dim(`+${links.length - 6} more`));
  }

  console.log(chalk.dim('│'));
}

function displayIconSystem(iconSystem) {
  if (!iconSystem || iconSystem.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Icon System'));
  iconSystem.forEach((system, index) => {
    const isLast = index === iconSystem.length - 1;
    const branch = isLast ? '└─' : '├─';
    const sizes = system.sizes ? ` · ${system.sizes.join(', ')}` : '';
    console.log(chalk.dim(`│  ${branch}`) + ' ' + `${system.name} ${chalk.dim(system.type)}${sizes}`);
  });
  console.log(chalk.dim('│'));
}

function displayFrameworks(frameworks) {
  if (!frameworks || frameworks.length === 0) return;

  console.log(chalk.dim('├─') + ' ' + chalk.bold('Frameworks'));
  frameworks.forEach((fw, index) => {
    const isLast = index === frameworks.length - 1;
    const branch = isLast ? '└─' : '├─';
    const conf = fw.confidence === 'high' ? chalk.hex('#50FA7B')('●') : chalk.hex('#FFB86C')('●');
    console.log(chalk.dim(`│  ${branch}`) + ' ' + `${conf} ${fw.name} ${chalk.dim(fw.evidence)}`);
  });
  console.log(chalk.dim('│'));
}
