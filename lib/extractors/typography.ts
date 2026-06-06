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
      .forEach((l: any) => {
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

    // Detect truly custom fonts: @font-face rules loading from own domain
    const thirdPartyHosts = ['googleapis.com', 'gstatic.com', 'typekit.net', 'adobe.com',
      'fonts.com', 'cloud.typography.com', 'fast.fonts.net', 'use.fontawesome.com'];
    const pageHost = window.location.hostname;
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule instanceof CSSFontFaceRule) {
              const src = rule.style.getPropertyValue('src') || '';
              const family = (rule.style.getPropertyValue('font-family') || '').replace(/['"]/g, '').trim();
              if (!family) continue;
              const isThirdParty = thirdPartyHosts.some(h => src.includes(h));
              const isSameOrigin = src.includes(pageHost) || src.startsWith('/') || src.startsWith('./') || (!src.includes('http') && src.includes('url('));
              if (!isThirdParty && (isSameOrigin || src.includes('url(')) && !sources.customFonts.includes(family)) {
                sources.customFonts.push(family);
              }
              const familyLower = family.toLowerCase();
              if (
                familyLower.includes('variable') ||
                familyLower.includes(' vf') ||
                familyLower.endsWith('-var') ||
                (src.includes('woff2') && rule.style.getPropertyValue('font-variation-settings'))
              ) {
                sources.variableFonts.add(family);
              }
            }
          }
        } catch {}
      }
    } catch {}

    let fontDisplay = null;
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule instanceof CSSFontFaceRule) {
              const display = (rule.style as any).fontDisplay;
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
    (sources as any).fontDisplay = fontDisplay;

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

      let context = "body";
      const className = typeof el.className === 'string' ? el.className : ((el as any).className.baseVal || '');
      const headingMatch = el.tagName.match(/^H([1-6])$/);
      if (
        el.tagName === "BUTTON" ||
        el.getAttribute("role") === "button" ||
        className.includes("btn")
      ) {
        context = "ui";
      } else if (el.tagName === "A" && (el as any).href) {
        context = "link";
      } else if (headingMatch) {
        const level = parseInt(headingMatch[1]);
        // h1 at very large size = display, otherwise heading
        context = (level === 1 && size >= 56) ? "display" : `heading-${level}`;
      } else if (size >= 56) {
        context = "display";  // non-heading super-sized text (hero, marketing)
      } else if (size <= 12) {
        context = "caption";
      } else if (el.tagName === "LABEL" || el.tagName === "SMALL" ||
                 className.includes("label") || className.includes("caption") || className.includes("badge")) {
        context = "ui";
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
