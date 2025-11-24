/**
 * Brand Extraction Engine
 *
 * Core extraction logic with stealth mode, retry mechanisms, and parallel processing.
 * Handles bot detection, SPA hydration, and comprehensive design token extraction.
 */

import { chromium } from "playwright";
import chalk from "chalk";

/**
 * Main extraction function - orchestrates the entire brand analysis process
 *
 * @param {string} url - Target URL to analyze
 * @param {Object} spinner - Ora spinner instance for progress updates
 * @param {Object} passedBrowser - Optional pre-configured browser instance
 * @param {Object} options - Configuration options (navigationTimeout, etc.)
 * @returns {Object} Complete brand extraction data
 */
export async function extractBranding(
  url,
  spinner,
  passedBrowser = null,
  options = {}
) {
  const ownBrowser = !passedBrowser;
  let browser = passedBrowser;

  // Apply 3x timeout multiplier when --slow flag is enabled
  const timeoutMultiplier = options.slow ? 3 : 1;

  // Track timeouts for final report
  const timeouts = [];

  if (ownBrowser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-dev-shm-usage",
      ],
    });
  }

  spinner.text = "Creating browser context with stealth mode...";
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });

  // Full stealth — kills 99% of Cloudflare bot detection
  spinner.text = "Injecting anti-detection scripts...";

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });

    // Spoof Chrome runtime
    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    // Remove Playwright traces
    delete navigator.__proto__.webdriver;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  const page = await context.newPage();

  try {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      spinner.text = `Navigating to ${url} (attempt ${attempts}/${maxAttempts})...`;
      try {
        const initialUrl = url;
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: (options.navigationTimeout || 20000) * timeoutMultiplier,
        });
        const finalUrl = page.url();

        // Check for redirects or domain changes
        if (initialUrl !== finalUrl) {
          spinner.stop();
          const initialDomain = new URL(initialUrl).hostname;
          const finalDomain = new URL(finalUrl).hostname;

          if (initialDomain !== finalDomain) {
            console.log(
              chalk.hex('#FFB86C')(`  ⚠ Page redirected to different domain:`)
            );
            console.log(chalk.dim(`    From: ${initialUrl}`));
            console.log(chalk.dim(`    To:   ${finalUrl}`));
          } else {
            console.log(chalk.hex('#8BE9FD')(`  ℹ Page redirected within same domain:`));
            console.log(chalk.dim(`    From: ${initialUrl}`));
            console.log(chalk.dim(`    To:   ${finalUrl}`));
          }
          spinner.start();
        }

        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Page loaded`));

        // Give SPAs time to hydrate (Linear, Figma, Notion, etc.)
        spinner.start("Waiting for SPA hydration...");
        const hydrationTime = 8000 * timeoutMultiplier;
        await page.waitForTimeout(hydrationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Hydration complete (${hydrationTime/1000}s)`));

        // Optional: wait for main content
        spinner.start("Waiting for main content...");
        try {
          await page.waitForSelector("main, header, [data-hero], section", {
            timeout: 10000 * timeoutMultiplier,
          });
          spinner.stop();
          console.log(chalk.hex('#50FA7B')(`  ✓ Main content detected`));
        } catch {
          spinner.stop();
          console.log(chalk.hex('#FFB86C')(`  ⚠ Main content selector timeout (continuing)`));
          timeouts.push('Main content selector');
        }

        // Simulate human behavior
        spinner.start("Simulating human interaction...");
        await page.mouse.move(
          300 + Math.random() * 400,
          200 + Math.random() * 300
        );
        await page.evaluate(() => window.scrollTo(0, 400));
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Human behavior simulated`));

        // Final hydration wait
        spinner.start("Final content stabilization...");
        const stabilizationTime = 4000 * timeoutMultiplier;
        await page.waitForTimeout(stabilizationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Page fully loaded and stable`));

        spinner.start("Validating page content...");
        const contentLength = await page.evaluate(
          () => document.body.textContent.length
        );
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Content validated: ${contentLength} chars`));

        if (contentLength > 100) break;

        spinner.warn(
          `Page seems empty (attempt ${attempts}/${maxAttempts}), retrying...`
        );
        console.log(
          chalk.hex('#FFB86C')(
            `  ⚠ Content length: ${contentLength} chars (expected >100)`
          )
        );
        await page.waitForTimeout(3000 * timeoutMultiplier);
      } catch (err) {
        if (attempts >= maxAttempts) {
          console.error(`  ↳ Failed after ${maxAttempts} attempts`);
          console.error(`  ↳ Last error: ${err.message}`);
          console.error(`  ↳ URL: ${url}`);
          throw err;
        }
        spinner.warn(
          `Navigation failed (attempt ${attempts}/${maxAttempts}), retrying...`
        );
        console.log(`  ↳ Error: ${err.message}`);
        await page.waitForTimeout(3000 * timeoutMultiplier);
      }
    }

    spinner.stop();
    console.log(chalk.hex('#8BE9FD')("\n  Extracting design tokens...\n"));

    spinner.start("Extracting logo and favicons...");
    const { logo, favicons } = await extractLogo(page, url);
    spinner.stop();
    console.log(chalk.hex('#50FA7B')(`  ✓ Logo and favicons extracted`));

    spinner.start("Analyzing design system (12 parallel tasks)...");
    const [
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      buttons,
      inputs,
      links,
      breakpoints,
      iconSystem,
      frameworks,
    ] = await Promise.all([
      extractColors(page),
      extractTypography(page),
      extractSpacing(page),
      extractBorderRadius(page),
      extractBorders(page),
      extractShadows(page),
      extractButtonStyles(page),
      extractInputStyles(page),
      extractLinkStyles(page),
      extractBreakpoints(page),
      detectIconSystem(page),
      detectFrameworks(page),
    ]);

    spinner.stop();
    console.log(colors.palette.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Colors: ${colors.palette.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Colors: 0 found`));
    console.log(typography.styles.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Typography: ${typography.styles.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Typography: 0 styles`));
    console.log(spacing.commonValues.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Spacing: ${spacing.commonValues.length} values`) : chalk.hex('#FFB86C')(`  ⚠ Spacing: 0 values`));
    console.log(borderRadius.values.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Border radius: ${borderRadius.values.length} values`) : chalk.hex('#FFB86C')(`  ⚠ Border radius: 0 values`));

    const bordersTotal = (borders?.widths?.length || 0) + (borders?.styles?.length || 0) + (borders?.colors?.length || 0);
    console.log(bordersTotal > 0 ?
      chalk.hex('#50FA7B')(`  ✓ Borders: ${borders?.widths?.length || 0} widths, ${borders?.styles?.length || 0} styles, ${borders?.colors?.length || 0} colors`) :
      chalk.hex('#FFB86C')(`  ⚠ Borders: 0 found`));

    console.log(shadows.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Shadows: ${shadows.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Shadows: 0 found`));
    console.log(buttons.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Buttons: ${buttons.length} variants`) : chalk.hex('#FFB86C')(`  ⚠ Buttons: 0 variants`));
    console.log(inputs.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Inputs: ${inputs.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Inputs: 0 styles`));
    console.log(links.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Links: ${links.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Links: 0 styles`));
    console.log(breakpoints.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Breakpoints: ${breakpoints.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Breakpoints: 0 detected`));
    console.log(iconSystem.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Icon systems: ${iconSystem.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Icon systems: 0 detected`));
    console.log(frameworks.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Frameworks: ${frameworks.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Frameworks: 0 detected`));
    console.log();

    // Extract hover/focus state colors using actual interaction simulation
    spinner.start("Extracting hover/focus state colors...");
    const hoverFocusColors = [];

    // Helper: Split multi-value color strings (e.g., "rgb(0,0,0) rgb(255,255,255) rgb(28,105,212)")
    function splitMultiValueColors(colorValue) {
      if (!colorValue) return [];

      // Match all rgb/rgba/hsl/hsla/hex values in the string
      const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
      const matches = colorValue.match(colorRegex) || [colorValue];

      // Filter out invalid matches
      return matches.filter(c =>
        c !== 'transparent' &&
        c !== 'rgba(0, 0, 0, 0)' &&
        c !== 'rgba(0,0,0,0)' &&
        c.length > 3
      );
    }

    // Get all interactive elements
    const interactiveElements = await page.$$(`
      a,
      button,
      input,
      textarea,
      select,
      [role="button"],
      [role="link"],
      [role="tab"],
      [role="menuitem"],
      [role="switch"],
      [role="checkbox"],
      [role="radio"],
      [role="textbox"],
      [role="searchbox"],
      [role="combobox"],
      [aria-pressed],
      [aria-expanded],
      [aria-current],
      [tabindex]:not([tabindex="-1"])
    `);

    // Sample up to 20 elements for performance
    const sampled = interactiveElements.slice(0, 20);

    for (const element of sampled) {
      try {
        // Check if element is visible
        const isVisible = await element.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 &&
                 rect.height > 0 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        });

        if (!isVisible) continue;

        // Get initial state colors
        const beforeState = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor,
            tag: el.tagName.toLowerCase()
          };
        });

        // Hover over element
        await element.hover({ timeout: 1000 * timeoutMultiplier }).catch(() => {});
        await page.waitForTimeout(100 * timeoutMultiplier); // Wait for transitions

        // Get hover state colors
        const afterHover = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor
          };
        });

        // Compare and collect changed colors
        if (afterHover.color !== beforeState.color &&
            afterHover.color !== 'rgba(0, 0, 0, 0)' &&
            afterHover.color !== 'transparent') {
          hoverFocusColors.push({
            color: afterHover.color,
            property: 'color',
            state: 'hover',
            element: beforeState.tag
          });
        }

        if (afterHover.backgroundColor !== beforeState.backgroundColor &&
            afterHover.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            afterHover.backgroundColor !== 'transparent') {
          hoverFocusColors.push({
            color: afterHover.backgroundColor,
            property: 'background-color',
            state: 'hover',
            element: beforeState.tag
          });
        }

        if (afterHover.borderColor !== beforeState.borderColor) {
          // Split multi-value border colors
          const hoverBorderColors = splitMultiValueColors(afterHover.borderColor);
          const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);

          hoverBorderColors.forEach(color => {
            if (!beforeBorderColors.includes(color)) {
              hoverFocusColors.push({
                color: color,
                property: 'border-color',
                state: 'hover',
                element: beforeState.tag
              });
            }
          });
        }

        // Try focus for inputs/buttons
        if (['input', 'textarea', 'select', 'button'].includes(beforeState.tag)) {
          try {
            await element.focus({ timeout: 500 * timeoutMultiplier });
            await page.waitForTimeout(100 * timeoutMultiplier);

            const afterFocus = await element.evaluate(el => {
              const computed = getComputedStyle(el);
              return {
                color: computed.color,
                backgroundColor: computed.backgroundColor,
                borderColor: computed.borderColor,
                outlineColor: computed.outlineColor
              };
            });

            // Check for focus-specific changes
            if (afterFocus.outlineColor &&
                afterFocus.outlineColor !== 'rgba(0, 0, 0, 0)' &&
                afterFocus.outlineColor !== 'transparent' &&
                afterFocus.outlineColor !== beforeState.color) {
              hoverFocusColors.push({
                color: afterFocus.outlineColor,
                property: 'outline-color',
                state: 'focus',
                element: beforeState.tag
              });
            }

            if (afterFocus.borderColor !== beforeState.borderColor &&
                afterFocus.borderColor !== afterHover.borderColor) {
              // Split multi-value border colors
              const focusBorderColors = splitMultiValueColors(afterFocus.borderColor);
              const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);

              focusBorderColors.forEach(color => {
                if (!beforeBorderColors.includes(color)) {
                  hoverFocusColors.push({
                    color: color,
                    property: 'border-color',
                    state: 'focus',
                    element: beforeState.tag
                  });
                }
              });
            }
          } catch (e) {
            // Focus might fail, continue
          }
        }

      } catch (e) {
        // Element might be stale or not interactable, continue
      }
    }

    // Move mouse away to reset hover states
    await page.mouse.move(0, 0).catch(() => {});

    // Merge hover/focus colors into palette
    hoverFocusColors.forEach(({ color }) => {
      const isDuplicate = colors.palette.some((c) => c.color === color);
      if (!isDuplicate && color) {
        // Normalize and add to palette
        const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        let normalized = color.toLowerCase();
        if (rgbaMatch) {
          const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
          const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
          const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
          normalized = `#${r}${g}${b}`;
        }

        colors.palette.push({
          color,
          normalized,
          count: 1,
          confidence: "medium",
          sources: ["hover/focus"],
        });
      }
    });

    spinner.stop();
    console.log(hoverFocusColors.length > 0 ?
      chalk.hex('#50FA7B')(`  ✓ Hover/focus: ${hoverFocusColors.length} state colors found`) :
      chalk.hex('#FFB86C')(`  ⚠ Hover/focus: 0 state colors found`));

    // Extract additional colors from dark mode if requested
    if (options.darkMode) {
      spinner.start("Extracting dark mode colors...");

      // Try multiple methods to enable dark mode
      await page.evaluate(() => {
        // Method 1: Add data-theme attribute
        document.documentElement.setAttribute("data-theme", "dark");
        document.documentElement.setAttribute("data-mode", "dark");
        document.body.setAttribute("data-theme", "dark");

        // Method 2: Add dark mode classes
        document.documentElement.classList.add(
          "dark",
          "dark-mode",
          "theme-dark"
        );
        document.body.classList.add("dark", "dark-mode", "theme-dark");

        // Method 3: Trigger prefers-color-scheme media query
        // (Playwright can emulate this, but let's also try programmatically)
      });

      // Emulate prefers-color-scheme: dark
      await page.emulateMedia({ colorScheme: "dark" });

      // Wait for transitions to complete
      await page.waitForTimeout(500 * timeoutMultiplier);

      const darkModeColors = await extractColors(page);
      const darkModeButtons = await extractButtonStyles(page);
      const darkModeLinks = await extractLinkStyles(page);

      // Merge dark mode colors into main palette
      const mergedPalette = [...colors.palette];
      darkModeColors.palette.forEach((darkColor) => {
        // Check if this color is already in the palette using perceptual similarity
        const isDuplicate = mergedPalette.some((existingColor) => {
          // Simple check - could use delta-E here too
          return existingColor.normalized === darkColor.normalized;
        });

        if (!isDuplicate) {
          mergedPalette.push({ ...darkColor, source: "dark-mode" });
        }
      });

      colors.palette = mergedPalette;

      // Merge semantic colors
      Object.assign(colors.semantic, darkModeColors.semantic);

      // Merge dark mode buttons and links
      buttons.push(
        ...darkModeButtons.map((btn) => ({ ...btn, source: "dark-mode" }))
      );
      links.push(
        ...darkModeLinks.map((link) => ({ ...link, source: "dark-mode" }))
      );

      spinner.stop();
      console.log(chalk.hex('#50FA7B')(`  ✓ Dark mode: +${darkModeColors.palette.length} colors`));
    }

    // Extract additional colors from mobile viewport if requested
    if (options.mobile) {
      spinner.start("Extracting mobile viewport colors...");

      // Change viewport to mobile
      await page.setViewportSize({ width: 375, height: 667 });

      // Wait for responsive changes
      await page.waitForTimeout(500 * timeoutMultiplier);

      const mobileColors = await extractColors(page);

      // Merge mobile colors into main palette
      const mergedPalette = [...colors.palette];
      mobileColors.palette.forEach((mobileColor) => {
        const isDuplicate = mergedPalette.some((existingColor) => {
          return existingColor.normalized === mobileColor.normalized;
        });

        if (!isDuplicate) {
          mergedPalette.push({ ...mobileColor, source: "mobile" });
        }
      });

      colors.palette = mergedPalette;

      spinner.stop();
      console.log(chalk.hex('#50FA7B')(`  ✓ Mobile: +${mobileColors.palette.length} colors`));
    }

    spinner.stop();
    console.log();
    console.log(chalk.hex('#50FA7B').bold("✔ Brand extraction complete!"));

    // Report timeouts and suggest --slow if needed
    if (timeouts.length > 0 && !options.slow) {
      console.log();
      console.log(chalk.hex('#FFB86C')(`⚠ ${timeouts.length} timeout(s) occurred during extraction:`));
      timeouts.forEach(t => console.log(chalk.dim(`  • ${t}`)));
      console.log();
      console.log(chalk.hex('#8BE9FD')(`💡 Tip: Try running with ${chalk.bold('--slow')} flag for more reliable results on slow-loading sites`));
    }

    const result = {
      url: page.url(),
      extractedAt: new Date().toISOString(),
      logo,
      favicons,
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      components: { buttons, inputs, links },
      breakpoints,
      iconSystem,
      frameworks,
    };

    // Detect canvas-only / WebGL sites (Tesla, Apple Vision Pro, etc.)
    const isCanvasOnly = await page.evaluate(() => {
      const canvases = document.querySelectorAll("canvas");
      const hasRealContent = document.body.textContent.trim().length > 200;
      const hasManyCanvases = canvases.length > 3;
      const hasWebGL = Array.from(canvases).some((c) => {
        const ctx = c.getContext("webgl") || c.getContext("webgl2");
        return !!ctx;
      });
      return hasManyCanvases && hasWebGL && !hasRealContent;
    });

    if (isCanvasOnly) {
      result.note =
        "This website uses canvas/WebGL rendering (e.g. Tesla, Apple Vision Pro). Design system cannot be extracted from DOM.";
      result.isCanvasOnly = true;
    }

    if (ownBrowser) await browser.close();

    return result;
  } catch (error) {
    if (ownBrowser) await browser.close();
    spinner.fail("Extraction failed");
    console.error(`  ↳ Error during extraction: ${error.message}`);
    console.error(`  ↳ URL: ${url}`);
    console.error(`  ↳ Stage: ${spinner.text || "unknown"}`);
    throw error;
  }
}

