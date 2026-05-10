export async function extractSpacing(page) {
  return await page.evaluate(() => {
    const spacings = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const computed = getComputedStyle(el);
      ["marginTop", "marginBottom", "paddingTop", "paddingBottom"].forEach(
        (prop) => {
          const value = parseFloat(computed[prop]);
          if (value > 0) {
            spacings.set(value, (spacings.get(value) || 0) + 1);
          }
        }
      );
    });

    const values = Array.from(spacings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([px, count]) => ({
        px: px + "px",
        rem: (px / 16).toFixed(2) + "rem",
        count,
        numericValue: px,
      }))
      .sort((a, b) => a.numericValue - b.numericValue);

    const is4px = values.some((v) => parseFloat(v.px) % 4 === 0);
    const is8px = values.some((v) => parseFloat(v.px) % 8 === 0);
    const scaleType = is8px ? "8px" : is4px ? "4px" : "custom";

    return { scaleType, commonValues: values };
  });
}

export async function extractBorderRadius(page) {
  return await page.evaluate(() => {
    const radii = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const radius = getComputedStyle(el).borderRadius;
      if (radius && radius !== "0px") {
        if (!radii.has(radius)) {
          radii.set(radius, { count: 0, elements: new Set() });
        }
        const data = radii.get(radius);
        data.count++;

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || el.getAttribute('aria-label');
        const classes = Array.from(el.classList);

        let context = tag;
        if (role) context = role;
        else if (classes.some(c => c.includes('button') || c.includes('btn'))) context = 'button';
        else if (classes.some(c => c.includes('card'))) context = 'card';
        else if (classes.some(c => c.includes('input') || c.includes('field'))) context = 'input';
        else if (classes.some(c => c.includes('badge') || c.includes('tag') || c.includes('chip'))) context = 'badge';
        else if (classes.some(c => c.includes('modal') || c.includes('dialog'))) context = 'modal';
        else if (classes.some(c => c.includes('image') || c.includes('img') || c.includes('avatar'))) context = 'image';

        data.elements.add(context);
      }
    });

    const values = Array.from(radii.entries())
      .map(([value, data]) => ({
        value,
        count: data.count,
        elements: Array.from(data.elements).slice(0, 5),
        confidence: data.count > 10 ? "high" : data.count > 3 ? "medium" : "low",
        numericValue: parseFloat(value) || 0,
      }))
      .sort((a, b) => {
        if (a.value.includes("%") && !b.value.includes("%")) return 1;
        if (!a.value.includes("%") && b.value.includes("%")) return -1;
        return a.numericValue - b.numericValue;
      });

    return { values };
  });
}

export async function extractBorders(page) {
  return await page.evaluate(() => {
    const combinations = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const computed = getComputedStyle(el);

      const borderWidth = computed.borderWidth;
      const borderStyle = computed.borderStyle;
      const borderColor = computed.borderColor;

      if (
        borderWidth &&
        borderWidth !== "0px" &&
        borderStyle &&
        borderStyle !== "none" &&
        borderColor &&
        borderColor !== "rgba(0, 0, 0, 0)" &&
        borderColor !== "transparent"
      ) {
        const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
        const individualColors = borderColor.match(colorRegex) || [borderColor];
        const normalizedColor = individualColors[0];

        if (normalizedColor &&
          normalizedColor !== "rgba(0, 0, 0, 0)" &&
          normalizedColor !== "rgba(0,0,0,0)" &&
          normalizedColor !== "transparent") {

          const key = `${borderWidth}|${borderStyle}|${normalizedColor}`;

          if (!combinations.has(key)) {
            combinations.set(key, {
              width: borderWidth,
              style: borderStyle,
              color: normalizedColor,
              count: 0,
              elements: new Set()
            });
          }

          const combo = combinations.get(key);
          combo.count++;

          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          const classes = Array.from(el.classList);

          let context = tag;
          if (role) context = role;
          else if (classes.some(c => c.includes('button') || c.includes('btn'))) context = 'button';
          else if (classes.some(c => c.includes('card'))) context = 'card';
          else if (classes.some(c => c.includes('input') || c.includes('field'))) context = 'input';
          else if (classes.some(c => c.includes('modal') || c.includes('dialog'))) context = 'modal';

          combo.elements.add(context);
        }
      }
    });

    const processed = Array.from(combinations.values())
      .map(combo => ({
        width: combo.width,
        style: combo.style,
        color: combo.color,
        count: combo.count,
        elements: Array.from(combo.elements).slice(0, 5),
        confidence: combo.count > 10 ? "high" : combo.count > 3 ? "medium" : "low",
      }))
      .sort((a, b) => b.count - a.count);

    return { combinations: processed };
  });
}

export async function extractShadows(page) {
  return await page.evaluate(() => {
    const shadows = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const shadow = getComputedStyle(el).boxShadow;
      if (shadow && shadow !== "none") {
        shadows.set(shadow, (shadows.get(shadow) || 0) + 1);
      }
    });

    return Array.from(shadows.entries())
      .map(([shadow, count]) => ({
        shadow,
        count,
        confidence: count > 5 ? "high" : count > 2 ? "medium" : "low",
      }))
      .sort((a, b) => b.count - a.count);
  });
}
