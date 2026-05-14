export async function extractSiteName(page) {
  return await page.evaluate(() => {
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    if (ogSiteName?.content?.trim()) return ogSiteName.content.trim();

    const appName = document.querySelector('meta[name="application-name"]');
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

    const logoImg = document.querySelector('img[class*="logo"], img[id*="logo"], a[class*="logo"] img');
    if (logoImg?.alt?.trim() && logoImg.alt.length < 40) return logoImg.alt.trim();

    return null;
  });
}

export async function extractLogo(page, url) {
  // Extract manifest.json for PWA icons
  const manifestIcons = await page.evaluate((baseUrl) => {
    try {
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (!manifestLink) return [];
      return [{ manifestUrl: new URL(manifestLink.getAttribute('href'), baseUrl).href }];
    } catch {
      return [];
    }
  }, url);

  let pwaIcons = [];
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
      const s = getComputedStyle(el);
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

      if (parentLink) {
        const href = linkHref.toLowerCase();
        if (href === '/' || href === baseUrl || href.endsWith('://' + new URL(baseUrl).hostname + '/') || href.endsWith('://' + new URL(baseUrl).hostname)) {
          score += 30;
        }
      }

      if (rect.top < 200) score += 10;
      if (rect.left < 400) score += 10;

      const width = el.naturalWidth || el.width?.baseVal?.value || rect.width;
      const height = el.naturalHeight || el.height?.baseVal?.value || rect.height;
      if (width < 20 || height < 20) score -= 30;
      if (width > 600 || height > 400) score -= 40;
      if (altText.length > 50) score -= 30;
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
        let src = el.src;
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
        return {
          source: 'svg',
          context,
          url: parentLink ? parentLink.href : baseUrl,
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
          const attrs = (className + ' ' + (el.id || '') + ' ' + (el.getAttribute('alt') || '')).toLowerCase();

          let qualifies = attrs.includes('logo') || attrs.includes('brand');

          if (!qualifies && el.tagName === 'svg') {
            const useEls = el.querySelectorAll('use');
            for (const use of useEls) {
              const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
              if (href.toLowerCase().includes('logo') || href.toLowerCase().includes('brand')) { qualifies = true; break; }
            }
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

    const headerEl = document.querySelector('header, [role="banner"], [class*="header"], [id*="header"], nav');
    const footerEl = document.querySelector('footer, [role="contentinfo"], [class*="footer"], [id*="footer"]');

    // Hero: first large section that's not header/footer
    const heroEl = (() => {
      const sections = document.querySelectorAll('main > *:first-child, [class*="hero"], [class*="Hero"], [class*="banner"]:not([role="banner"])');
      for (const s of sections) {
        const rect = s.getBoundingClientRect();
        if (rect.height > 200) return s;
      }
      return null;
    })();

    const allCandidates = [
      ...findLogosInZone(headerEl, 'header'),
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

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage?.getAttribute('content')) {
      try { favicons.push({ type: 'og:image', url: new URL(ogImage.getAttribute('content'), baseUrl).href, sizes: null }); } catch {}
    }

    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage?.getAttribute('content')) {
      try { favicons.push({ type: 'twitter:image', url: new URL(twitterImage.getAttribute('content'), baseUrl).href, sizes: null }); } catch {}
    }

    if (!favicons.some(f => f.url.endsWith('/favicon.ico'))) {
      favicons.push({ type: 'favicon.ico', url: new URL('/favicon.ico', baseUrl).href, sizes: null });
    }

    return { logo: primaryLogo, instances, favicons };
  }, url);

  // Merge PWA icons into favicons
  result.favicons = [...result.favicons, ...pwaIcons];

  return result;
}