/**
 * Extract logo information from the page
 * Looks for common logo patterns: img with logo in class/id, SVG logos, etc.
 * Includes safe zone estimation and favicon detection
 */
async function extractLogo(page, url) {
  return await page.evaluate((baseUrl) => {
    // Find logo - check img, svg, and svg elements containing <use> with logo references
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

        // Check element's own attributes
        if (attrs.includes("logo") || attrs.includes("brand")) {
          return true;
        }

        // For SVG elements, also check <use> children for logo references
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

        return false;
      }
    );

    let logoData = null;
    if (candidates.length > 0) {
      const logo = candidates[0];
      const computed = window.getComputedStyle(logo);
      const parent = logo.parentElement;
      const parentComputed = parent ? window.getComputedStyle(parent) : null;

      // Calculate safe zone from padding and margins
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

      if (logo.tagName === "IMG") {
        logoData = {
          source: "img",
          url: new URL(logo.src, baseUrl).href,
          width: logo.naturalWidth || logo.width,
          height: logo.naturalHeight || logo.height,
          alt: logo.alt,
          safeZone: safeZone,
        };
      } else {
        // SVG logo - try to get the parent link or closest anchor
        const parentLink = logo.closest("a");
        logoData = {
          source: "svg",
          url: parentLink ? parentLink.href : window.location.href,
          width: logo.width?.baseVal?.value,
          height: logo.height?.baseVal?.value,
          safeZone: safeZone,
        };
      }
    }

    // Extract all favicons
    const favicons = [];

    // Standard favicons
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

    // Apple touch icons
    document
      .querySelectorAll('link[rel="apple-touch-icon"]')
      .forEach((link) => {
        const href = link.getAttribute("href");
        if (href) {
          favicons.push({
            type: "apple-touch-icon",
            url: new URL(href, baseUrl).href,
            sizes: link.getAttribute("sizes") || null,
          });
        }
      });

    // Open Graph image
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

    // Twitter card image
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

    // Check for default /favicon.ico if not already included
    const hasFaviconIco = favicons.some((f) => f.url.endsWith("/favicon.ico"));
    if (!hasFaviconIco) {
      favicons.push({
        type: "favicon.ico",
        url: new URL("/favicon.ico", baseUrl).href,
        sizes: null,
      });
    }

    return {
      logo: logoData,
      favicons: favicons,
    };
  }, url);
}

