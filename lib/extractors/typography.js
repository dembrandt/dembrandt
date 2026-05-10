export async function extractTypography(page) {
  return await page.evaluate(() => {
    const seen = new Map();
    const sources = {
      googleFonts: [],
      adobeFonts: false,
      customFonts: [],
      variableFonts: new Set(),
    };

    document
      .querySelectorAll(
        'link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]'
      )
      .forEach((l) => {
        const matches = l.href.match(/family=([^&:%]+)/g) || [];
        matches.forEach((m) => {
          const name = decodeURIComponent(
            m.replace("family=", "").split(":")[0]
          ).replace(/\+/g, " ");
          if (!sources.googleFonts.includes(name))
            sources.googleFonts.push(name);
          if (l.href.includes("wght") || l.href.includes("ital"))
            sources.variableFonts.add(name);
        });
      });
    if (
      document.querySelector(
        'link[href*="typekit.net"], script[src*="use.typekit.net"]'
      )
    ) {
      sources.adobeFonts = true;
    }

    let fontDisplay = null;
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule instanceof CSSFontFaceRule) {
              const display = rule.style.fontDisplay;
              if (display && display !== 'auto') {
                fontDisplay = display;
                break;
              }
            }
          }
        } catch (e) {}
        if (fontDisplay) break;
      }
    } catch (e) {}
    sources.fontDisplay = fontDisplay;

    const els = document.querySelectorAll(`
      h1,h2,h3,h4,h5,h6,p,span,a,button,[role="button"],.btn,.button,
      .hero,[class*="title"],[class*="heading"],[class*="text"],nav a
    `);

    els.forEach((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return;

      const size = parseFloat(s.fontSize);
      const weight = parseInt(s.fontWeight) || 400;
      const fontFamilies = s.fontFamily.split(",").map(f => f.replace(/['"]/g, "").trim());
      const family = fontFamilies[0];
      const fallbacks = fontFamilies.slice(1).filter(f => f && f !== 'sans-serif' && f !== 'serif' && f !== 'monospace');
      const letterSpacing = s.letterSpacing;
      const textTransform = s.textTransform;
      const lineHeight = s.lineHeight;

      const isFluid = s.fontSize.includes('clamp') || s.fontSize.includes('vw') || s.fontSize.includes('vh');
      const fontFeatures = s.fontFeatureSettings !== 'normal' ? s.fontFeatureSettings : null;

      let context = "heading-1";
      const className = typeof el.className === 'string' ? el.className : (el.className.baseVal || '');
      if (
        el.tagName === "BUTTON" ||
        el.getAttribute("role") === "button" ||
        className.includes("btn")
      ) {
        context = "button";
      } else if (el.tagName === "A" && el.href) {
        context = "link";
      } else if (size <= 14) {
        context = "caption";
      } else if (el.tagName.match(/^H[1-6]$/)) {
        context = "heading-1";
      }

      const key = `${family}|${size}|${weight}|${context}|${letterSpacing}|${textTransform}`;
      if (seen.has(key)) return;

      let lineHeightValue = null;
      if (lineHeight !== 'normal') {
        const lhNum = parseFloat(lineHeight);
        if (lineHeight.includes('px')) {
          lineHeightValue = (lhNum / size).toFixed(2);
        } else {
          lineHeightValue = lhNum.toFixed(2);
        }
      }

      seen.set(key, {
        context,
        family,
        fallbacks: fallbacks.length > 0 ? fallbacks.join(', ') : null,
        size: `${size}px (${(size / 16).toFixed(2)}rem)`,
        weight,
        lineHeight: lineHeightValue,
        spacing: letterSpacing !== "normal" ? letterSpacing : null,
        transform: textTransform !== "none" ? textTransform : null,
        isFluid: isFluid || undefined,
        fontFeatures: fontFeatures || undefined,
      });
    });

    const result = Array.from(seen.values()).sort((a, b) => {
      const aSize = parseFloat(a.size);
      const bSize = parseFloat(b.size);
      return bSize - aSize;
    });

    return {
      styles: result,
      sources: {
        googleFonts: sources.googleFonts,
        adobeFonts: sources.adobeFonts,
        variableFonts: [...sources.variableFonts].length > 0,
      },
    };
  });
}
