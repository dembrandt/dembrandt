export async function extractButtonStyles(page) {
  return await page.evaluate(() => {
    // Only real interactive buttons — not tabs, menus, dropdowns
    const candidates = Array.from(document.querySelectorAll(
      'button, a[href], [role="button"]'
    ));

    const isTransparent = (color) =>
      !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';

    const results = [];

    for (const el of candidates) {
      try {
        const computed = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) continue;
        if (computed.display === 'none' || computed.visibility === 'hidden') continue;

        // Skip nav/menu context elements
        const role = el.getAttribute('role');
        if (['tab', 'menuitem', 'option', 'switch', 'treeitem'].includes(role)) continue;
        if (el.closest('[role="tablist"], [role="menu"], [role="menubar"], nav, footer')) continue;

        // Must have a visible background or border — not just inherited
        const bg = computed.backgroundColor;
        const borderWidth = parseFloat(computed.borderWidth);
        const hasBackground = !isTransparent(bg);
        const hasBorder = borderWidth > 0 && !isTransparent(computed.borderColor);

        if (!hasBackground && !hasBorder) continue;

        // Size sanity: real buttons aren't huge or tiny
        if (rect.height < 24 || rect.height > 100) continue;
        if (rect.width < 40 || rect.width > 600) continue;

        // Prefer above-the-fold
        const aboveFold = rect.top < window.innerHeight;

        // Score by prominence
        let score = 0;
        if (el.tagName === 'BUTTON') score += 30;
        if (role === 'button') score += 20;
        if (hasBackground) score += 20;
        if (hasBorder && !hasBackground) score += 10;
        if (aboveFold) score += 15;
        if (rect.top < 300) score += 10;

        // Skip buttons with no visible text
        const text = el.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (text.length === 0) continue;

        // Skip fully transparent backgrounds with no border (ghost-only inherited bg)
        if (isTransparent(bg) && !hasBorder) continue;

        results.push({
          el,
          score,
          state: {
            backgroundColor: bg,
            color: computed.color,
            padding: computed.padding,
            borderRadius: computed.borderRadius,
            border: `${computed.borderWidth} ${computed.borderStyle} ${computed.borderColor}`,
            boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : undefined,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
          },
          text: text.slice(0, 40),
        });
      } catch {}
    }

    // Sort by score, deduplicate by visual fingerprint
    results.sort((a, b) => b.score - a.score);

    const seen = new Set();
    const unique = [];
    for (const r of results) {
      const s = r.state;
      const key = `${s.backgroundColor}|${s.color}|${s.borderRadius}|${s.border}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          states: { default: s },
          fontWeight: s.fontWeight,
          fontSize: s.fontSize,
          text: r.text,
          confidence: r.score >= 40 ? 'high' : 'medium',
        });
      }
      if (unique.length >= 8) break;
    }

    return unique;
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

    const _lcCanvas = document.createElement('canvas');
    _lcCanvas.width = _lcCanvas.height = 1;
    const _lcCtx = _lcCanvas.getContext('2d');
    const normalizeColor = (color) => {
      try {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (m) return `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`;
        if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
        if (_lcCtx) {
          _lcCtx.clearRect(0, 0, 1, 1);
          _lcCtx.fillStyle = 'rgba(0,0,0,0)';
          _lcCtx.fillStyle = color;
          _lcCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = _lcCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
        }
        return color.toLowerCase();
      } catch { return color.toLowerCase(); }
    };

    links.forEach((link) => {
      const computed = getComputedStyle(link);
      const rect = link.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') return;

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