/**
 * Extract color palette with confidence scoring
 * Analyzes semantic colors, CSS variables, and visual frequency
 */
async function extractColors(page) {
  return await page.evaluate(() => {
    // Helper: Convert any color to normalized hex for deduplication
    function normalizeColor(color) {
      const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
      return color.toLowerCase();
    }

    // Helper: Check if value is a valid simple color (not calc/clamp/var)
    function isValidColorValue(value) {
      if (!value) return false;
      // Reject CSS functions unless they contain actual color values
      if (
        value.includes("calc(") ||
        value.includes("clamp(") ||
        value.includes("var(")
      ) {
        // Only accept if it contains rgb/hsl/# inside
        return /#[0-9a-f]{3,6}|rgba?\(|hsla?\(/i.test(value);
      }
      // Accept hex, rgb, hsl, named colors
      return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+)/i.test(value);
    }

    const colorMap = new Map(); // Normalized color -> original representations
    const semanticColors = {};
    const cssVariables = {};

    // Extract CSS variables - filter out framework presets
    const styles = getComputedStyle(document.documentElement);
    const domain = window.location.hostname;

    for (let i = 0; i < styles.length; i++) {
      const prop = styles[i];
      if (prop.startsWith("--")) {
        // Skip WordPress presets (they're almost never customized)
        if (prop.startsWith("--wp--preset")) {
          continue;
        }

        // Skip obvious system/default variables
        if (prop.includes("--system-") || prop.includes("--default-")) {
          continue;
        }

        // Skip cookie consent unless it's a cookie consent domain
        if (
          prop.includes("--cc-") &&
          !domain.includes("cookie") &&
          !domain.includes("consent")
        ) {
          continue;
        }

        // For other frameworks, allow them through - brands often customize these
        // --tw-* (Tailwind), --bs-* (Bootstrap), --mdc-* (Material), --chakra-* are OK

        const value = styles.getPropertyValue(prop).trim();

        // Skip SCSS functions and invalid values
        if (
          value.includes("color.adjust(") ||
          value.includes("rgba(0, 0, 0, 0)") ||
          value.includes("rgba(0,0,0,0)") ||
          value.includes("lighten(") ||
          value.includes("darken(") ||
          value.includes("saturate(")
        ) {
          continue;
        }

        // Only include valid color values
        if (
          isValidColorValue(value) &&
          (prop.includes("color") ||
            prop.includes("bg") ||
            prop.includes("text") ||
            prop.includes("brand"))
        ) {
          cssVariables[prop] = value;
        }
      }
    }

    // Count total visible elements for threshold calculation
    const elements = document.querySelectorAll("*");
    const totalElements = elements.length;

    const contextScores = {
      logo: 5,
      brand: 5,
      primary: 4,
      cta: 4,
      hero: 3,
      button: 3,
      link: 2,
      header: 2,
      nav: 1,
    };

    elements.forEach((el) => {
      // Skip hidden elements
      const computed = getComputedStyle(el);
      if (
        computed.display === "none" ||
        computed.visibility === "hidden" ||
        computed.opacity === "0"
      ) {
        return;
      }

      const bgColor = computed.backgroundColor;
      const textColor = computed.color;
      const borderColor = computed.borderColor;

      // Build comprehensive context string including data attributes
      const context = (
        el.className + " " +
        el.id + " " +
        (el.getAttribute('data-tracking-linkid') || '') + " " +
        (el.getAttribute('data-cta') || '') + " " +
        (el.getAttribute('data-component') || '') + " " +
        el.tagName
      ).toLowerCase();

      let score = 1;

      // Check for semantic context keywords
      for (const [keyword, weight] of Object.entries(contextScores)) {
        if (context.includes(keyword)) score = Math.max(score, weight);
      }

      // Extra boost for colored buttons (non-transparent, non-white, non-black backgrounds)
      if ((context.includes('button') || context.includes('btn') || context.includes('cta')) &&
          bgColor &&
          bgColor !== 'rgba(0, 0, 0, 0)' &&
          bgColor !== 'transparent' &&
          bgColor !== 'rgb(255, 255, 255)' &&
          bgColor !== 'rgb(0, 0, 0)' &&
          bgColor !== 'rgb(239, 239, 239)') { // Also skip very light gray
        score = Math.max(score, 25); // Colored buttons get HIGH confidence (>20)
      }

      // Helper: Split multi-value color strings (e.g., "rgb(0,0,0) rgb(255,255,255) rgb(28,105,212)")
      function extractColorsFromValue(colorValue) {
        if (!colorValue) return [];

        // Match all rgb/rgba/hsl/hsla/hex values in the string
        const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+)/gi;
        const matches = colorValue.match(colorRegex) || [];

        // Filter out invalid matches
        return matches.filter(c =>
          c !== 'transparent' &&
          c !== 'rgba(0, 0, 0, 0)' &&
          c !== 'rgba(0,0,0,0)' &&
          c.length > 2
        );
      }

      // Collect all colors from this element
      const allColors = [
        ...extractColorsFromValue(bgColor),
        ...extractColorsFromValue(textColor),
        ...extractColorsFromValue(borderColor)
      ];

      allColors.forEach((color) => {
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
          const normalized = normalizeColor(color);
          const existing = colorMap.get(normalized) || {
            original: color, // Keep first seen format
            count: 0,
            score: 0,
            sources: new Set(),
          };
          existing.count++;
          existing.score += score;
          if (score > 1) {
            const source = context.split(" ")[0].substring(0, 30); // Limit source length
            if (source && !source.includes("__")) {
              // Skip auto-generated class names
              existing.sources.add(source);
            }
          }
          colorMap.set(normalized, existing);
        }
      });

      // Semantic color detection
      if (context.includes("primary") || el.matches('[class*="primary"]')) {
        semanticColors.primary =
          bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent"
            ? bgColor
            : textColor;
      }
      if (context.includes("secondary")) {
        semanticColors.secondary = bgColor;
      }
    });

    // Calculate threshold: 1% of elements or minimum 3 occurrences
    const threshold = Math.max(3, Math.floor(totalElements * 0.01));

    // Helper: Check if a color is "structural" (used on >40% of elements)
    // Only filter blacks/whites/grays if they're clearly just scaffolding
    function isStructuralColor(data, totalElements) {
      const usagePercent = (data.count / totalElements) * 100;
      const normalized = normalizeColor(data.original);

      // Pure transparent - always structural
      if (
        data.original === "rgba(0, 0, 0, 0)" ||
        data.original === "transparent"
      ) {
        return true;
      }

      // If a color is used on >40% of elements AND has very low semantic score, it's structural
      if (usagePercent > 40 && data.score < data.count * 1.2) {
        return true;
      }

      return false;
    }

    // Helper: Calculate delta-E color distance (simplified CIE76)
    function deltaE(rgb1, rgb2) {
      // Convert hex to RGB if needed
      function hexToRgb(hex) {
        if (!hex.startsWith("#")) return null;
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : null;
      }

      const c1 = hexToRgb(rgb1);
      const c2 = hexToRgb(rgb2);

      if (!c1 || !c2) return 999; // Very different if can't parse

      // Simple RGB distance (not true delta-E but good enough)
      const rDiff = c1.r - c2.r;
      const gDiff = c1.g - c2.g;
      const bDiff = c1.b - c2.b;

      return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
    }

    const palette = Array.from(colorMap.entries())
      .filter(([normalizedColor, data]) => {
        // Filter out colors below threshold
        if (data.count < threshold) return false;

        // Filter out structural colors (very high usage without semantic context)
        if (isStructuralColor(data, totalElements)) {
          return false;
        }

        return true;
      })
      .map(([normalizedColor, data]) => ({
        color: data.original,
        normalized: normalizedColor,
        count: data.count,
        confidence:
          data.score > 20 ? "high" : data.score > 5 ? "medium" : "low",
        sources: Array.from(data.sources).slice(0, 3),
      }))
      .sort((a, b) => b.count - a.count);

    // Apply perceptual deduplication using delta-E
    // Merge colors that are visually very similar (delta-E < 15)
    const perceptuallyDeduped = [];
    const merged = new Set();

    palette.forEach((color, index) => {
      if (merged.has(index)) return;

      // Find all similar colors
      const similar = [color];
      for (let i = index + 1; i < palette.length; i++) {
        if (merged.has(i)) continue;

        const distance = deltaE(color.normalized, palette[i].normalized);
        if (distance < 15) {
          // Threshold for "visually similar"
          similar.push(palette[i]);
          merged.add(i);
        }
      }

      // Keep the one with highest count (most common variant)
      const best = similar.sort((a, b) => b.count - a.count)[0];
      perceptuallyDeduped.push(best);
    });

    // Deduplicate and filter CSS variables
    const paletteNormalizedColors = new Set(
      perceptuallyDeduped.map((c) => c.normalized)
    );
    const cssVarsByColor = new Map(); // normalized color -> variable names

    Object.entries(cssVariables).forEach(([prop, value]) => {
      const normalized = normalizeColor(value);

      // Skip if this color is already in the palette
      if (paletteNormalizedColors.has(normalized)) {
        return;
      }

      // Apply perceptual deduplication to CSS variables too
      let isDuplicate = false;
      for (const paletteColor of perceptuallyDeduped) {
        if (deltaE(normalized, paletteColor.normalized) < 15) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) return;

      if (!cssVarsByColor.has(normalized)) {
        cssVarsByColor.set(normalized, { value, vars: [] });
      }
      cssVarsByColor.get(normalized).vars.push(prop);
    });

    // Convert back to object with deduplicated values
    const filteredCssVariables = {};
    cssVarsByColor.forEach(({ value, vars }) => {
      // Only show first variable name if multiple have same value
      filteredCssVariables[vars[0]] = value;
    });

    return {
      semantic: semanticColors,
      palette: perceptuallyDeduped,
      cssVariables: filteredCssVariables,
    };
  });
}

