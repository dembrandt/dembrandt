export async function extractButtonStyles(page) {
  return await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll(`
        button,
        a[type="button"],
        [role="button"],
        [role="tab"],
        [role="menuitem"],
        [role="switch"],
        [aria-pressed],
        [aria-expanded],
        .btn,
        [class*="btn"],
        [class*="button"],
        [class*="cta"],
        [data-cta]
      `)
    );

    const extractState = (btn) => {
      const computed = getComputedStyle(btn);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        padding: computed.padding,
        borderRadius: computed.borderRadius,
        border: computed.border || `${computed.borderWidth} ${computed.borderStyle} ${computed.borderColor}`,
        boxShadow: computed.boxShadow,
        outline: computed.outline,
        transform: computed.transform,
        opacity: computed.opacity,
      };
    };

    const buttonStyles = [];

    buttons.forEach((btn) => {
      const computed = getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') return;

      const bg = computed.backgroundColor;
      const border = computed.border;
      const borderWidth = computed.borderWidth;
      const borderColor = computed.borderColor;
      const boxShadow = computed.boxShadow;

      const hasBorder = borderWidth && parseFloat(borderWidth) > 0 && border !== 'none' && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent';
      const hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const hasShadow = boxShadow && boxShadow !== 'none' && boxShadow !== 'rgba(0, 0, 0, 0)';

      if (!hasBackground && !hasBorder && !hasShadow) return;

      const role = btn.getAttribute('role');
      const isNativeButton = btn.tagName === "BUTTON";
      const isButtonRole = ['button', 'tab', 'menuitem', 'switch'].includes(role);
      const hasAriaPressed = btn.hasAttribute('aria-pressed');
      const hasAriaExpanded = btn.hasAttribute('aria-expanded');
      const isHighConfidence = isNativeButton || isButtonRole || hasAriaPressed || hasAriaExpanded;

      const className = typeof btn.className === 'string' ? btn.className : btn.className.baseVal || '';

      const defaultState = extractState(btn);
      const states = { default: defaultState, hover: null, active: null, focus: null };

      try {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule.selectorText) {
                const btnClasses = className.split(' ').filter(c => c);
                const matchesButton = btnClasses.some(cls => rule.selectorText.includes(`.${cls}`));
                if (matchesButton || rule.selectorText.includes(btn.tagName.toLowerCase())) {
                  if (rule.selectorText.includes(':hover')) {
                    if (!states.hover) states.hover = {};
                    if (rule.style.backgroundColor) states.hover.backgroundColor = rule.style.backgroundColor;
                    if (rule.style.color) states.hover.color = rule.style.color;
                    if (rule.style.boxShadow) states.hover.boxShadow = rule.style.boxShadow;
                    if (rule.style.outline) states.hover.outline = rule.style.outline;
                    if (rule.style.border) states.hover.border = rule.style.border;
                    if (rule.style.transform) states.hover.transform = rule.style.transform;
                    if (rule.style.opacity) states.hover.opacity = rule.style.opacity;
                  }
                  if (rule.selectorText.includes(':active')) {
                    if (!states.active) states.active = {};
                    if (rule.style.backgroundColor) states.active.backgroundColor = rule.style.backgroundColor;
                    if (rule.style.color) states.active.color = rule.style.color;
                    if (rule.style.boxShadow) states.active.boxShadow = rule.style.boxShadow;
                    if (rule.style.outline) states.active.outline = rule.style.outline;
                    if (rule.style.border) states.active.border = rule.style.border;
                    if (rule.style.transform) states.active.transform = rule.style.transform;
                    if (rule.style.opacity) states.active.opacity = rule.style.opacity;
                  }
                  if (rule.selectorText.includes(':focus')) {
                    if (!states.focus) states.focus = {};
                    if (rule.style.backgroundColor) states.focus.backgroundColor = rule.style.backgroundColor;
                    if (rule.style.color) states.focus.color = rule.style.color;
                    if (rule.style.boxShadow) states.focus.boxShadow = rule.style.boxShadow;
                    if (rule.style.outline) states.focus.outline = rule.style.outline;
                    if (rule.style.border) states.focus.border = rule.style.border;
                    if (rule.style.transform) states.focus.transform = rule.style.transform;
                    if (rule.style.opacity) states.focus.opacity = rule.style.opacity;
                  }
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}

      buttonStyles.push({
        states,
        fontWeight: computed.fontWeight,
        fontSize: computed.fontSize,
        classes: className.substring(0, 50),
        confidence: isHighConfidence ? "high" : "medium",
      });
    });

    const uniqueButtons = [];
    const seen = new Set();
    for (const btn of buttonStyles) {
      const s = btn.states.default;
      const key = `${s.backgroundColor}|${s.border}|${s.boxShadow}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueButtons.push(btn);
      }
    }

    return uniqueButtons.slice(0, 15);
  });
}

export async function extractInputStyles(page) {
  return await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll(`
        input[type="text"],
        input[type="email"],
        input[type="password"],
        input[type="search"],
        input[type="tel"],
        input[type="url"],
        input[type="number"],
        input[type="checkbox"],
        input[type="radio"],
        textarea,
        select,
        [role="textbox"],
        [role="searchbox"],
        [role="combobox"],
        [contenteditable="true"]
      `)
    );

    const inputGroups = { text: [], checkbox: [], radio: [], select: [] };

    inputs.forEach((input) => {
      const computed = getComputedStyle(input);
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') return;

      let inputType = 'text';
      if (input.tagName === 'SELECT') inputType = 'select';
      else if (input.type === 'checkbox') inputType = 'checkbox';
      else if (input.type === 'radio') inputType = 'radio';

      const specificType = input.type || input.tagName.toLowerCase();

      const defaultState = {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        border: computed.border || `${computed.borderWidth} ${computed.borderStyle} ${computed.borderColor}`,
        borderRadius: computed.borderRadius,
        padding: computed.padding,
        boxShadow: computed.boxShadow,
        outline: computed.outline,
      };

      let focusState = null;
      try {
        const sheets = Array.from(document.styleSheets);
        const className = typeof input.className === 'string' ? input.className : input.className.baseVal || '';
        const classes = className.split(' ').filter(c => c);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule.selectorText) {
                const matchesInput = classes.some(cls => rule.selectorText.includes(`.${cls}`)) ||
                  rule.selectorText.includes(input.tagName.toLowerCase()) ||
                  (input.type && rule.selectorText.includes(`[type="${input.type}"]`));
                if (matchesInput && rule.selectorText.includes(':focus')) {
                  if (!focusState) focusState = {};
                  if (rule.style.backgroundColor) focusState.backgroundColor = rule.style.backgroundColor;
                  if (rule.style.color) focusState.color = rule.style.color;
                  if (rule.style.border) focusState.border = rule.style.border;
                  if (rule.style.borderColor) focusState.borderColor = rule.style.borderColor;
                  if (rule.style.boxShadow) focusState.boxShadow = rule.style.boxShadow;
                  if (rule.style.outline) focusState.outline = rule.style.outline;
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}

      inputGroups[inputType].push({ specificType, states: { default: defaultState, focus: focusState } });
    });

    const deduplicateGroup = (group) => {
      const seen = new Map();
      for (const item of group) {
        const key = `${item.states.default.border}|${item.states.default.borderRadius}|${item.states.default.backgroundColor}`;
        if (!seen.has(key)) seen.set(key, item);
      }
      return Array.from(seen.values());
    };

    return {
      text: deduplicateGroup(inputGroups.text).slice(0, 5),
      checkbox: deduplicateGroup(inputGroups.checkbox).slice(0, 3),
      radio: deduplicateGroup(inputGroups.radio).slice(0, 3),
      select: deduplicateGroup(inputGroups.select).slice(0, 3),
    };
  });
}

export async function extractLinkStyles(page) {
  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll(`a, [role="link"], [aria-current]`));
    const uniqueStyles = new Map();

    links.forEach((link) => {
      const computed = getComputedStyle(link);
      const rect = link.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') return;

      const normalizeColor = (color) => {
        try {
          const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (rgbaMatch) {
            const r = parseInt(rgbaMatch[1]);
            const g = parseInt(rgbaMatch[2]);
            const b = parseInt(rgbaMatch[3]);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
          return color.toLowerCase();
        } catch {
          return color;
        }
      };

      const key = normalizeColor(computed.color);

      if (!uniqueStyles.has(key)) {
        let hoverState = null;
        try {
          const sheets = Array.from(document.styleSheets);
          const className = typeof link.className === 'string' ? link.className : link.className.baseVal || '';
          const classes = className.split(' ').filter(c => c);
          for (const sheet of sheets) {
            try {
              const rules = Array.from(sheet.cssRules || []);
              for (const rule of rules) {
                if (rule.selectorText) {
                  const matchesLink = classes.some(cls => rule.selectorText.includes(`.${cls}`)) ||
                    rule.selectorText.includes('a:hover');
                  if (matchesLink && rule.selectorText.includes(':hover')) {
                    if (!hoverState) hoverState = {};
                    if (rule.style.color) hoverState.color = rule.style.color;
                    if (rule.style.textDecoration) hoverState.textDecoration = rule.style.textDecoration;
                  }
                }
              }
            } catch (e) {}
          }
        } catch (e) {}

        uniqueStyles.set(key, {
          color: computed.color,
          textDecoration: computed.textDecoration,
          fontWeight: computed.fontWeight,
          states: {
            default: { color: computed.color, textDecoration: computed.textDecoration },
            hover: hoverState,
          },
        });
      } else {
        const existing = uniqueStyles.get(key);
        if (!existing.states.default.textDecoration || existing.states.default.textDecoration === 'none') {
          if (computed.textDecoration && computed.textDecoration !== 'none') {
            existing.states.default.textDecoration = computed.textDecoration;
          }
        }
      }
    });

    return Array.from(uniqueStyles.values()).slice(0, 8);
  });
}

export async function extractBadgeStyles(page) {
  return await page.evaluate(() => {
    const badges = Array.from(
      document.querySelectorAll(`
        [class*="badge"], [class*="tag"], [class*="pill"], [class*="chip"],
        [class*="label"]:not(label), [role="status"],
        .badge, .tag, .pill, .chip, .label:not(label)
      `)
    );

    const badgeStyles = [];
    const seenStyles = new Map();

    badges.forEach((badge) => {
      const computed = getComputedStyle(badge);
      const rect = badge.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') return;

      const width = rect.width;
      const height = rect.height;
      const fontSize = parseFloat(computed.fontSize);
      if (width > 200 || height > 60 || fontSize > 16) return;

      const bg = computed.backgroundColor;
      const border = computed.border;
      const borderWidth = computed.borderWidth;
      const hasBorder = borderWidth && parseFloat(borderWidth) > 0 && border !== 'none';
      const hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      if (!hasBackground && !hasBorder) return;

      const paddingTop = parseFloat(computed.paddingTop);
      const paddingBottom = parseFloat(computed.paddingBottom);
      const paddingLeft = parseFloat(computed.paddingLeft);
      const paddingRight = parseFloat(computed.paddingRight);
      if ((paddingTop + paddingBottom) / 2 > 16 || (paddingLeft + paddingRight) / 2 > 24) return;

      const className = typeof badge.className === 'string' ? badge.className : badge.className.baseVal || '';
      const hasSemanticClass = /badge|tag|pill|chip|label|status/i.test(className);
      const hasSemanticRole = badge.getAttribute('role') === 'status';
      const borderRadius = parseFloat(computed.borderRadius);
      const isRounded = borderRadius > height / 3;

      const bgColor = computed.backgroundColor;
      let variant = 'neutral';
      if (bgColor.includes('255, 0, 0') || bgColor.includes('220, 53, 69') || bgColor.includes('239, 68, 68')) variant = 'error';
      else if (bgColor.includes('255, 193, 7') || bgColor.includes('251, 191, 36') || bgColor.includes('245, 158, 11')) variant = 'warning';
      else if (bgColor.includes('40, 167, 69') || bgColor.includes('34, 197, 94') || bgColor.includes('16, 185, 129')) variant = 'success';
      else if (bgColor.includes('0, 123, 255') || bgColor.includes('59, 130, 246') || bgColor.includes('37, 99, 235')) variant = 'info';

      let styleType = 'filled';
      if (!hasBackground && hasBorder) styleType = 'outline';
      else if (hasBackground) {
        const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          const [, r, g, b] = rgbMatch.map(Number);
          if (r > 240 && g > 240 && b > 240) styleType = 'subtle';
        }
      }

      const confidence = (hasSemanticClass || hasSemanticRole) ? 'high' : 'medium';
      const styleKey = `${bgColor}-${computed.color}-${borderRadius}-${styleType}`;

      if (!seenStyles.has(styleKey)) {
        badgeStyles.push({
          backgroundColor: bgColor,
          color: computed.color,
          padding: computed.padding,
          borderRadius: computed.borderRadius,
          border: computed.border,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          textTransform: computed.textTransform,
          letterSpacing: computed.letterSpacing,
          variant,
          styleType,
          isRounded,
          classes: className.substring(0, 50),
          confidence,
        });
        seenStyles.set(styleKey, true);
      }
    });

    const grouped = {
      error: badgeStyles.filter(b => b.variant === 'error'),
      warning: badgeStyles.filter(b => b.variant === 'warning'),
      success: badgeStyles.filter(b => b.variant === 'success'),
      info: badgeStyles.filter(b => b.variant === 'info'),
      neutral: badgeStyles.filter(b => b.variant === 'neutral'),
    };

    return { all: badgeStyles.slice(0, 20), byVariant: grouped };
  });
}
