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

  const result = await page.evaluate((baseUrl) => {
    const siteDomain = new URL(baseUrl).hostname.replace('www.', '').split('.')[0].toLowerCase();

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

      if (imgSrc.toLowerCase().includes(siteDomain) || altText.includes(siteDomain) || className.includes(siteDomain)) score += 40;
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
          width: el.naturalWidth || rect.width,
          height: el.naturalHeight || rect.height,
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
          width: el.width?.baseVal?.value || rect.width,
          height: el.height?.baseVal?.value || rect.height,
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

          // Disqualify third-party brand logos: alt like "Notion logo" / "Perplexity logo" / "Figma" where the brand isn't our site
          // These appear in customer/integration/testimonial sections on marketing pages.
          const altBrandMatch = altText.match(/^([a-z][a-z0-9.-]{1,30}?)(?:\s+(?:logo|icon|brand|wordmark))?$/i);
          if (altBrandMatch) {
            const altBrand = altBrandMatch[1].replace(/[\s.-]/g, '').toLowerCase();
            if (altBrand && altBrand !== 'logo' && altBrand !== 'brand' && altBrand !== 'icon' && altBrand !== siteDomain && !altBrand.includes(siteDomain) && !siteDomain.includes(altBrand)) {
              return; // third-party brand, skip entirely
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

    const headerEl = document.querySelector(
      'header, [role="banner"], [class*="header"], [id*="header"]'
    ) || (() => {
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
    const navEl = document.querySelector('nav, [role="navigation"]') as any;
    const footerEl = document.querySelector('footer, [role="contentinfo"], [class*="footer"], [id*="footer"]') as any;

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
      const selectors = [
        'img[class*="logo"]',
        'img[id*="logo"]',
        'a[class*="logo"] img',
        'a[id*="logo"] img',
        '[class*="logo-link"] img',
        '[class*="logo-wrap"] img',
        '[class*="logo-container"] img',
        'a[href="/"] img',
        'a[href="./"] img',
      ];
      const seen = new Set();
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (seen.has(el)) return;
            seen.add(el);
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            if (rect.top > 500) return; // must be near top
            if (rect.width > 600 || rect.height > 200) return; // too large
            const score = scoreLogo(el, 'header') + 20; // bonus for semantic match
            results.push({ el, score, context: 'header' });
          });
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

    // Collect all unique instances (header, footer, hero)
    const instances = [];
    const seenContexts = new Set();
    for (const c of allCandidates) {
      if (seenContexts.has(c.context)) continue;
      seenContexts.add(c.context);
      let inst = null;
      if (c.cssBackground) inst = c.cssBackground;
      else if (c.el) inst = extractLogoFromEl(c.el, c.context, baseUrl);
      if (inst) instances.push(inst);
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
  }, url);

  // Merge PWA icons into favicons
  result.favicons = [...result.favicons, ...pwaIcons];
  result.manifest = Object.keys(manifestMeta).length > 0 ? manifestMeta : null;

  return result;
}