async function extractTypography(page) {
  return await page.evaluate(() => {
    const seen = new Map();
    const sources = {
      googleFonts: [],
      adobeFonts: false,
      customFonts: [],
      variableFonts: new Set(),
    };

    // ——— Font sources ———
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

    // Check font-display from @font-face rules
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
        } catch (e) {
          // Cross-origin stylesheets
        }
        if (fontDisplay) break;
      }
    } catch (e) {
      // Ignore errors
    }
    sources.fontDisplay = fontDisplay;

    // ——— Sample elements ———
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

      // Check for fluid typography (clamp, vw, vh)
      const isFluid = s.fontSize.includes('clamp') || s.fontSize.includes('vw') || s.fontSize.includes('vh');

      // Check for OpenType features
      const fontFeatures = s.fontFeatureSettings !== 'normal' ? s.fontFeatureSettings : null;

      // Build context label
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

      // Parse line-height to unitless if possible
      let lineHeightValue = null;
      if (lineHeight !== 'normal') {
        const lhNum = parseFloat(lineHeight);
        // If line-height is in px, convert to unitless ratio
        if (lineHeight.includes('px')) {
          lineHeightValue = (lhNum / size).toFixed(2);
        } else {
          // Already unitless or in other unit
          lineHeightValue = lhNum.toFixed(2);
        }
      }

      seen.set(key, {
        context,
        family,
        fallbacks: fallbacks.length > 0 ? fallbacks.join(', ') : null,
        size: `${size}px (${(size / 16).toFixed(2)}rem)`,
        weight: weight,
        lineHeight: lineHeightValue,
        spacing: letterSpacing !== "normal" ? letterSpacing : null,
        transform: textTransform !== "none" ? textTransform : null,
        isFluid: isFluid || undefined,
        fontFeatures: fontFeatures || undefined,
      });
    });

    // Sort exactly like your original output (largest → smallest)
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

