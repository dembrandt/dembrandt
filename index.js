#!/usr/bin/env node

/**
 * Dembrandt - Design Token Extraction CLI
 *
 * Extracts design tokens, brand colors, typography, spacing, and component styles
 * from any website using Playwright with advanced bot detection avoidance.
 */

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { chromium, firefox } from "playwright-core";
import { extractBranding } from "./lib/extractors.js";
import { displayResults } from "./lib/display.js";
import { toW3CFormat } from "./lib/w3c-exporter.js";
import { generatePDF } from "./lib/pdf.js";
import { generateDesignMd } from "./lib/design-md.js";
import { parseSitemap } from "./lib/discovery.js";
import { mergeResults } from "./lib/merger.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { checkRobotsTxt } from "./lib/robots.js";

program
  .name("dembrandt")
  .description("Extract design tokens from any website")
  .version("0.11.0")
  .argument("<url>")
  .option("--browser <type>", "Browser to use (chromium|firefox); set BROWSER_CDP_ENDPOINT env var to connect to an existing Chromium instance via CDP", "chromium")
  .option("--json-only", "Output raw JSON")
  .option("--save-output", "Save JSON file to output folder")
  .option("--dtcg", "Export in W3C Design Tokens (DTCG) format")
  .option("--dark-mode", "Extract colors from dark mode")
  .option("--mobile", "Extract from mobile viewport")
  .option("--slow", "3x longer timeouts for slow-loading sites")
  .option("--brand-guide", "Export a brand guide PDF")
  .option("--design-md", "Export a DESIGN.md file")
  .option("--no-sandbox", "Disable browser sandbox (needed for Docker/CI)")
  .option("--raw-colors", "Include pre-filter raw colors in JSON output")
  .option("--screenshot <path>", "Save a screenshot of the page")
  .option("--pages <n>", "Analyze up to N total pages including start URL (default: 5)", (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) throw new Error(`--pages must be a positive integer, got: ${v}`);
    return n;
  })
  .option("--sitemap", "Discover pages from sitemap.xml instead of DOM links")
  .action(async (input, opts) => {
    let url = input;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    // In --json-only mode, redirect all status output to stderr so stdout is clean JSON
    const originalConsoleLog = console.log;
    if (opts.jsonOnly) {
      console.log = (...args) => console.error(...args);
    }

    const spinner = ora({ text: "Starting extraction...", stream: opts.jsonOnly ? process.stderr : process.stdout }).start();

    try {
      const robots = await checkRobotsTxt(url);
      if (robots.status === "ok" && robots.allowed === false) {
        spinner.warn(
          chalk.hex("#FFB86C")(
            `robots.txt disallows this path (rule: "${robots.rule}"). Proceeding anyway — respect the site's terms.`
          )
        );
        spinner.start("Starting extraction...");
      }
    } catch {
      // robots check is advisory; never block extraction
    }

    let browser = null;

    try {
      let useHeaded = false;
      let result;

      while (true) {
        // Select browser type based on --browser flag
        const browserType = opts.browser === 'firefox' ? firefox : chromium;

        spinner.text = `Launching browser (${useHeaded ? "visible" : "headless"
          } mode)`;
        // Firefox-specific launch args (Firefox doesn't support Chromium flags)
        const launchArgs = opts.browser === 'firefox'
          ? [] // Firefox has different flags
          : ["--disable-blink-features=AutomationControlled"];

        if (opts.noSandbox && opts.browser === 'chromium') {
          launchArgs.push("--no-sandbox", "--disable-setuid-sandbox");
        }
        if (process.env.BROWSER_CDP_ENDPOINT) {
          if (opts.browser !== 'chromium') {
            throw new Error("BROWSER_CDP_ENDPOINT is only supported with --browser chromium.");
          }
          spinner.text = "Connecting over CDP...";
          browser = await browserType.connectOverCDP(process.env.BROWSER_CDP_ENDPOINT);
        } else {
          browser = await browserType.launch({
            headless: !useHeaded,
            args: launchArgs,
          });
        }

        try {
          const isMultiPage = opts.pages || opts.sitemap;
          const maxPages = (opts.pages || 5) - 1; // -1 because homepage counts
          result = await extractBranding(url, spinner, browser, {
            navigationTimeout: 90000,
            darkMode: opts.darkMode,
            mobile: opts.mobile,
            slow: opts.slow,
            screenshotPath: opts.screenshot,
            discoverLinks: isMultiPage && !opts.sitemap ? maxPages : null,
          });

          // Multi-page crawl
          if (isMultiPage && maxPages > 0) {
            if (!opts.jsonOnly) spinner.start("Discovering pages...");

            let additionalUrls;
            if (opts.sitemap) {
              // Try post-redirect URL first, fall back to user-provided URL
              // (some sites redirect to a subdomain while the sitemap stays on www)
              additionalUrls = await parseSitemap(result.url, maxPages);
              if (additionalUrls.length === 0 && result.url !== url) {
                additionalUrls = await parseSitemap(url, maxPages);
              }
            } else {
              additionalUrls = result._discoveredLinks || [];
            }

            delete result._discoveredLinks;

            if (additionalUrls.length === 0) {
              if (!opts.jsonOnly) spinner.warn("No additional pages discovered");
            } else {
              spinner.stop();
              if (!opts.jsonOnly) console.log(chalk.dim(`  Found ${additionalUrls.length} page(s) to analyze`));

              const allResults = [result];
              for (let i = 0; i < additionalUrls.length; i++) {
                const pageUrl = additionalUrls[i];
                const pageNum = i + 2;
                const total = additionalUrls.length + 1;
                if (!opts.jsonOnly) spinner.start(`Extracting page ${pageNum}/${total}: ${new URL(pageUrl).pathname}`);

                // Polite delay between pages
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

                try {
                  const pageResult = await extractBranding(pageUrl, spinner, browser, {
                    navigationTimeout: 90000,
                    darkMode: opts.darkMode,
                    mobile: opts.mobile,
                    slow: opts.slow,
                  });
                  delete pageResult._discoveredLinks;
                  allResults.push(pageResult);
                } catch (err) {
                  if (!opts.jsonOnly) spinner.warn(`Skipping ${pageUrl}: ${String(err?.message || err).slice(0, 80)}`);
                }
              }

              spinner.stop();
              result = mergeResults(allResults);
            }
          } else {
            delete result._discoveredLinks;
          }

          break;
        } catch (err) {
          await browser.close();
          browser = null;

          if (useHeaded || process.env.BROWSER_CDP_ENDPOINT) throw err;

          if (
            err.message.includes("Timeout") ||
            err.message.includes("net::ERR_")
          ) {
            spinner.warn(
              "Bot detection detected → retrying with visible browser"
            );
            console.error(chalk.dim(`  ↳ Error: ${err.message}`));
            console.error(chalk.dim(`  ↳ URL: ${url}`));
            console.error(chalk.dim(`  ↳ Mode: headless`));
            useHeaded = true;
            continue;
          }
          throw err;
        }
      }

      console.log();

      // Strip raw colors unless --raw-colors flag is set
      if (!opts.rawColors && result.colors && result.colors.rawColors) {
        delete result.colors.rawColors;
      }

      // Convert to W3C format if requested
      const outputData = opts.dtcg ? toW3CFormat(result) : result;

      // Save JSON output if --save-output or --dtcg is specified
      if (opts.saveOutput || opts.dtcg) {
        try {
          const domain = new URL(url).hostname.replace("www.", "");
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .split(".")[0];
          // Save to current working directory, not installation directory
          const outputDir = join(process.cwd(), "output", domain);
          mkdirSync(outputDir, { recursive: true });

          const suffix = opts.dtcg ? '.tokens' : '';
          const filename = `${timestamp}${suffix}.json`;
          const filepath = join(outputDir, filename);
          writeFileSync(filepath, JSON.stringify(outputData, null, 2));

          console.log(
            chalk.dim(
              `💾 JSON saved to: ${chalk.hex('#8BE9FD')(
                `output/${domain}/${filename}`
              )}`
            )
          );
        } catch (err) {
          console.log(
            chalk.hex('#FFB86C')(`⚠ Could not save JSON file: ${err.message}`)
          );
        }
      }

      // Generate PDF brand guide
      if (opts.brandGuide) {
        try {
          const pdfDomain = new URL(url).hostname.replace("www.", "");
          const now = new Date();
          const pdfDate = now.toISOString().slice(0, 10);
          const pdfTime = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
          const pdfDir = join(process.cwd(), "output", pdfDomain);
          mkdirSync(pdfDir, { recursive: true });
          const pdfFilename = `${pdfDomain}-brand-guide-${pdfDate}-${pdfTime}.pdf`;
          const pdfPath = join(pdfDir, pdfFilename);
          spinner.start("Generating PDF brand guide...");
          await generatePDF(result, pdfPath, browser);
          spinner.stop();
          console.log(
            chalk.dim(
              `PDF saved to: ${chalk.hex('#8BE9FD')(
                `output/${pdfDomain}/${pdfFilename}`
              )}`
            )
          );
        } catch (err) {
          spinner.stop();
          console.log(
            chalk.hex('#FFB86C')(`Could not generate PDF: ${err.message}`)
          );
        }
      }

      // Generate DESIGN.md
      if (opts.designMd) {
        try {
          const mdDomain = new URL(url).hostname.replace("www.", "");
          const mdDir = join(process.cwd(), "output", mdDomain);
          mkdirSync(mdDir, { recursive: true });
          const mdPath = join(mdDir, "DESIGN.md");
          writeFileSync(mdPath, generateDesignMd(result));
          console.log(
            chalk.dim(
              `DESIGN.md saved to: ${chalk.hex('#8BE9FD')(
                `output/${mdDomain}/DESIGN.md`
              )}`
            )
          );
        } catch (err) {
          console.log(
            chalk.hex('#FFB86C')(`Could not generate DESIGN.md: ${err.message}`)
          );
        }
      }

      // Output to terminal
      if (opts.jsonOnly) {
        console.log = originalConsoleLog;
        console.log(JSON.stringify(outputData, null, 2));
      } else {
        console.log();
        displayResults(result);
      }
    } catch (err) {
      spinner.fail("Failed");
      console.error(chalk.red("\n✗ Extraction failed"));
      console.error(chalk.red(`  Error: ${err.message}`));
      console.error(chalk.dim(`  URL: ${url}`));
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  });

program.parse();
