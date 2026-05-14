import chalk from 'chalk';
import { discoverLinks } from '../discovery.js';
import { extractLogo, extractSiteName } from './logo.js';
import { extractColors } from './colors.js';
import { extractTypography } from './typography.js';
import { extractSpacing, extractBorderRadius, extractBorders, extractShadows } from './spacing.js';
import { extractButtonStyles, extractInputStyles, extractLinkStyles, extractBadgeStyles } from './components.js';
import { extractBreakpoints, detectIconSystem, detectFrameworks, extractGradients } from './breakpoints.js';

export async function extractBranding(url, spinner, browser, options = {}) {
  const timeoutMultiplier = options.slow ? 3 : 1;
  const timeouts = [];

  spinner.text = "Creating browser context with stealth mode...";
  const contextOptions = {
    viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
  };

  if (browser.browserType().name() === 'chromium') {
    contextOptions.permissions = ["clipboard-read", "clipboard-write"];
  }

  const context = await browser.newContext(contextOptions);

  spinner.text = "Injecting anti-detection scripts...";
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
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

        if (initialUrl !== finalUrl) {
          spinner.stop();
          const initialDomain = new URL(initialUrl).hostname;
          const finalDomain = new URL(finalUrl).hostname;
          if (initialDomain !== finalDomain) {
            console.log(chalk.hex('#FFB86C')(`  ⚠ Page redirected to different domain:`));
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

        spinner.start("Waiting for body content to render...");
        try {
          await page.waitForFunction(
            () => document.body && document.body.children.length > 0,
            { timeout: (options.navigationTimeout || 20000) * timeoutMultiplier }
          );
          spinner.stop();
          console.log(chalk.hex('#50FA7B')(`  ✓ Body content rendered`));
        } catch {
          spinner.stop();
          console.log(chalk.hex('#FFB86C')(`  ⚠ Body content timeout (continuing)`));
          timeouts.push('Body content rendering');
        }

        spinner.start("Waiting for SPA hydration...");
        const hydrationTime = 8000 * timeoutMultiplier;
        await page.waitForTimeout(hydrationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Hydration complete (${hydrationTime / 1000}s)`));

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

        spinner.start("Simulating human interaction...");
        await page.mouse.move(300 + Math.random() * 400, 200 + Math.random() * 300);
        await page.evaluate(async () => {
          const delay = (ms) => new Promise(r => setTimeout(r, ms));
          const scrollStep = 600;
          const maxHeight = Math.min(document.body.scrollHeight, 30000);
          let y = 0;
          while (y < maxHeight) {
            y = Math.min(y + scrollStep, maxHeight);
            window.scrollTo(0, y);
            await delay(150 + Math.random() * 100);
          }
          window.scrollTo(0, 0);
        });
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Full page scrolled (lazy content triggered)`));

        spinner.start("Final content stabilization...");
        const stabilizationTime = 4000 * timeoutMultiplier;
        await page.waitForTimeout(stabilizationTime);
        spinner.stop();
        console.log(chalk.hex('#50FA7B')(`  ✓ Page fully loaded and stable`));

        spinner.start("Validating page content...");
        const contentLength = await page.evaluate(() => document.body.textContent.length);
        spinner.stop();

        if (contentLength > 100) {
          console.log(chalk.hex('#50FA7B')(`  ✓ Content validated: ${contentLength} chars`));
          break;
        }

        spinner.warn(`Page seems empty (attempt ${attempts}/${maxAttempts}), retrying...`);
        console.log(chalk.hex('#FFB86C')(`  ⚠ Content length: ${contentLength} chars (expected >100)`));
        await page.waitForTimeout(3000 * timeoutMultiplier);
      } catch (err) {
        if (attempts >= maxAttempts) {
          console.error(`  ↳ Failed after ${maxAttempts} attempts`);
          console.error(`  ↳ Last error: ${err.message}`);
          console.error(`  ↳ URL: ${url}`);
          throw err;
        }
        spinner.warn(`Navigation failed (attempt ${attempts}/${maxAttempts}), retrying...`);
        console.log(`  ↳ Error: ${err.message}`);
        await page.waitForTimeout(3000 * timeoutMultiplier);
      }
    }

    spinner.stop();
    console.log(chalk.hex('#8BE9FD')("\n  Extracting design tokens...\n"));

    spinner.start("Analyzing design system (16 parallel tasks)...");
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
      siteName,
      gradients,
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
      extractSiteName(page),
      extractGradients(page),
    ]);

    spinner.stop();
    console.log(colors.palette.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Colors: ${colors.palette.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Colors: 0 found`));
    console.log(typography.styles.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Typography: ${typography.styles.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Typography: 0 styles`));
    console.log(spacing.commonValues.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Spacing: ${spacing.commonValues.length} values`) : chalk.hex('#FFB86C')(`  ⚠ Spacing: 0 values`));
    console.log(borderRadius.values.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Border radius: ${borderRadius.values.length} values`) : chalk.hex('#FFB86C')(`  ⚠ Border radius: 0 values`));

    const bordersTotal = (borders?.combinations?.length || 0);
    console.log(bordersTotal > 0 ? chalk.hex('#50FA7B')(`  ✓ Borders: ${bordersTotal} combinations`) : chalk.hex('#FFB86C')(`  ⚠ Borders: 0 found`));
    console.log(shadows.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Shadows: ${shadows.length} found`) : chalk.hex('#FFB86C')(`  ⚠ Shadows: 0 found`));
    console.log(buttons.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Buttons: ${buttons.length} variants`) : chalk.hex('#FFB86C')(`  ⚠ Buttons: 0 variants`));
    console.log(inputs.text?.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Inputs: found`) : chalk.hex('#FFB86C')(`  ⚠ Inputs: 0 styles`));
    console.log(links.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Links: ${links.length} styles`) : chalk.hex('#FFB86C')(`  ⚠ Links: 0 styles`));
    console.log(breakpoints.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Breakpoints: ${breakpoints.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Breakpoints: 0 detected`));
    console.log(iconSystem.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Icon systems: ${iconSystem.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Icon systems: 0 detected`));
    console.log(frameworks.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Frameworks: ${frameworks.length} detected`) : chalk.hex('#FFB86C')(`  ⚠ Frameworks: 0 detected`));
    console.log(gradients.length > 0 ? chalk.hex('#50FA7B')(`  ✓ Gradients: ${gradients.length} found`) : chalk.hex('#8BE9FD')(`  · Gradients: 0 found`));
    console.log();

    // Hover/focus state extraction
    spinner.start("Extracting hover/focus state colors...");
    const hoverFocusColors = [];

    function splitMultiValueColors(colorValue) {
      if (!colorValue) return [];
      const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
      const matches = colorValue.match(colorRegex) || [colorValue];
      return matches.filter(c =>
        c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgba(0,0,0,0)' && c.length > 3
      );
    }

    const interactiveElements = await page.$$(`
      a, button, input, textarea, select,
      [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"],
      [role="checkbox"], [role="radio"], [role="textbox"], [role="searchbox"], [role="combobox"],
      [aria-pressed], [aria-expanded], [aria-current],
      [tabindex]:not([tabindex="-1"])
    `);

    const sampled = interactiveElements.slice(0, 20);

    for (const element of sampled) {
      try {
        const isVisible = await element.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        if (!isVisible) continue;

        const beforeState = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return { color: computed.color, backgroundColor: computed.backgroundColor, borderColor: computed.borderColor, tag: el.tagName.toLowerCase() };
        });

        await element.hover({ timeout: 1000 * timeoutMultiplier }).catch(() => {});
        await page.waitForTimeout(100 * timeoutMultiplier);

        const afterHover = await element.evaluate(el => {
          const computed = getComputedStyle(el);
          return { color: computed.color, backgroundColor: computed.backgroundColor, borderColor: computed.borderColor };
        });

        if (afterHover.color !== beforeState.color && afterHover.color !== 'rgba(0, 0, 0, 0)' && afterHover.color !== 'transparent') {
          hoverFocusColors.push({ color: afterHover.color, property: 'color', state: 'hover', element: beforeState.tag });
        }
        if (afterHover.backgroundColor !== beforeState.backgroundColor && afterHover.backgroundColor !== 'rgba(0, 0, 0, 0)' && afterHover.backgroundColor !== 'transparent') {
          hoverFocusColors.push({ color: afterHover.backgroundColor, property: 'background-color', state: 'hover', element: beforeState.tag });
        }
        if (afterHover.borderColor !== beforeState.borderColor) {
          const hoverBorderColors = splitMultiValueColors(afterHover.borderColor);
          const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);
          hoverBorderColors.forEach(color => {
            if (!beforeBorderColors.includes(color)) {
              hoverFocusColors.push({ color, property: 'border-color', state: 'hover', element: beforeState.tag });
            }
          });
        }

        if (['input', 'textarea', 'select', 'button'].includes(beforeState.tag)) {
          try {
            await element.focus({ timeout: 500 * timeoutMultiplier });
            await page.waitForTimeout(100 * timeoutMultiplier);
            const afterFocus = await element.evaluate(el => {
              const computed = getComputedStyle(el);
              return { color: computed.color, backgroundColor: computed.backgroundColor, borderColor: computed.borderColor, outlineColor: computed.outlineColor };
            });
            if (afterFocus.outlineColor && afterFocus.outlineColor !== 'rgba(0, 0, 0, 0)' && afterFocus.outlineColor !== 'transparent' && afterFocus.outlineColor !== beforeState.color) {
              hoverFocusColors.push({ color: afterFocus.outlineColor, property: 'outline-color', state: 'focus', element: beforeState.tag });
            }
            if (afterFocus.borderColor !== beforeState.borderColor && afterFocus.borderColor !== afterHover.borderColor) {
              const focusBorderColors = splitMultiValueColors(afterFocus.borderColor);
              const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);
              focusBorderColors.forEach(color => {
                if (!beforeBorderColors.includes(color)) {
                  hoverFocusColors.push({ color, property: 'border-color', state: 'focus', element: beforeState.tag });
                }
              });
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    await page.mouse.move(0, 0).catch(() => {});

    // Batch-normalize hover/focus colors via browser canvas to handle oklab/oklch/lab
    const rawHoverColors = [...new Set(hoverFocusColors.map(h => h.color).filter(Boolean))];
    const hoverColorMap = rawHoverColors.length ? await page.evaluate((cols) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const out = {};
      for (const color of cols) {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) { out[color] = `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`; continue; }
        if (/^#[0-9a-f]{6}$/i.test(color)) { out[color] = color.toLowerCase(); continue; }
        if (ctx) {
          try {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            if (a > 0) { out[color] = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; continue; }
          } catch {}
        }
        out[color] = color.toLowerCase();
      }
      return out;
    }, rawHoverColors) : {};

    hoverFocusColors.forEach(({ color, property }) => {
      const normalized = hoverColorMap[color] || color.toLowerCase();
      const isDuplicate = colors.palette.some((c) => c.normalized === normalized);
      if (!isDuplicate && color) {
        if (property !== 'background-color') {
          const hex = normalized.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          if (saturation > 0.3) return;
        }
        colors.palette.push({ color, normalized, count: 1, confidence: "medium", sources: ["hover/focus"] });
      }
    });

    spinner.stop();
    console.log(hoverFocusColors.length > 0 ?
      chalk.hex('#50FA7B')(`  ✓ Hover/focus: ${hoverFocusColors.length} state colors found`) :
      chalk.hex('#FFB86C')(`  ⚠ Hover/focus: 0 state colors found`));

    // Dark mode
    if (options.darkMode) {
      spinner.start("Extracting dark mode colors...");
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "dark");
        document.documentElement.setAttribute("data-mode", "dark");
        document.body.setAttribute("data-theme", "dark");
        document.documentElement.classList.add("dark", "dark-mode", "theme-dark");
        document.body.classList.add("dark", "dark-mode", "theme-dark");
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForTimeout(500 * timeoutMultiplier);

      const darkModeColors = await extractColors(page);
      const darkModeButtons = await extractButtonStyles(page);
      const darkModeLinks = await extractLinkStyles(page);

      const mergedPalette = [...colors.palette];
      darkModeColors.palette.forEach((darkColor) => {
        const isDuplicate = mergedPalette.some((c) => c.normalized === darkColor.normalized);
        if (!isDuplicate) mergedPalette.push({ ...darkColor, source: "dark-mode" });
      });
      colors.palette = mergedPalette;
      Object.assign(colors.semantic, darkModeColors.semantic);
      buttons.push(...darkModeButtons.map((btn) => ({ ...btn, source: "dark-mode" })));
      links.push(...darkModeLinks.map((link) => ({ ...link, source: "dark-mode" })));

      spinner.stop();
      console.log(chalk.hex('#50FA7B')(`  ✓ Dark mode: +${darkModeColors.palette.length} colors`));
    }

    // Mobile viewport
    if (options.mobile) {
      spinner.start("Extracting mobile viewport colors...");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500 * timeoutMultiplier);

      const mobileColors = await extractColors(page);
      const mergedPalette = [...colors.palette];
      mobileColors.palette.forEach((mobileColor) => {
        const isDuplicate = mergedPalette.some((c) => c.normalized === mobileColor.normalized);
        if (!isDuplicate) mergedPalette.push({ ...mobileColor, source: "mobile" });
      });
      colors.palette = mergedPalette;

      spinner.stop();
      console.log(chalk.hex('#50FA7B')(`  ✓ Mobile: +${mobileColors.palette.length} colors`));
    }

    spinner.stop();
    console.log();
    console.log(chalk.hex('#50FA7B').bold("✔ Brand extraction complete!"));

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
      siteName,
      logo,
      favicons,
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      gradients,
      components: { buttons, inputs, links, badges },
      breakpoints,
      iconSystem,
      frameworks,
    };

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
      result.note = "This website uses canvas/WebGL rendering. Design system cannot be extracted from DOM.";
      result.isCanvasOnly = true;
    }

    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath, fullPage: false });
    }

    if (options.includeRawColors) {
      result.colors.rawColors = colors._raw || [];
    }

    if (options.discoverLinks) {
      try {
        result._discoveredLinks = await discoverLinks(page, page.url(), options.discoverLinks);
      } catch {
        result._discoveredLinks = [];
      }
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