/**
 * Extract spacing scale and detect grid system
 */
async function extractSpacing(page) {
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
      .sort((a, b) => b[1] - a[1]) // Sort by count first to get most common
      .slice(0, 20)
      .map(([px, count]) => ({
        px: px + "px",
        rem: (px / 16).toFixed(2) + "rem",
        count,
        numericValue: px,
      }))
      .sort((a, b) => a.numericValue - b.numericValue); // Then sort by numeric value

    // Detect grid system
    const is4px = values.some((v) => parseFloat(v.px) % 4 === 0);
    const is8px = values.some((v) => parseFloat(v.px) % 8 === 0);
    const scaleType = is8px ? "8px" : is4px ? "4px" : "custom";

    return { scaleType, commonValues: values };
  });
}

/**
 * Extract border radius patterns
 */
async function extractBorderRadius(page) {
  return await page.evaluate(() => {
    const radii = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const radius = getComputedStyle(el).borderRadius;
      if (radius && radius !== "0px") {
        radii.set(radius, (radii.get(radius) || 0) + 1);
      }
    });

    const values = Array.from(radii.entries())
      .map(([value, count]) => ({
        value,
        count,
        confidence: count > 10 ? "high" : count > 3 ? "medium" : "low",
        numericValue: parseFloat(value) || 0, // Extract numeric value for sorting
      }))
      .sort((a, b) => {
        // Sort by numeric value, with percentage last
        if (a.value.includes("%") && !b.value.includes("%")) return 1;
        if (!a.value.includes("%") && b.value.includes("%")) return -1;
        return a.numericValue - b.numericValue;
      });

    return { values };
  });
}

