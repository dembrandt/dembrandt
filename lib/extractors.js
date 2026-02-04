/**
 * Brand Extraction Engine
 *
 * Core extraction logic with stealth mode, retry mechanisms, and parallel processing.
 * Handles bot detection, SPA hydration, and comprehensive design token extraction.
 */

import chalk from "chalk";
import { convertColor } from "./colors.js";

/**
 * Main extraction function - orchestrates the entire brand analysis process
 *
 * @param {string} url - Target URL to analyze
 * @param {Object} spinner - Ora spinner instance for progress updates
 * @param {Object} browser - Pre-configured browser instance (required)
 * @param {Object} options - Configuration options (navigationTimeout, etc.)
 * @returns {Object} Complete brand extraction data
 */
export async function extractBranding(
  url,
  spinner,
  browser,
  options = {}
) {
  // Apply 3x timeout multiplier when --slow flag is enabled
  const timeoutMultiplier = options.slow ? 3 : 1;

  // Track timeouts for final report
  const timeouts = [];

  spinner.text = "Creating browser context with stealth mode...";
  const contextOptions = {
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
  };

  // Only add clipboard permissions for Chromium (Firefox doesn't support them)
  if (browser.browserType().name() === 'chromium') {
    contextOptions.permissions = ["clipboard-read", "clipboard-write"];
  }

  const context = await browser.newContext(contextOptions);

  // Full stealth — kills 99% of Cloudflare bot detection
  spinner.text = "Injecting anti-detection scripts...";

  await context.addInitScript(() => {
    // Spoof hardware capabilities to match a real high-end Mac
    // Bots often report low values or inconsistent data
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 }); // 8 CPU cores
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 }); // 8GB RAM
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }); // macOS platform
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 }); // Desktop (no touch)

    // Add Chrome runtime objects that real Chrome has but headless browsers lack
    // Bot detectors check for window.chrome existence
    window.chrome = {
      runtime: {},
      loadTimes: () => { },
      csi: () => { },
      app: {},
    };

    // Remove Playwright-specific properties that expose automation
    // navigator.webdriver is set to true in automated browsers
    delete navigator.__proto__.webdriver;
    // Playwright injects these variables - remove them to hide automation traces
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

        // Wait until some content is rendered in the <body>
        spinner.start("Waiting for body content to render...");
        try {
          await page.waitForFunction(
            () => document.body && document.body.children.length > 0,
            {
              timeout: (options.navigationTimeout || 20000) * timeoutMultiplier,
            }
          );
          spinner.stop();
          console.log(chalk.hex('#50FA7B')(`  ✓ Body content rendered`));
        } catch {
          spinner.stop();
          console.log(chalk.hex('#FFB86C')(`  ⚠ Body content timeout (continuing)`));
          timeouts.push('Body content rendering');
        }

        // Give SPAs time to hydrate (Linear, Figma, Notion, etc.)
        spinner.start("Waiting for SPA hydration...");
        const hydrationTime = 8000 * timeoutMultiplier;
        await page.waitForTimeout(hydrationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Hydration complete (${hydrationTime / 1000}s)`));

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

        if (contentLength > 100) {
          console.log(chalk.hex('#50FA7B')(`  ✓ Content validated: ${contentLength} chars`));
          break;
        }

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

    spinner.start("Analyzing design system (14 parallel tasks)...");
    const [
      { logo, favicons },
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      buttons,
      inputs,
      links,
      badges,
      breakpoints,
      iconSystem,
      frameworks,
    ] = await Promise.all([
      extractLogo(page, url),
      extractColors(page),
      extractTypography(page),
      extractSpacing(page),
      extractBorderRadius(page),
      extractBorders(page),
      extractShadows(page),
      extractButtonStyles(page),
      extractInputStyles(page),
      extractLinkStyles(page),
      extractBadgeStyles(page),
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
        await element.hover({ timeout: 1000 * timeoutMultiplier }).catch(() => { });
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
    await page.mouse.move(0, 0).catch(() => { });

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

      // Change viewport to mobile (iPhone 12/13/14/15 - most common)
      await page.setViewportSize({ width: 390, height: 844 });

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
      components: { buttons, inputs, links, badges },
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

    return result;
  } catch (error) {
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

        // Include header SVGs/images that link to homepage (likely site logo)
        const inHeader = el.closest('header, nav, [role="banner"], [class*="header"], [class*="Header"], [id*="header"]');
        if (inHeader) {
          const parentLink = el.closest('a');
          if (parentLink) {
            const href = parentLink.getAttribute('href') || '';
            const ariaLabel = (parentLink.getAttribute('aria-label') || '').toLowerCase();
            // Check for homepage link patterns (including /country/ paths like /fi/, /en-us/)
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
      // Extract site domain for matching
      const siteDomain = new URL(baseUrl).hostname.replace('www.', '').split('.')[0].toLowerCase();

      // Score each candidate
      const scored = candidates.map(el => {
        let score = 0;
        const rect = el.getBoundingClientRect();
        const parentLink = el.closest('a');
        const linkHref = parentLink?.getAttribute('href') || '';
        const imgSrc = el.tagName === 'IMG' ? (el.src || '') : '';
        const altText = (el.getAttribute('alt') || '').toLowerCase();
        const className = (typeof el.className === 'string' ? el.className : el.className.baseVal || '').toLowerCase();

        // 1. Prioritize logos in header/nav (+50)
        const inHeader = el.closest('header, nav, [role="banner"], [class*="header"], [class*="nav"], [id*="header"], [id*="nav"]');
        if (inHeader) score += 50;

        // 2. URL/alt contains site domain (+40)
        if (imgSrc.toLowerCase().includes(siteDomain) || altText.includes(siteDomain) || className.includes(siteDomain)) {
          score += 40;
        }

        // 3. Links to homepage (+30)
        if (parentLink) {
          const href = linkHref.toLowerCase();
          if (href === '/' || href === baseUrl || href === baseUrl + '/' || href.endsWith('://' + new URL(baseUrl).hostname + '/') || href.endsWith('://' + new URL(baseUrl).hostname)) {
            score += 30;
          }
        }

        // 4. Position scoring - top-left bias (+20 max)
        // Logos in top 200px get bonus, left 400px gets bonus
        if (rect.top < 200) score += 10;
        if (rect.left < 400) score += 10;

        // Penalty for logos far down the page
        if (rect.top > 600) score -= 20;

        // Penalty for very small or very large images (likely not logos)
        const width = el.naturalWidth || el.width?.baseVal?.value || rect.width;
        const height = el.naturalHeight || el.height?.baseVal?.value || rect.height;
        if (width < 20 || height < 20) score -= 30;
        if (width > 500 || height > 300) score -= 40;

        // Penalty for descriptive alt text (likely content images, not logos)
        if (altText.length > 50) score -= 30;
        if (altText.includes(' the ') || altText.includes(' a ') || altText.includes(' of ')) score -= 20;

        // Bonus for typical logo dimensions (width > height, reasonable size)
        if (width > height && width < 300 && width > 40 && height > 15 && height < 100) score += 15;

        // Strong penalty if not in header and no domain match
        if (!inHeader && !imgSrc.toLowerCase().includes(siteDomain) && !altText.includes(siteDomain)) {
          score -= 30;
        }

        return { el, score };
      });

      // Sort by score descending and pick the best
      scored.sort((a, b) => b.score - a.score);
      const logo = scored[0].el;
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
  const result = await page.evaluate(() => {
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

        // Skip utility variables that are never colors (transforms, sizing, spacing)
        const nonColorUtilities = [
          '--tw-ring-offset-width', '--tw-ring-offset', '--tw-shadow', '--tw-blur',
          '--tw-brightness', '--tw-contrast', '--tw-grayscale', '--tw-hue-rotate',
          '--tw-invert', '--tw-saturate', '--tw-sepia', '--tw-drop-shadow',
          '--tw-translate-x', '--tw-translate-y', '--tw-translate-z',
          '--tw-rotate', '--tw-skew-x', '--tw-skew-y',
          '--tw-scale-x', '--tw-scale-y', '--tw-scale-z',
          '--tw-gradient-from-position', '--tw-gradient-via-position', '--tw-gradient-to-position',
          '--tw-divide-', '--tw-space-',
          '--bs-gutter', '--bs-border-spacing'
        ];
        if (nonColorUtilities.some(pattern => prop.includes(pattern))) {
          continue;
        }

        // For other frameworks, allow them through - brands often customize these
        // --tw-* (Tailwind), --bs-* (Bootstrap), --mdc-* (Material), --chakra-* are OK

        const value = styles.getPropertyValue(prop).trim();

        // Skip if value is not a color format
        if (!value.match(/^(#|rgb|hsl|var\(--.*color|color\()/i)) {
          continue;
        }

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

    // Helper: Calculate delta-E color distance (CIE76 using LAB color space)
    function deltaE(rgb1, rgb2) {
      // Convert hex to RGB
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

      // Convert RGB to XYZ color space
      function rgbToXyz(r, g, b) {
        // Normalize RGB values to 0-1 range
        r = r / 255;
        g = g / 255;
        b = b / 255;

        // Apply gamma correction
        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

        // Convert to XYZ using D65 illuminant
        const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
        const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
        const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

        return { x: x * 100, y: y * 100, z: z * 100 };
      }

      // Convert XYZ to LAB color space
      function xyzToLab(x, y, z) {
        // D65 reference white point
        const refX = 95.047;
        const refY = 100.000;
        const refZ = 108.883;

        x = x / refX;
        y = y / refY;
        z = z / refZ;

        // Apply function
        const fx = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x + 16 / 116);
        const fy = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y + 16 / 116);
        const fz = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z + 16 / 116);

        const L = 116 * fy - 16;
        const a = 500 * (fx - fy);
        const b = 200 * (fy - fz);

        return { L, a, b };
      }

      const rgb1Obj = hexToRgb(rgb1);
      const rgb2Obj = hexToRgb(rgb2);

      if (!rgb1Obj || !rgb2Obj) return 999; // Very different if can't parse

      // Convert both colors to LAB
      const xyz1 = rgbToXyz(rgb1Obj.r, rgb1Obj.g, rgb1Obj.b);
      const lab1 = xyzToLab(xyz1.x, xyz1.y, xyz1.z);

      const xyz2 = rgbToXyz(rgb2Obj.r, rgb2Obj.g, rgb2Obj.b);
      const lab2 = xyzToLab(xyz2.x, xyz2.y, xyz2.z);

      // Calculate Euclidean distance in LAB space (CIE76)
      const deltaL = lab1.L - lab2.L;
      const deltaA = lab1.a - lab2.a;
      const deltaB = lab1.b - lab2.b;

      return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
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

  // Post-process: add LCH and OKLCH color formats to palette
  if (result && result.palette) {
    result.palette = result.palette.map((colorItem) => {
      const converted = convertColor(colorItem.normalized || colorItem.color);
      if (converted) {
        return {
          ...colorItem,
          lch: converted.lch,
          oklch: converted.oklch,
        };
      }
      return colorItem;
    });
  }

  // Post-process: add LCH and OKLCH to CSS variables
  if (result && result.cssVariables) {
    const enhancedCssVariables = {};
    for (const [name, value] of Object.entries(result.cssVariables)) {
      const converted = convertColor(value);
      if (converted) {
        enhancedCssVariables[name] = {
          value,
          lch: converted.lch,
          oklch: converted.oklch,
        };
      } else {
        enhancedCssVariables[name] = { value };
      }
    }
    result.cssVariables = enhancedCssVariables;
  }

  return result;
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
        if (!radii.has(radius)) {
          radii.set(radius, { count: 0, elements: new Set() });
        }
        const data = radii.get(radius);
        data.count++;

        // Capture element context
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
        elements: Array.from(data.elements).slice(0, 5), // Limit to 5 element types
        confidence: data.count > 10 ? "high" : data.count > 3 ? "medium" : "low",
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
 * Extract border patterns as complete combinations (width + style + color)
 */
async function extractBorders(page) {
  return await page.evaluate(() => {
    const combinations = new Map();

    document.querySelectorAll("*").forEach((el) => {
      const computed = getComputedStyle(el);

      const borderWidth = computed.borderWidth;
      const borderStyle = computed.borderStyle;
      const borderColor = computed.borderColor;

      // Only process visible borders
      if (
        borderWidth &&
        borderWidth !== "0px" &&
        borderStyle &&
        borderStyle !== "none" &&
        borderColor &&
        borderColor !== "rgba(0, 0, 0, 0)" &&
        borderColor !== "transparent"
      ) {
        // Normalize color to extract individual colors from multi-value strings
        const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
        const individualColors = borderColor.match(colorRegex) || [borderColor];

        // Use the first color or the most common one
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

          // Capture element context
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
        [class*="cta"],
        [data-cta]
      `)
    );

    const extractState = (btn, stateName = 'default') => {
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

      // Skip if not visible
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      // Check if button has any styling (background OR border)
      const bg = computed.backgroundColor;
      const border = computed.border;
      const borderWidth = computed.borderWidth;
      const borderColor = computed.borderColor;
      const boxShadow = computed.boxShadow;
      
      const hasBorder = borderWidth && 
                        parseFloat(borderWidth) > 0 && 
                        border !== 'none' && 
                        borderColor !== 'rgba(0, 0, 0, 0)' && 
                        borderColor !== 'transparent';
      
      const hasBackground = bg && 
                            bg !== 'rgba(0, 0, 0, 0)' && 
                            bg !== 'transparent';
      
      const hasShadow = boxShadow && 
                        boxShadow !== 'none' && 
                        boxShadow !== 'rgba(0, 0, 0, 0)';

      // Skip only if background, border, and shadow are all missing/transparent
      if (!hasBackground && !hasBorder && !hasShadow) {
        return;
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

      // Extract default state
      const defaultState = extractState(btn, 'default');

      // Try to extract pseudo-class states from stylesheets
      const states = {
        default: defaultState,
        hover: null,
        active: null,
        focus: null,
      };

      // Attempt to read CSS rules for hover, active, focus states
      try {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule.selectorText) {
                // Check if this rule could apply to our button
                const btnClasses = className.split(' ').filter(c => c);
                const matchesButton = btnClasses.some(cls =>
                  rule.selectorText.includes(`.${cls}`)
                );

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
          } catch (e) {
            // CORS or other stylesheet access error, skip
          }
        }
      } catch (e) {
        // Stylesheet parsing failed
      }

      buttonStyles.push({
        states,
        fontWeight: computed.fontWeight,
        fontSize: computed.fontSize,
        classes: className.substring(0, 50),
        confidence: isHighConfidence ? "high" : "medium",
      });
    });

    // Deduplicate by default state background color
    const uniqueButtons = [];
    const seen = new Set();

    for (const btn of buttonStyles) {
      const s = btn.states.default;
      // Key includes background, border (width/style), and shadow to distinguish variants
      const key = `${s.backgroundColor}|${s.border}|${s.boxShadow}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueButtons.push(btn);
      }
    }

    return uniqueButtons.slice(0, 15);
  });
}

/**
 * Extract input field styles with states
 */
async function extractInputStyles(page) {
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

    const inputGroups = {
      text: [],
      checkbox: [],
      radio: [],
      select: [],
    };

    inputs.forEach((input) => {
      const computed = getComputedStyle(input);

      // Skip if not visible
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      let inputType = 'text';
      if (input.tagName === 'TEXTAREA') {
        inputType = 'text';
      } else if (input.tagName === 'SELECT') {
        inputType = 'select';
      } else if (input.type === 'checkbox') {
        inputType = 'checkbox';
      } else if (input.type === 'radio') {
        inputType = 'radio';
      } else if (['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(input.type)) {
        inputType = 'text';
      }

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

      // Try to extract focus state from CSS rules
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
          } catch (e) {
            // CORS error
          }
        }
      } catch (e) {
        // Stylesheet parsing failed
      }

      inputGroups[inputType].push({
        specificType,
        states: {
          default: defaultState,
          focus: focusState,
        },
      });
    });

    // Deduplicate each group by key properties
    const deduplicateGroup = (group) => {
      const seen = new Map();
      for (const item of group) {
        const key = `${item.states.default.border}|${item.states.default.borderRadius}|${item.states.default.backgroundColor}`;
        if (!seen.has(key)) {
          seen.set(key, item);
        }
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

    links.forEach((link) => {
      const computed = getComputedStyle(link);

      // Skip if not visible
      const rect = link.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      // Normalize color to hex for deduplication
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
        // Try to extract hover state from CSS rules
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
            } catch (e) {
              // CORS error
            }
          }
        } catch (e) {
          // Stylesheet parsing failed
        }

        uniqueStyles.set(key, {
          color: computed.color,
          textDecoration: computed.textDecoration,
          fontWeight: computed.fontWeight,
          states: {
            default: {
              color: computed.color,
              textDecoration: computed.textDecoration,
            },
            hover: hoverState,
          },
        });
      } else {
        // If we already have this color, update decoration if this one is more specific
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

/**
 * Extract badge/tag/pill component styles and variants
 */
async function extractBadgeStyles(page) {
  return await page.evaluate(() => {
    const badges = Array.from(
      document.querySelectorAll(`
        [class*="badge"],
        [class*="tag"],
        [class*="pill"],
        [class*="chip"],
        [class*="label"]:not(label),
        [role="status"],
        .badge,
        .tag,
        .pill,
        .chip,
        .label:not(label)
      `)
    );

    const badgeStyles = [];
    const seenStyles = new Map();

    badges.forEach((badge) => {
      const computed = getComputedStyle(badge);

      // Skip if not visible
      const rect = badge.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      // Filter by size - badges are typically small and compact
      const width = rect.width;
      const height = rect.height;
      const fontSize = parseFloat(computed.fontSize);

      // Skip if too large (likely not a badge)
      if (width > 200 || height > 60) {
        return;
      }

      // Skip if font size is too large (badges typically have small text)
      if (fontSize > 16) {
        return;
      }

      // Check if badge has background or border styling
      const bg = computed.backgroundColor;
      const border = computed.border;
      const borderWidth = computed.borderWidth;
      const hasBorder = borderWidth && parseFloat(borderWidth) > 0 && border !== 'none';
      const hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';

      // Skip if no styling present
      if (!hasBackground && !hasBorder) {
        return;
      }

      // Get padding values
      const paddingTop = parseFloat(computed.paddingTop);
      const paddingBottom = parseFloat(computed.paddingBottom);
      const paddingLeft = parseFloat(computed.paddingLeft);
      const paddingRight = parseFloat(computed.paddingRight);
      const avgPaddingVertical = (paddingTop + paddingBottom) / 2;
      const avgPaddingHorizontal = (paddingLeft + paddingRight) / 2;

      // Badges typically have tight padding
      // Skip if padding is too large
      if (avgPaddingVertical > 16 || avgPaddingHorizontal > 24) {
        return;
      }

      // Determine confidence based on semantic classes and size
      const className = typeof badge.className === 'string'
        ? badge.className
        : badge.className.baseVal || '';

      const hasSemanticClass = /badge|tag|pill|chip|label|status/i.test(className);
      const hasSemanticRole = badge.getAttribute('role') === 'status';
      const borderRadius = parseFloat(computed.borderRadius);
      const isRounded = borderRadius > height / 3; // Pills have high border radius

      // Detect variant type based on colors
      const bgColor = computed.backgroundColor;
      let variant = 'neutral';

      // Simple color detection (could be more sophisticated)
      if (bgColor.includes('255, 0, 0') || bgColor.includes('220, 53, 69') || bgColor.includes('239, 68, 68')) {
        variant = 'error';
      } else if (bgColor.includes('255, 193, 7') || bgColor.includes('251, 191, 36') || bgColor.includes('245, 158, 11')) {
        variant = 'warning';
      } else if (bgColor.includes('40, 167, 69') || bgColor.includes('34, 197, 94') || bgColor.includes('16, 185, 129')) {
        variant = 'success';
      } else if (bgColor.includes('0, 123, 255') || bgColor.includes('59, 130, 246') || bgColor.includes('37, 99, 235')) {
        variant = 'info';
      }

      // Detect style type (filled, outline, subtle)
      let styleType = 'filled';
      if (!hasBackground && hasBorder) {
        styleType = 'outline';
      } else if (hasBackground) {
        // Check if background is very light (subtle variant)
        const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          const [, r, g, b] = rgbMatch.map(Number);
          const isLight = r > 240 && g > 240 && b > 240;
          if (isLight) {
            styleType = 'subtle';
          }
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

    // Group by variant
    const grouped = {
      error: badgeStyles.filter(b => b.variant === 'error'),
      warning: badgeStyles.filter(b => b.variant === 'warning'),
      success: badgeStyles.filter(b => b.variant === 'success'),
      info: badgeStyles.filter(b => b.variant === 'info'),
      neutral: badgeStyles.filter(b => b.variant === 'neutral'),
    };

    // Return all unique styles, limit to 20 total
    return {
      all: badgeStyles.slice(0, 20),
      byVariant: grouped,
    };
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
    if (document.querySelector('svg[class*="heroicon"]') || document.querySelector('svg[data-slot="icon"]')) {
      systems.push({ name: "Heroicons", type: "svg" });
    }
    if (document.querySelector('svg[class*="hugeicons"]') || document.querySelector('[class*="hugeicons-"]')) {
      systems.push({ name: "Hugeicons", type: "svg" });
    }
    if (document.querySelector('ion-icon') || document.querySelector('[class*="ionicons"]')) {
      systems.push({ name: "Ionicons", type: "svg" });
    }
    if (document.querySelector('svg[data-feather]') || document.querySelector('i[data-feather]') || document.querySelector('[class*="feather-"]')) {
      systems.push({ name: "Feather Icons", type: "svg" });
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

    // 6. Vuetify - specific component classes only
    const vuetifySpecific = countMatches('[class*="v-btn"], [class*="v-card"], [class*="v-app"], [class*="v-toolbar"], [class*="v-navigation"], [class*="v-list"], [class*="v-sheet"]');
    const hasVuetifyTheme = body.classList.contains('theme--light') || body.classList.contains('theme--dark');
    const hasVuetifyApp = countMatches('[class*="v-application"]') > 0;
    if ((vuetifySpecific > 8 && hasVuetifyApp) || (hasVuetifyTheme && vuetifySpecific > 5)) {
      frameworks.push({
        name: 'Vuetify',
        confidence: 'high',
        evidence: `${vuetifySpecific} Vuetify components`
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

    // 10. Foundation - Bootstrap competitor by ZURB
    const foundationEvidence = [];
    const hasFoundationGrid = countMatches('.grid-x, .grid-y, .cell') > 0;
    const hasFoundationButtons = countMatches('.button.primary, .button.secondary') > 0;

    if (hasFoundationGrid || hasFoundationButtons) {
      foundationEvidence.push('grid/button system');
    }

    if (hasResource(/foundation\.min\.css|foundation\.css|zurb\.com\/foundation/)) {
      foundationEvidence.push('stylesheet');
    }

    if (foundationEvidence.length >= 1 || countMatches('[data-foundation]') > 0) {
      frameworks.push({
        name: 'Foundation',
        confidence: 'high',
        evidence: foundationEvidence.join(', ') || 'data attributes'
      });
    }

    // 11. Bulma - Pure CSS, Flexbox-based
    const bulmaEvidence = [];
    const hasBulmaColumns = countMatches('.columns, .column') > 0;
    const hasBulmaButtons = /\bbutton is-primary\b|\bbutton is-link\b/.test(html);

    if (hasBulmaColumns && countMatches('.column') > 2) {
      bulmaEvidence.push('columns system');
    }

    if (hasBulmaButtons) {
      bulmaEvidence.push('button modifiers');
    }

    if (hasResource(/bulma\.min\.css|bulma\.css/)) {
      bulmaEvidence.push('stylesheet');
    }

    if (bulmaEvidence.length >= 2) {
      frameworks.push({
        name: 'Bulma',
        confidence: 'high',
        evidence: bulmaEvidence.join(', ')
      });
    }

    // 12. Semantic UI
    const semanticCount = countMatches('.ui.button, .ui.menu, .ui.card, .ui.grid');
    if (semanticCount > 3 || hasResource(/semantic\.min\.css|semantic-ui/)) {
      frameworks.push({
        name: 'Semantic UI',
        confidence: 'high',
        evidence: `${semanticCount} .ui components`
      });
    }

    // 13. UIkit
    const uikitCount = countMatches('[class*="uk-"], [uk-grid], [uk-navbar]');
    if (uikitCount > 3 || hasResource(/uikit\.min\.css|getuikit\.com/)) {
      frameworks.push({
        name: 'UIkit',
        confidence: 'high',
        evidence: `${uikitCount} uk- components`
      });
    }

    // 14. shadcn/ui - Radix + Tailwind patterns
    const shadcnClasses = /\bcn\(|\bslot-\w+|\bdata-\[state=/.test(html);
    const hasShadcnComponents = countMatches('[data-slot], [data-state]') > 5;
    if (tailwindEvidence.length >= 2 && radixCount > 3 && (shadcnClasses || hasShadcnComponents)) {
      frameworks.push({
        name: 'shadcn/ui',
        confidence: 'medium',
        evidence: 'Tailwind + Radix + component patterns'
      });
    }

    // 15. Headless UI - Tailwind Labs official
    const headlessCount = document.querySelectorAll('[aria-controls][aria-expanded], [role="dialog"][data-headlessui]').length;
    if (tailwindEvidence.length >= 2 && headlessCount > 2) {
      frameworks.push({
        name: 'Headless UI',
        confidence: 'high',
        evidence: `${headlessCount} headless components with Tailwind`
      });
    }

    // 16. PrimeReact/PrimeVue/PrimeNG - Enterprise component library
    const primeCount = countMatches('[class*="p-"], .p-component, .p-button, .p-datatable');
    if (primeCount > 5) {
      frameworks.push({
        name: 'PrimeReact/Vue/NG',
        confidence: 'high',
        evidence: `${primeCount} Prime components`
      });
    }

    // 17. Mantine - Modern React framework
    const mantineCount = countMatches('[class*="mantine-"], [data-mantine]');
    if (mantineCount > 3) {
      frameworks.push({
        name: 'Mantine',
        confidence: 'high',
        evidence: `${mantineCount} Mantine components`
      });
    }

    // 18. Carbon Design System - IBM
    const carbonCount = countMatches('[class*="cds--"], [class*="bx--"]');
    if (carbonCount > 3) {
      frameworks.push({
        name: 'Carbon Design System',
        confidence: 'high',
        evidence: `${carbonCount} Carbon components`
      });
    }

    // 19. Fluent UI - Microsoft
    const fluentCount = countMatches('[class*="ms-"], .ms-Button, .ms-TextField');
    if (fluentCount > 5) {
      frameworks.push({
        name: 'Fluent UI',
        confidence: 'high',
        evidence: `${fluentCount} Fluent components`
      });
    }

    // 20. Quasar - Vue framework
    const quasarCount = countMatches('[class*="q-"]');
    if (quasarCount > 5 || body.classList.contains('q-app')) {
      frameworks.push({
        name: 'Quasar',
        confidence: 'high',
        evidence: `${quasarCount} q- components`
      });
    }

    // 21. Element Plus/UI - Popular Vue
    const elementCount = countMatches('[class*="el-"]');
    if (elementCount > 5) {
      frameworks.push({
        name: 'Element Plus/UI',
        confidence: 'high',
        evidence: `${elementCount} el- components`
      });
    }

    return frameworks;
  });
}
