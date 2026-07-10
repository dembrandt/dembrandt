import { DOM_COLOR_SNAPSHOT_SCRIPT, extractPlatformColors, resolvePlatformColors } from './platform-colors.js';
import { LOGO_HEURISTICS_SOURCE } from './logo-heuristics.js';

export async function extractSiteName(page) {
  return await page.evaluate(() => {
    const ogSiteName = document.querySelector('meta[property="og:site_name"]') as any;
    if (ogSiteName?.content?.trim()) return ogSiteName.content.trim();

    const appName = document.querySelector('meta[name="application-name"]') as any;
    if (appName?.content?.trim()) return appName.content.trim();

    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of ldScripts) {
      try {
        const data = JSON.parse(s.textContent);
        const items = Array.isArray(data) ? data : data?.['@graph'] || [data];
        for (const obj of items) {
          if (obj?.name && typeof obj.name === 'string') return obj.name;
          if (obj?.organization?.name) return obj.organization.name;
        }
      } catch {}
    }

    const title = document.title?.trim();
    if (title) {
      const sep = title.match(/(.+?)\s*[|\-–—:]\s*/);
      if (sep && sep[1].length > 1 && sep[1].length < 40) return sep[1].trim();
    }

    const logoImg = document.querySelector('img[class*="logo"], img[id*="logo"], a[class*="logo"] img') as any;
    if (logoImg?.alt?.trim() && logoImg.alt.length < 40) return logoImg.alt.trim();

    return null;
  });
}