/**
 * Extract border patterns (widths, styles, colors)
 */
async function extractBorders(page) {
  return await page.evaluate(() => {
    const widths = new Map();
    const styles = new Map();
    const colors = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const computed = getComputedStyle(el);

      // Extract border width
      const borderWidth = computed.borderWidth;
      if (borderWidth && borderWidth !== "0px") {
        widths.set(borderWidth, (widths.get(borderWidth) || 0) + 1);
      }

      // Extract border style
      const borderStyle = computed.borderStyle;
      if (borderStyle && borderStyle !== "none") {
        styles.set(borderStyle, (styles.get(borderStyle) || 0) + 1);
      }

      // Extract border color (only if border is visible)
      if (
        borderWidth &&
        borderWidth !== "0px" &&
        borderStyle &&
        borderStyle !== "none"
      ) {
        const borderColor = computed.borderColor;
        if (
          borderColor &&
          borderColor !== "rgba(0, 0, 0, 0)" &&
          borderColor !== "transparent"
        ) {
          // Split multi-value border colors (e.g., "rgb(0,0,0) rgb(255,255,255) rgb(28,105,212)")
          const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
          const individualColors = borderColor.match(colorRegex) || [borderColor];

          individualColors.forEach(color => {
            if (color &&
                color !== "rgba(0, 0, 0, 0)" &&
                color !== "rgba(0,0,0,0)" &&
                color !== "transparent") {
              colors.set(color, (colors.get(color) || 0) + 1);
            }
          });
        }
      }
    });

    // Process widths
    const processedWidths = Array.from(widths.entries())
      .map(([value, count]) => ({
        value,
        count,
        confidence: count > 10 ? "high" : count > 3 ? "medium" : "low",
        numericValue: parseFloat(value) || 0,
      }))
      .sort((a, b) => a.numericValue - b.numericValue);

    // Process styles
    const processedStyles = Array.from(styles.entries())
      .map(([value, count]) => ({
        value,
        count,
        confidence: count > 10 ? "high" : count > 3 ? "medium" : "low",
      }))
      .sort((a, b) => b.count - a.count);

    // Process colors
    const processedColors = Array.from(colors.entries())
      .map(([value, count]) => ({
        value,
        count,
        confidence: count > 10 ? "high" : count > 3 ? "medium" : "low",
      }))
      .sort((a, b) => b.count - a.count);

    return {
      widths: processedWidths,
      styles: processedStyles,
      colors: processedColors,
    };
  });
}

