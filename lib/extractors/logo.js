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
  return await page.evaluate((baseUrl) => {
    const candidates = Array.from(document.querySelectorAll("img, svg")).filter(
      (el) => {
        const className =
          typeof el.className === "string"
            ? el.className
            : el.className.baseVal || "";
        const attrs = (
          className +
          " " +
          (el.id || "") +
          " " +
          (el.getAttribute("alt") || "")
        ).toLowerCase();

        if (attrs.includes("logo") || attrs.includes("brand")) return true;

        if (el.tagName === "svg" || el.tagName === "SVG") {
          const useElements = el.querySelectorAll("use");
          for (const use of useElements) {
            const href =
              use.getAttribute("href") || use.getAttribute("xlink:href") || "";
            if (
              href.toLowerCase().includes("logo") ||
              href.toLowerCase().includes("brand")
            ) {
              return true;
            }
          }
        }

        const inHeader = el.closest('header, nav, [role="banner"], [class*="header"], [class*="Header"], [id*="header"]');
        if (inHeader) {
          const parentLink = el.closest('a');
          if (parentLink) {
            const href = parentLink.getAttribute('href') || '';
            const ariaLabel = (parentLink.getAttribute('aria-label') || '').toLowerCase();
            if (href === '/' || href === baseUrl || href === baseUrl + '/' ||
                href.match(/^https?:\/\/[^/]+\/?$/) ||
                href.match(/^https?:\/\/[^/]+\/[a-z]{2}(-[a-z]{2})?\/?$/) ||
                ariaLabel.includes('homepage') || ariaLabel.includes('home page')) {
              return true;
            }
          }
        }

        return false;
      }
    );

    let logoData = null;
    if (candidates.length > 0) {
      const siteDomain = new URL(baseUrl).hostname.replace('www.', '').split('.')[0].toLowerCase();

      const scored = candidates.map(el => {
        let score = 0;
        const rect = el.getBoundingClientRect();
        const parentLink = el.closest('a');
        const linkHref = parentLink?.getAttribute('href') || '';
        const imgSrc = el.tagName === 'IMG' ? (el.src || '') : '';
        const altText = (el.getAttribute('alt') || '').toLowerCase();
        const className = (typeof el.className === 'string' ? el.className : el.className.baseVal || '').toLowerCase();

        const inHeader = el.closest('header, nav, [role="banner"], [class*="header"], [class*="nav"], [id*="header"], [id*="nav"]');
        if (inHeader) score += 50;

        if (imgSrc.toLowerCase().includes(siteDomain) || altText.includes(siteDomain) || className.includes(siteDomain)) {
          score += 40;
        }

        if (parentLink) {
          const href = linkHref.toLowerCase();
          if (href === '/' || href === baseUrl || href === baseUrl + '/' || href.endsWith('://' + new URL(baseUrl).hostname + '/') || href.endsWith('://' + new URL(baseUrl).hostname)) {
            score += 30;
          }
        }

        if (rect.top < 200) score += 10;
        if (rect.left < 400) score += 10;
        if (rect.top > 600) score -= 20;

        const width = el.naturalWidth || el.width?.baseVal?.value || rect.width;
        const height = el.naturalHeight || el.height?.baseVal?.value || rect.height;
        if (width < 20 || height < 20) score -= 30;
        if (width > 500 || height > 300) score -= 40;

        if (altText.length > 50) score -= 30;
        if (altText.includes(' the ') || altText.includes(' a ') || altText.includes(' of ')) score -= 20;

        if (width > height && width < 300 && width > 40 && height > 15 && height < 100) score += 15;

        if (!inHeader && !imgSrc.toLowerCase().includes(siteDomain) && !altText.includes(siteDomain)) {
          score -= 30;
        }

        return { el, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const logo = scored[0].el;
      const computed = window.getComputedStyle(logo);
      const parent = logo.parentElement;
      const parentComputed = parent ? window.getComputedStyle(parent) : null;

      const safeZone = {
        top:
          parseFloat(computed.marginTop) +
          (parentComputed ? parseFloat(parentComputed.paddingTop) : 0),
        right:
          parseFloat(computed.marginRight) +
          (parentComputed ? parseFloat(parentComputed.paddingRight) : 0),
        bottom:
          parseFloat(computed.marginBottom) +
          (parentComputed ? parseFloat(parentComputed.paddingBottom) : 0),
        left:
          parseFloat(computed.marginLeft) +
          (parentComputed ? parseFloat(parentComputed.paddingLeft) : 0),
      };

      let logoBg = null;
      let walker = logo;
      while (walker) {
        const bg = window.getComputedStyle(walker).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          logoBg = bg;
          break;
        }
        walker = walker.parentElement;
      }

      if (logo.tagName === "IMG") {
        logoData = {
          source: "img",
          url: new URL(logo.src, baseUrl).href,
          width: logo.naturalWidth || logo.width,
          height: logo.naturalHeight || logo.height,
          alt: logo.alt,
          safeZone,
          background: logoBg,
        };
      } else {
        const parentLink = logo.closest("a");
        logoData = {
          source: "svg",
          url: parentLink ? parentLink.href : window.location.href,
          width: logo.width?.baseVal?.value,
          height: logo.height?.baseVal?.value,
          safeZone,
          background: logoBg,
        };
      }
    }

    const favicons = [];

    document.querySelectorAll('link[rel*="icon"]').forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        favicons.push({
          type: link.getAttribute("rel"),
          url: new URL(href, baseUrl).href,
          sizes: link.getAttribute("sizes") || null,
        });
      }
    });

    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        favicons.push({
          type: "apple-touch-icon",
          url: new URL(href, baseUrl).href,
          sizes: link.getAttribute("sizes") || null,
        });
      }
    });

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const content = ogImage.getAttribute("content");
      if (content) {
        favicons.push({
          type: "og:image",
          url: new URL(content, baseUrl).href,
          sizes: null,
        });
      }
    }

    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) {
      const content = twitterImage.getAttribute("content");
      if (content) {
        favicons.push({
          type: "twitter:image",
          url: new URL(content, baseUrl).href,
          sizes: null,
        });
      }
    }

    const hasFaviconIco = favicons.some((f) => f.url.endsWith("/favicon.ico"));
    if (!hasFaviconIco) {
      favicons.push({
        type: "favicon.ico",
        url: new URL("/favicon.ico", baseUrl).href,
        sizes: null,
      });
    }

    return { logo: logoData, favicons };
  }, url);
}