export async function extractLogo(page, url) {
  // Extract manifest.json for PWA icons
  const manifestIcons = await page.evaluate((baseUrl) => {
    try {
      const manifestLink = document.querySelector('link[rel="manifest"]') as any;
      if (!manifestLink) return [];
      return [{ manifestUrl: new URL(manifestLink.getAttribute('href'), baseUrl).href }];
    } catch {
      return [];
    }
  }, url);

  let pwaIcons = [];
  const manifestMeta: any = {};
  if (manifestIcons.length > 0) {
    try {
      const manifestUrl = manifestIcons[0].manifestUrl;
      const response = await page.evaluate(async (mUrl) => {
        try {
          const r = await fetch(mUrl);
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      }, manifestUrl);

      if (response?.icons) {
        pwaIcons = response.icons.map(icon => ({
          type: 'pwa',
          url: new URL(icon.src, url).href,
          sizes: icon.sizes || null,
          purpose: icon.purpose || 'any',
        }));
      }

      if (response) {
        if (response.theme_color) manifestMeta.themeColor = response.theme_color;
        if (response.background_color) manifestMeta.backgroundColor = response.background_color;
        if (response.name) manifestMeta.name = response.name;
        if (response.short_name) manifestMeta.shortName = response.short_name;
      }
    } catch {}
  }

  // Platform-specific color hints (meta/link tags) — fills gaps not covered by manifest
  const domSnap = await page.evaluate(DOM_COLOR_SNAPSHOT_SCRIPT);
  const platformHints = extractPlatformColors(domSnap);
  const resolved = resolvePlatformColors(platformHints, {
    themeColor: manifestMeta.themeColor,
    backgroundColor: manifestMeta.backgroundColor,
  });
  if (resolved.themeColor) manifestMeta.themeColor = resolved.themeColor;
  if (resolved.darkThemeColor) manifestMeta.darkThemeColor = resolved.darkThemeColor;
  if (resolved.backgroundColor) manifestMeta.backgroundColor = resolved.backgroundColor;

  const result = await page.evaluate(({ baseUrl, heuristicsSource }) => {
    const siteDomain = new URL(baseUrl).hostname.replace('www.', '').split('.')[0].toLowerCase();
    // The pure, unit-tested heuristics from logo-heuristics.ts, run here as the exact same
    // code. guardExtractor wraps this whole evaluate, so even a rehydration failure only
    // yields an empty logo result for this one site — never a crash.
    const H = new Function(heuristicsSource +
      '\nreturn { isHomeHref, classifyContextByPosition, thirdPartyBrandFromAlt, positionFraction, fitPaintedBox, isLogoSized };')() as {
        isHomeHref: (href: any, origin: any) => boolean;
        classifyContextByPosition: (top: any, docHeight: any, foldY?: number) => 'header'|'footer'|'hero'|'body';
        thirdPartyBrandFromAlt: (alt: any, site: any) => string | null;
        positionFraction: (token: any) => number;
        fitPaintedBox: (content: any, intrinsic: any, fit: any, px?: number, py?: number) => { x: number; y: number; width: number; height: number };
        isLogoSized: (w: any, h: any, minLongEdge?: number) => boolean;
      };

    // Canvas for background color detection
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');

    function toHex(color) {
      if (!color || color === 'transparent') return null;
      try {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (m) {
          if (m[4] !== undefined && parseFloat(m[4]) < 0.1) return null;
          return `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`;
        }
        if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
        if (!ctx) return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a < 25) return null;
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
      } catch { return null; }
    }

    function findBgColor(el) {
      let node = el;
      while (node && node.tagName !== 'HTML') {
        try {
          const bg = toHex(getComputedStyle(node).backgroundColor);
          if (bg) return bg;
        } catch {}
        node = node.parentElement;
      }
      return null;
    }

    function isLight(hex) {
      if (!hex) return true;
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5;
    }

    function detectLogoType(el, altText) {
      const text = (altText || '').toLowerCase().trim();
      const hasText = text.length > 0 && !/^logo$|^brand$|^icon$/i.test(text);
      const rect = el.getBoundingClientRect();
      const ratio = rect.width / (rect.height || 1);

      // Wide element with text in alt = wordmark
      if (hasText && ratio > 3) return 'wordmark';
      // Squarish = logomark/icon
      if (ratio < 1.5 && ratio > 0.5) return 'logomark';
      // Wide with no meaningful alt = likely combination or wordmark
      if (ratio > 2) return 'wordmark';
      return 'combination';
    }

    function scoreLogo(el, context) {
      let score = 0;
      const rect = el.getBoundingClientRect();
      const parentLink = el.closest('a');
      const linkHref = parentLink?.getAttribute('href') || '';
      const imgSrc = el.tagName === 'IMG' ? (el.getAttribute('src') || '') : '';
      const altText = (el.getAttribute('alt') || '').toLowerCase();
      const className = (typeof el.className === 'string' ? el.className : el.className.baseVal || '').toLowerCase();

      if (context === 'header') score += 50;
      if (context === 'footer') score += 20;
      if (context === 'hero') score += 15;

      // Compare against the asset's file name, never the whole URL: every image on
      // adept.com is served from adept.com, so `Sanofi-Logo.png` scored as adept's own
      // brand and customer-wall logos outranked the real mark.
      const imgFile = imgSrc.toLowerCase().split(/[?#]/)[0].split('/').pop() || '';
      if (imgFile.includes(siteDomain) || altText.includes(siteDomain) || className.includes(siteDomain)) score += 40;
      if (className.includes('logo') || el.id?.toLowerCase().includes('logo')) score += 30;

      // SVG with aria-label="Homepage" directly in a home anchor — strong signal
      if (el.tagName === 'svg' || el.tagName === 'SVG') {
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        if (ariaLabel.includes('home') || ariaLabel.includes('logo')) score += 40;
      }

      if (parentLink) {
        const href = linkHref.toLowerCase();
        if (href === '/' || href === baseUrl || href.endsWith('://' + new URL(baseUrl).hostname + '/') || href.endsWith('://' + new URL(baseUrl).hostname)) {
          score += 30;
        }
      }

      if (rect.top < 200) score += 10;
      if (rect.left < 400) score += 10;
      if (rect.top > 500) score -= 50;   // anything below fold is not a primary logo

      // Penalize images hosted on a different domain (CDN paths on same domain are fine)
      if (el.tagName === 'IMG') {
        try {
          const srcHost = new URL(el.src).hostname.replace('www.', '')
          const pageHost = new URL(baseUrl).hostname.replace('www.', '')
          const apexOf = h => h.split('.').slice(-2).join('.')
          // Allow same apex domain (e.g. digitalhub.fifa.com and fifa.com share apex "fifa.com")
          if (!srcHost.endsWith(pageHost) && !pageHost.endsWith(srcHost) && apexOf(srcHost) !== apexOf(pageHost)) score -= 60
        } catch {}
      }

      // For SVGs use rendered rect — baseVal reflects viewBox coordinates, not display size
      const width = el.tagName === 'IMG' ? (el.naturalWidth || rect.width) : rect.width;
      const height = el.tagName === 'IMG' ? (el.naturalHeight || rect.height) : rect.height;
      if (width < 20 || height < 20) score -= 30;
      if (width > 800 || height > 500) score -= 80;   // large editorial/hero images are never logos
      else if (width > 600 || height > 400) score -= 40;
      if (altText.length > 50) score -= 40;           // long alt text = content image, not logo
      if (width > height && width < 400 && width > 40 && height > 10 && height < 120) score += 15;

      return score;
    }

    // The box a logo actually occupies on screen. `width`/`height` below report the
    // asset's intrinsic size (naturalWidth, or the svg's width attribute) — useful, but
    // not where the mark is painted. Every layer can resize a logo independently:
    //
    //   intrinsic   naturalWidth/Height, or the svg viewBox
    //   attributes  <img width height>
    //   CSS         width/height/max-*/aspect-ratio, padding, border, box-sizing
    //   CSS         object-fit + object-position (an img can letterbox inside its box)
    //   CSS         transform: scale/rotate (getBoundingClientRect already includes it)
    //   SVG         preserveAspectRatio (letterboxes the same way object-fit: contain does)
    //   responsive  srcset/sizes and DPR pick a different asset than the one in `src`
    //   JS          anything that mutates the above at runtime
    //
    // getBoundingClientRect() settles most of it: it is the post-layout, post-transform
    // border box. What it cannot tell us is that a contained image paints only part of
    // that box. So: strip border+padding to get the content box, then fit the intrinsic
    // aspect ratio inside it the way object-fit / preserveAspectRatio would.
    function paintedRect(el) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const n = (v) => parseFloat(v) || 0;
      const x = r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft);
      const y = r.top + n(cs.borderTopWidth) + n(cs.paddingTop);
      const w = Math.max(0, r.width - n(cs.borderLeftWidth) - n(cs.borderRightWidth) - n(cs.paddingLeft) - n(cs.paddingRight));
      const h = Math.max(0, r.height - n(cs.borderTopWidth) - n(cs.borderBottomWidth) - n(cs.paddingTop) - n(cs.paddingBottom));

      let iw = 0, ih = 0, fit = 'fill';
      if (el.tagName === 'IMG') {
        iw = el.naturalWidth; ih = el.naturalHeight;
        fit = cs.objectFit || 'fill';
      } else if (el.tagName.toLowerCase() === 'svg') {
        const vb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number).filter((v) => !isNaN(v));
        if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { iw = vb[2]; ih = vb[3]; }
        const par = el.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
        fit = /\bnone\b/.test(par) ? 'fill' : (/\bslice\b/.test(par) ? 'cover' : 'contain');
      }

      // object-position (svg letterboxing centres by default, as xMidYMid does)
      const pos = (el.tagName === 'IMG' ? cs.objectPosition : '50% 50%').split(/\s+/);
      const fitted = H.fitPaintedBox(
        { x, y, width: w, height: h },
        iw > 0 && ih > 0 ? { width: iw, height: ih } : null,
        fit,
        H.positionFraction(pos[0]),
        H.positionFraction(pos[1] || pos[0]),
      );
      return {
        x: Math.round(fitted.x + window.scrollX), y: Math.round(fitted.y + window.scrollY),
        width: Math.round(fitted.width), height: Math.round(fitted.height),
      };
    }

    function extractLogoFromEl(el, context, baseUrl) {
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      const parent = el.parentElement;
      const parentComputed = parent ? getComputedStyle(parent) : null;
      const parentLink = el.closest('a');
      const bg = findBgColor(el);
      const altText = el.getAttribute('alt') || '';

      const safeZone = {
        top: parseFloat(computed.marginTop) + (parentComputed ? parseFloat(parentComputed.paddingTop) : 0),
        right: parseFloat(computed.marginRight) + (parentComputed ? parseFloat(parentComputed.paddingRight) : 0),
        bottom: parseFloat(computed.marginBottom) + (parentComputed ? parseFloat(parentComputed.paddingBottom) : 0),
        left: parseFloat(computed.marginLeft) + (parentComputed ? parseFloat(parentComputed.paddingLeft) : 0),
      };

      const logoType = detectLogoType(el, altText);
      const reversed = bg ? !isLight(bg) : false;

      if (el.tagName === 'IMG') {
        // Handle picture element -- prefer highest-res source
        const picture = el.closest('picture');
        // Prefer currentSrc (browser-resolved after srcset/lazy), fallback to src attr, then parse srcset manually
        let src = el.currentSrc || el.src;
        const srcAttr = el.getAttribute('src') || '';
        const srcsetAttr = el.getAttribute('srcset') || '';

        // If src looks broken (just params, or resolves to baseUrl), parse srcset manually
        if (!src || src === baseUrl || src === window.location.href || srcAttr.startsWith('width:') || srcAttr.startsWith('height:')) {
          if (srcsetAttr) {
            const entries = srcsetAttr.split(',').map(s => {
              const parts = s.trim().split(/\s+/);
              return { url: parts[0], w: parseFloat(parts[1]) || 0 };
            }).filter(e => e.url && !e.url.startsWith('width:'));
            entries.sort((a, b) => b.w - a.w);
            if (entries[0]) src = new URL(entries[0].url, baseUrl).href;
          }
        }

        if (picture) {
          const sources = picture.querySelectorAll('source');
          for (const source of sources) {
            const srcset = source.getAttribute('srcset');
            if (srcset) {
              const best = srcset.split(',').map(s => s.trim().split(/\s+/)).sort((a, b) => {
                const wa = parseFloat(a[1]) || 0;
                const wb = parseFloat(b[1]) || 0;
                return wb - wa;
              })[0];
              if (best?.[0]) { src = new URL(best[0], baseUrl).href; break; }
            }
          }
        }

        return {
          source: 'img',
          context,
          url: new URL(src, baseUrl).href,
          width: el.naturalWidth || rect.width,     // intrinsic (asset) size
          height: el.naturalHeight || rect.height,
          rect: paintedRect(el),                     // where the mark is actually painted
          natural: { width: el.naturalWidth || null, height: el.naturalHeight || null },
          alt: altText,
          type: logoType,
          reversed,
          background: bg,
          safeZone,
          position: { top: rect.top, left: rect.left },
        };
      } else if (el.tagName === 'SVG' || el.tagName === 'svg') {
        // Inline SVG: the logo lives in the DOM, not at a URL. Capture the
        // resolved color (currentColor → the element's `color`), serialize the
        // markup, and emit a self-contained data URI so the logo is usable.
        const color = toHex(computed.color);
        const ariaLabel = el.getAttribute('aria-label') || null;

        let markup = null;
        let dataUri = null;
        try {
          const clone = el.cloneNode(true);
          // Bake the resolved color in so `currentColor` fills render standalone.
          if (color) clone.style.color = color;
          if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          const serialized = clone.outerHTML;
          // Skip pathological inline SVGs (sprite sheets, embedded rasters).
          if (serialized && serialized.length <= 50000) {
            markup = serialized;
            dataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(serialized);
          }
        } catch {}

        // Collect fill/stroke attribute colors from all child elements
        const svgColors: string[] = [];
        el.querySelectorAll('*').forEach(child => {
          (['fill', 'stroke'] as const).forEach(attr => {
            const val = child.getAttribute(attr);
            if (val && val !== 'none' && val !== 'currentColor' && val !== 'inherit') {
              const hex = toHex(val);
              if (hex && /^#[0-9a-f]{6}$/i.test(hex)) svgColors.push(hex);
            }
          });
        });
        // Deduplicate
        const uniqueSvgColors = [...new Set(svgColors)];

        return {
          source: 'svg',
          context,
          inline: true,
          // Link target the logo points at; the logo itself is `markup`/`dataUri`.
          url: parentLink ? parentLink.href : baseUrl,
          color,
          ariaLabel,
          markup,
          dataUri,
          svgColors: uniqueSvgColors,
          width: el.width?.baseVal?.value || rect.width,   // the svg's width attribute
          height: el.height?.baseVal?.value || rect.height,
          rect: paintedRect(el),                            // where the mark is actually painted
          natural: (() => { const vb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number); return vb.length === 4 ? { width: vb[2], height: vb[3] } : { width: null, height: null }; })(),
          type: logoType,
          reversed,
          background: bg,
          safeZone,
          position: { top: rect.top, left: rect.left },
        };
      }
      return null;
    }

    function findLogosInZone(container, context) {
      if (!container) return [];
      const candidates = [];

      // img and svg
      container.querySelectorAll('img, svg').forEach(el => {
        try {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const className = (typeof el.className === 'string' ? el.className : el.className.baseVal || '').toLowerCase();
          const altText = (el.getAttribute('alt') || '').toLowerCase();
          const attrs = (className + ' ' + (el.id || '') + ' ' + altText).toLowerCase();

          // Disqualify third-party brand logos: alt naming a brand that isn't our site
          // These appear in customer/integration/testimonial sections on marketing pages.
          // A mark that links home is ours whatever its alt says; otherwise, if its alt
          // names a different brand, it is a customer/integration logo — skip it.
          const homeLinked = H.isHomeHref(el.closest('a')?.getAttribute('href'), location.origin);
          if (!homeLinked) {
            const srcFile = (el.currentSrc || el.getAttribute('src') || '').split(/[?#]/)[0].split('/').pop() || '';
            // alt OR the asset file name may name a different brand (customer/partner wall)
            if (H.thirdPartyBrandFromAlt(altText, siteDomain) || H.thirdPartyBrandFromAlt(srcFile, siteDomain)) {
              return; // a third party's brand, in its alt text or its file name
            }
          }

          let qualifies = attrs.includes('logo') || attrs.includes('brand');

          if (!qualifies && el.tagName === 'svg') {
            const useEls = el.querySelectorAll('use');
            for (const use of useEls) {
              const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
              if (href.toLowerCase().includes('logo') || href.toLowerCase().includes('brand')) { qualifies = true; break; }
            }
            // aria-label="Homepage" or similar on the SVG itself
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            if (ariaLabel.includes('home') || ariaLabel.includes('logo')) qualifies = true;
          }

          if (!qualifies) {
            const parentLink = el.closest('a');
            if (parentLink) {
              const href = (parentLink.getAttribute('href') || '').toLowerCase();
              const ariaLabel = (parentLink.getAttribute('aria-label') || '').toLowerCase();
              if (href === '/' || href.match(/^https?:\/\/[^/]+\/?$/) || ariaLabel.includes('home')) qualifies = true;
            }
          }

          if (qualifies) {
            const score = scoreLogo(el, context);
            candidates.push({ el, score, context });
          }
        } catch {}
      });

      // CSS background-image logos
      container.querySelectorAll('a, [class*="logo"], [id*="logo"], header > *, nav > *').forEach(el => {
        try {
          const s = getComputedStyle(el);
          const bg = s.backgroundImage;
          if (!bg || bg === 'none') return;
          const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (!urlMatch) return;
          const imgUrl = urlMatch[1];
          if (!/\.(svg|png|webp|gif)(\?|$)/i.test(imgUrl) && !imgUrl.includes('logo') && !imgUrl.includes('brand')) return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          candidates.push({
            el: null,
            score: scoreLogo(el, context) + 10,
            context,
            cssBackground: {
              source: 'css-background',
              context,
              url: new URL(imgUrl, window.location.href).href,
              width: rect.width,
              height: rect.height,
              type: rect.width / rect.height > 2 ? 'wordmark' : 'logomark',
              reversed: !isLight(toHex(s.backgroundColor)),
              background: toHex(s.backgroundColor),
              safeZone: { top: parseFloat(s.paddingTop), right: parseFloat(s.paddingRight), bottom: parseFloat(s.paddingBottom), left: parseFloat(s.paddingLeft) },
              position: { top: rect.top, left: rect.left },
            }
          });
        } catch {}
      });

      return candidates;
    }

    // SPA/PWA apps often render into a root div — treat it as transparent wrapper
    const spaRoot = document.querySelector('#app, #root, #__next, #__nuxt, [data-reactroot]') as any;

    // A comma-separated querySelector returns the first match in DOCUMENT order, not the
    // first matching selector. Cookie dialogs and modals ship markup like
    // `div.osano-cm-info__info-dialog-header` and `div.modal-col-header` near the top of
    // the body, so `[class*="header"]` won the race and the real <header> was never
    // scanned (seen on sites whose cookie/modal markup sits before the real header). Try
    // the selectors in order of authority, and only accept a rendered element.
    const visible = (el: any) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const pickZone = (selectors: string[], accept: (el: any) => boolean = () => true) => {
      for (const sel of selectors) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          if (visible(el) && accept(el)) return el as any;
        }
      }
      return null;
    };

    const headerEl = pickZone(
      ['header', '[role="banner"]', '[class*="header"]', '[id*="header"]'],
      // a header sits at the top and spans the page; a modal's header does neither
      (el) => { const r = el.getBoundingClientRect(); return r.top < 300 && r.width > window.innerWidth * 0.3; },
    ) || pickZone(['header', '[role="banner"]']) || (() => {
      // Fallback: find first visually top element in SPA root or body that spans full width
      const root = spaRoot || document.body;
      const children = Array.from((root as any).children) as any[];
      for (const child of children) {
        const rect = child.getBoundingClientRect();
        const s = getComputedStyle(child);
        if (rect.top < 100 && rect.width > window.innerWidth * 0.5 && s.display !== 'none') {
          return child;
        }
      }
      return null;
    })();
    const navEl = pickZone(['nav', '[role="navigation"]']) as any;
    const footerEl = pickZone(['footer', '[role="contentinfo"]', '[class*="footer"]', '[id*="footer"]']) as any;

    // Hero: first large section that's not header/footer
    const heroEl = (() => {
      const sections = document.querySelectorAll('main > *:first-child, [class*="hero"], [class*="Hero"], [class*="banner"]:not([role="banner"])');
      for (const s of sections) {
        const rect = s.getBoundingClientRect();
        if (rect.height > 200) return s;
      }
      return null;
    })();

    // Sidebar: fixed/sticky left-edge containers and semantic sidebar elements
    // Logo is typically in the first 1-3 children of a sidebar
    const sidebarEl = (() => {
      // Semantic sidebar selectors
      const candidates = document.querySelectorAll(
        'aside, [role="complementary"], [class*="sidebar"], [class*="side-nav"], [class*="sidenav"], [class*="side-bar"], [id*="sidebar"]'
      );
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 100) return el;
      }
      // Fallback: fixed/sticky element pinned to left edge
      const all = document.querySelectorAll('*');
      for (const el of all) {
        try {
          const s = getComputedStyle(el);
          if ((s.position === 'fixed' || s.position === 'sticky') && s.display !== 'none') {
            const rect = el.getBoundingClientRect();
            if (rect.left < 100 && rect.height > 200 && rect.width < 400) return el;
          }
        } catch {}
      }
      return null;
    })();

    // For header: scan first 3 children and their direct children only
    function firstChildrenZone(container, context) {
      if (!container) return [];
      const candidates = [];
      const children = Array.from(container.children).slice(0, 3);
      for (const child of children) {
        // Scan the child itself + its direct children
        const els = [child, ...Array.from((child as any).children)];
        for (const el of els) {
          if ((el as any).matches('img, svg')) {
            const found = findLogosInZone((el as any).parentElement || container, context);
            candidates.push(...found.filter(c => c.el === el || c.cssBackground));
          }
        }
        // Also run full zone scan on the first child subtree (logo is often nested 1-2 levels)
        candidates.push(...findLogosInZone(child, context));
      }
      return candidates;
    }

    // For sidebar: scan first 3 children and their direct children
    function sidebarZone(container) {
      if (!container) return [];
      const children = Array.from(container.children).slice(0, 3);
      const candidates = [];
      for (const child of children) {
        candidates.push(...findLogosInZone(child, 'header'));
      }
      return candidates;
    }

    // Global pre-scan: strong semantic signals that identify a logo anywhere in the document
    const globalLogoCandidates = (() => {
      const results = [];
      // Tag-AGNOSTIC: an inline <svg> logo wrapped in a home link is as much the site's
      // mark as an <img> is, but the old img-only selectors could not see it — that alone
      // accounted for a large share of the missed home-linked inline-SVG logos.
      // Gather both img and svg from three unambiguous sources: a logo-named container, a
      // logo-named ancestor, and a link to the home page.
      const isHomeHref = (h) => { h = (h || '').toLowerCase(); return h === '/' || h === './'
        || h === location.origin || h === location.origin + '/'; };
      const marks = new Set();
      document.querySelectorAll('[class*="logo" i] img, [class*="logo" i] svg, [id*="logo" i] img, [id*="logo" i] svg')
        .forEach(el => marks.add(el));
      document.querySelectorAll('a[href], [role="link"]').forEach(a => {
        if (!isHomeHref(a.getAttribute('href'))) return;
        a.querySelectorAll('img, svg').forEach(el => marks.add(el));
      });
      const seen = new Set();
      for (const el of marks as Set<any>) {
        try {
          if (seen.has(el)) continue;
          seen.add(el);
          {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            // Below-fold logos are real — 15 of the 22 marks humans found and this extractor
            // missed sit under the fold. But letting every semantically-named mark through
            // tripled the proposal count with customer-wall logos, so only the ones that
            // link to the home page qualify down there: that link is the site claiming the
            // mark as its own.
            if (rect.width > 1500 || rect.height > 500) continue; // an illustration, not a mark
            if (!H.isLogoSized(rect.width, rect.height)) continue; // a UI icon, not a logo
            const homeLinked = H.isHomeHref(el.closest('a')?.getAttribute('href'), location.origin);
            // A customer/partner wall matches [class*=logo] too. If a non-home-linked mark
            // names a different brand in its alt or file name, it is not ours — skip it.
            // (A partner strip of "logo-<Brand>.svg" images slipped in here: the pre-scan
            // never ran the third-party guard that findLogosInZone applies.)
            if (!homeLinked) {
              const altText = (el.getAttribute('alt') || '');
              const srcFile = (el.currentSrc || el.getAttribute('src') || '').split(/[?#]/)[0].split('/').pop() || '';
              if (H.thirdPartyBrandFromAlt(altText, siteDomain) || H.thirdPartyBrandFromAlt(srcFile, siteDomain)) continue;
            }
            const belowFold = rect.top > 500;
            if (belowFold && !homeLinked) continue; // below the fold, only our own home-linked mark
            const context = !belowFold ? 'header'
              : (rect.top > document.documentElement.scrollHeight - 1200 ? 'footer' : 'body');
            const score = scoreLogo(el, context) + 20; // bonus for semantic match
            results.push({ el, score, context });
          }
        } catch {}
      }
      return results;
    })();

    // Deduplicate zones — nav might be inside header, avoid double-scanning
    const headerCandidates = firstChildrenZone(headerEl, 'header');
    const navCandidates = (navEl && !(headerEl as any)?.contains(navEl))
      ? firstChildrenZone(navEl, 'header')
      : [];
    const sidebarCandidates = (sidebarEl && !(headerEl as any)?.contains(sidebarEl))
      ? sidebarZone(sidebarEl)
      : [];

    const allCandidates = [
      ...globalLogoCandidates,
      ...headerCandidates,
      ...navCandidates,
      ...sidebarCandidates,
      ...findLogosInZone(footerEl, 'footer'),
      ...findLogosInZone(heroEl, 'hero'),
    ];

    allCandidates.sort((a, b) => b.score - a.score);

    // Primary logo = highest scoring
    const primary = allCandidates[0];
    let primaryLogo = null;
    if (primary) {
      if (primary.cssBackground) {
        primaryLogo = primary.cssBackground;
      } else if (primary.el) {
        primaryLogo = extractLogoFromEl(primary.el, primary.context, baseUrl);
      }
    }

    // Collect every distinct mark, best-scoring first. Deduplicating by CONTEXT capped the
    // output at one logo per header/footer/hero, so a lockup rendered as symbol + wordmark
    // (two elements) lost half of itself, and a page with logos in both the header and the
    // body could only ever report one. Deduplicate by element instead.
    const MAX_INSTANCES = 6;
    const instances = [];
    const seenEls = new Set();
    for (const c of allCandidates) {
      if (instances.length >= MAX_INSTANCES) break;
      const key = c.cssBackground
        ? `bg:${c.cssBackground.url}@${Math.round(c.cssBackground.position.top)}`
        : c.el;
      if (!key || seenEls.has(key)) continue;
      seenEls.add(key);
      let inst = null;
      if (c.cssBackground) inst = c.cssBackground;
      else if (c.el) inst = extractLogoFromEl(c.el, c.context, baseUrl);
      // Reject UI icons (search/menu/social glyphs) that scored into the candidate list —
      // measured floor: no real logo is below 24px on its long edge. Judge by the painted
      // rect (the on-screen size), not the intrinsic asset size.
      if (inst) {
        const box = (inst as any).rect || { width: (inst as any).width, height: (inst as any).height };
        if (H.isLogoSized(box.width, box.height)) instances.push(inst);
      }
    }

    // Favicons
    const favicons = [];
    document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        try {
          favicons.push({
            type: link.getAttribute('rel'),
            url: new URL(href, baseUrl).href,
            sizes: link.getAttribute('sizes') || null,
          });
        } catch {}
      }
    });

    const ogImage = document.querySelector('meta[property="og:image"]') as any;
    if (ogImage?.getAttribute('content')) {
      try { favicons.push({ type: 'og:image', url: new URL(ogImage.getAttribute('content'), baseUrl).href, sizes: null }); } catch {}
    }

    const twitterImage = document.querySelector('meta[name="twitter:image"]') as any;
    if (twitterImage?.getAttribute('content')) {
      try { favicons.push({ type: 'twitter:image', url: new URL(twitterImage.getAttribute('content'), baseUrl).href, sizes: null }); } catch {}
    }

    // Only synthesize the /favicon.ico fallback when the page declares no icon at
    // all. Sites that ship their icon under another name (e.g. favicon-purple.ico)
    // often 404 on the bare /favicon.ico, which would surface as a broken entry.
    if (!favicons.some(f => /icon/i.test(f.type || ''))) {
      favicons.push({ type: 'favicon.ico', url: new URL('/favicon.ico', baseUrl).href, sizes: null });
    }

    return { logo: primaryLogo, instances, favicons };
  }, { baseUrl: url, heuristicsSource: LOGO_HEURISTICS_SOURCE });

  // Merge PWA icons into favicons
  result.favicons = [...result.favicons, ...pwaIcons];
  result.manifest = Object.keys(manifestMeta).length > 0 ? manifestMeta : null;

  // Collect logo colors: inline SVG fill/stroke (already extracted above) + fetched img SVG
  const inlineSvgColors: string[] = [
    ...(result.logo?.svgColors ?? []),
    ...result.instances.flatMap(i => i?.svgColors ?? []),
  ];

  // For <img src="*.svg"> logos, fetch the SVG and parse fill/stroke attributes
  const svgImgColors: string[] = [];
  const svgSrcUrls = new Set<string>();
  for (const inst of [result.logo, ...result.instances]) {
    if (inst && inst.source === 'img' && inst.url && /\.svg(\?|$)/i.test(inst.url)) {
      svgSrcUrls.add(inst.url);
    }
  }
  if (svgSrcUrls.size > 0) {
    try {
      const fetched = await page.evaluate(async (urls: string[]) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');

        function toHex(val: string): string | null {
          if (!val) return null;
          if (/^#[0-9a-f]{6}$/i.test(val)) return val.toLowerCase();
          if (/^#[0-9a-f]{3}$/i.test(val)) return `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`.toLowerCase();
          if (/^#[0-9a-f]{8}$/i.test(val)) return val.toLowerCase().slice(0, 7);
          const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (m) return `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`;
          if (ctx) {
            try {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = 'rgba(0,0,0,0)';
              ctx.fillStyle = val;
              ctx.fillRect(0, 0, 1, 1);
              const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
              if (a > 0) return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
            } catch {}
          }
          return null;
        }

        const colors: string[] = [];
        for (const u of urls) {
          try {
            const resp = await fetch(u, { credentials: 'omit' });
            if (!resp.ok) continue;
            const text = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'image/svg+xml');
            doc.querySelectorAll('*').forEach(el => {
              (['fill', 'stroke'] as const).forEach(attr => {
                const val = el.getAttribute(attr);
                if (val && val !== 'none' && val !== 'currentColor' && val !== 'inherit') {
                  const hex = toHex(val);
                  if (hex) colors.push(hex);
                }
              });
            });
          } catch {}
        }
        return [...new Set(colors)].filter(c => /^#[0-9a-f]{6}$/i.test(c));
      }, [...svgSrcUrls]);
      svgImgColors.push(...fetched);
    } catch {}
  }

  const allLogoColors = [...new Set([...inlineSvgColors, ...svgImgColors])].filter(c => /^#[0-9a-f]{6}$/i.test(c));
  result.logoColors = allLogoColors;

  return result;
}