/**
 * Extract box shadow patterns for elevation systems
 */
async function extractShadows(page) {
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

/**
 * Extract button component styles and variants
 */
async function extractButtonStyles(page) {
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
        [data-cta]
      `)
    );

    return buttons
      .map((btn) => {
        const computed = getComputedStyle(btn);

        // Skip if not visible
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
          return null;
        }

        // Skip if background is transparent/white/black (likely not a styled button)
        const bg = computed.backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
          return null;
        }

        // Determine confidence based on semantic HTML and ARIA
        const role = btn.getAttribute('role');
        const isNativeButton = btn.tagName === "BUTTON";
        const isButtonRole = ['button', 'tab', 'menuitem', 'switch'].includes(role);
        const hasAriaPressed = btn.hasAttribute('aria-pressed');
        const hasAriaExpanded = btn.hasAttribute('aria-expanded');
        const isHighConfidence = isNativeButton || isButtonRole || hasAriaPressed || hasAriaExpanded;

        // Handle className for both HTML and SVG elements
        const className = typeof btn.className === 'string'
          ? btn.className
          : btn.className.baseVal || '';

        return {
          backgroundColor: bg,
          color: computed.color,
          padding: computed.padding,
          borderRadius: computed.borderRadius,
          border: computed.border,
          fontWeight: computed.fontWeight,
          fontSize: computed.fontSize,
          classes: className.substring(0, 50), // Limit class name length
          confidence: isHighConfidence ? "high" : "medium",
        };
      })
      .filter(btn => btn !== null) // Remove nulls
      .filter(
        (btn, i, arr) =>
          arr.findIndex((b) => b.backgroundColor === btn.backgroundColor) === i
      )
      .slice(0, 15); // Increase from 10 to 15
  });
}

/**
 * Extract input field styles
 */
async function extractInputStyles(page) {
  return await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll(`
        input,
        textarea,
        select,
        [role="textbox"],
        [role="searchbox"],
        [role="combobox"],
        [contenteditable="true"]
      `)
    );

    const uniqueStyles = new Map();

    inputs.forEach((input) => {
      const computed = getComputedStyle(input);
      const key = `${input.tagName.toLowerCase()}-${computed.border}-${
        computed.borderRadius
      }-${computed.padding}`;

      if (!uniqueStyles.has(key)) {
        uniqueStyles.set(key, {
          type: input.tagName.toLowerCase(),
          border: computed.border,
          borderRadius: computed.borderRadius,
          padding: computed.padding,
          backgroundColor: computed.backgroundColor,
          focusStyles: {
            outline: computed.outline,
          },
        });
      }
    });

    return Array.from(uniqueStyles.values()).slice(0, 8);
  });
}

/**
 * Extract link styles including hover states
 */
async function extractLinkStyles(page) {
  return await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll(`
        a,
        [role="link"],
        [aria-current]
      `)
    );
    const uniqueStyles = new Map();

    links.slice(0, 20).forEach((link) => {
      const computed = getComputedStyle(link);
      const key = `${computed.color}-${computed.textDecoration}`;

      if (!uniqueStyles.has(key)) {
        uniqueStyles.set(key, {
          color: computed.color,
          textDecoration: computed.textDecoration,
          fontWeight: computed.fontWeight,
          hoverColor: null,
          hoverDecoration: null,
        });
      }
    });

    return Array.from(uniqueStyles.values()).slice(0, 8);
  });
}

/**
 * Detect responsive breakpoints from CSS
 */
async function extractBreakpoints(page) {
  return await page.evaluate(() => {
    const breakpoints = new Set();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.media) {
            const match = rule.media.mediaText.match(/(\d+)px/g);
            if (match) match.forEach((m) => breakpoints.add(parseInt(m)));
          }
        }
      } catch (e) {
        // Cross-origin stylesheets may throw errors
      }
    }

    return Array.from(breakpoints)
      .sort((a, b) => a - b)
      .map((px) => ({ px: px + "px" }));
  });
}

/**
 * Detect icon systems in use
 */
async function detectIconSystem(page) {
  return await page.evaluate(() => {
    const systems = [];

    if (document.querySelector('[class*="fa-"]')) {
      systems.push({ name: "Font Awesome", type: "icon-font" });
    }
    if (document.querySelector('[class*="material-icons"]')) {
      systems.push({ name: "Material Icons", type: "icon-font" });
    }
    if (document.querySelector('svg[class*="icon"]')) {
      systems.push({ name: "SVG Icons", type: "svg" });
    }

    return systems;
  });
}

/**
 * Detect CSS frameworks and libraries
 */
async function detectFrameworks(page) {
  return await page.evaluate(() => {
    const frameworks = [];
    const html = document.documentElement.outerHTML;
    const body = document.body;

    // Helper: Count elements with pattern
    function countMatches(selector) {
      try {
        return document.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    }

    // Helper: Check if stylesheet/script exists
    function hasResource(pattern) {
      const links = Array.from(document.querySelectorAll('link[href], script[src]'));
      return links.some(el => pattern.test(el.href || el.src));
    }

    // 1. Tailwind CSS - Very specific detection
    const tailwindEvidence = [];

    // Arbitrary values are almost 100% unique to Tailwind
    if (/\b\w+-\[[^\]]+\]/.test(html)) {
      tailwindEvidence.push('arbitrary values (e.g., top-[117px])');
    }

    // Stacked modifiers (md:hover:, dark:, etc.)
    if (/(sm|md|lg|xl|2xl|dark|hover|focus|group-hover|peer-):[a-z]/.test(html)) {
      tailwindEvidence.push('responsive/state modifiers');
    }

    // CDN or build file
    if (hasResource(/tailwindcss|tailwind\.css|cdn\.tailwindcss/)) {
      tailwindEvidence.push('stylesheet');
    }

    if (tailwindEvidence.length >= 2) {
      frameworks.push({
        name: 'Tailwind CSS',
        confidence: 'high',
        evidence: tailwindEvidence.join(', ')
      });
    }

    // 2. Bootstrap - Check for specific patterns + CDN
    const bootstrapEvidence = [];

    // Bootstrap has very specific class combinations
    const hasContainer = countMatches('.container, .container-fluid') > 0;
    const hasRow = countMatches('.row') > 0;
    const hasCol = countMatches('[class*="col-"]') > 0;

    if (hasContainer && hasRow && hasCol) {
      bootstrapEvidence.push('grid system (container + row + col)');
    }

    // Bootstrap buttons are very predictable
    if (/\bbtn-primary\b|\bbtn-secondary\b|\bbtn-success\b/.test(html)) {
      bootstrapEvidence.push('button variants');
    }

    // CDN or build file
    if (hasResource(/bootstrap\.min\.css|bootstrap\.css|getbootstrap\.com/)) {
      bootstrapEvidence.push('stylesheet');
    }

    if (bootstrapEvidence.length >= 2) {
      frameworks.push({
        name: 'Bootstrap',
        confidence: 'high',
        evidence: bootstrapEvidence.join(', ')
      });
    }

    // 3. Material UI (MUI) - Very distinctive
    const muiCount = countMatches('[class*="MuiBox-"], [class*="MuiButton-"], [class*="Mui"]');
    if (muiCount > 3) {
      frameworks.push({
        name: 'Material UI (MUI)',
        confidence: 'high',
        evidence: `${muiCount} MUI components`
      });
    }

    // 4. Chakra UI - Check for chakra- prefix
    const chakraCount = countMatches('[class*="chakra-"]');
    if (chakraCount > 3) {
      frameworks.push({
        name: 'Chakra UI',
        confidence: 'high',
        evidence: `${chakraCount} Chakra components`
      });
    }

    // 5. Ant Design - ant- prefix at word boundary (not "merchant", "assistant")
    const antCount = countMatches('[class^="ant-"], [class*=" ant-"]');
    if (antCount > 3) {
      frameworks.push({
        name: 'Ant Design',
        confidence: 'high',
        evidence: `${antCount} Ant components`
      });
    }

    // 6. Vuetify - v- prefix + theme attributes
    const vuetifyCount = countMatches('[class*="v-btn"], [class*="v-card"], [class*="v-"]');
    const hasVuetifyTheme = body.classList.contains('theme--light') || body.classList.contains('theme--dark');
    if (vuetifyCount > 5 || hasVuetifyTheme) {
      frameworks.push({
        name: 'Vuetify',
        confidence: 'high',
        evidence: `${vuetifyCount} v- components`
      });
    }

    // 7. Shopify Polaris - Very long Polaris- prefixed classes
    const polarisCount = countMatches('[class*="Polaris-"]');
    if (polarisCount > 2) {
      frameworks.push({
        name: 'Shopify Polaris',
        confidence: 'high',
        evidence: `${polarisCount} Polaris components`
      });
    }

    // 8. Radix UI - data-radix- attributes (headless)
    const radixCount = document.querySelectorAll('[data-radix-], [data-state]').length;
    if (radixCount > 5) {
      frameworks.push({
        name: 'Radix UI',
        confidence: 'high',
        evidence: `${radixCount} Radix primitives`
      });
    }

    // 9. DaisyUI - Requires Tailwind + specific DaisyUI-only component classes
    if (tailwindEvidence.length >= 2) {
      // Check for DaisyUI-specific classes that aren't in standard Tailwind
      const daisySpecific = countMatches('.btn-primary.btn, .badge, .drawer, .swap, .mockup-code');
      const hasDaisyTheme = body.hasAttribute('data-theme');
      if (daisySpecific > 3 || hasDaisyTheme) {
        frameworks.push({
          name: 'DaisyUI',
          confidence: 'high',
          evidence: `Tailwind + ${daisySpecific} DaisyUI components`
        });
      }
    }

    return frameworks;
  });
}
