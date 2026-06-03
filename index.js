#!/usr/bin/env node

/**
 * Dembrandt - Design Token Extraction CLI
 *
 * Extracts design tokens, brand colors, typography, spacing, and component styles
 * from any website using Playwright.
 */

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { chromium, firefox } from "playwright-core";
import { extractBranding } from "./lib/extractors/index.js";
import { displayResults } from "./lib/formatters/terminal.js";
import { color } from "./lib/formatters/theme.js";
import { toW3CFormat } from "./lib/formatters/w3c.js";
import { generatePDF } from "./lib/formatters/pdf.js";
import { generateDesignMd } from "./lib/formatters/markdown.js";
import { parseSitemap } from "./lib/discovery.js";
import { mergeResults } from "./lib/merger.js";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { checkRobotsTxt } from "./lib/robots.js";
import { writeConfig, printInitSuccess } from "./lib/init.js";
import { extractWithCrawl } from "./lib/crawl.js";
import { computeDrift, DEFAULT_DRIFT_CONFIG } from "./lib/drift.js";
import { existsSync } from "fs";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

program
  .name("dembrandt")
  .description("Extract design tokens from any website")
  .version(version)
  .enablePositionalOptions()
  .argument("<url>")
  .argument("[paths...]", "Additional paths on the same domain to extract and merge, e.g. /pricing /docs")
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
  .option("--screenshot <path>", "Save a viewport screenshot of the page (not full-page)")
  .option("--wcag", "Analyze WCAG contrast ratios between palette colors")
  .option("--crawl [n]", "Auto-discover and extract up to N pages via DOM links (default: 5); combine with --sitemap to use sitemap discovery instead", (v) => {
    if (v === undefined || v === true) return 5;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) throw new Error(`--crawl must be a positive integer, got: ${v}`);
    return n;
  })
  .option("--sitemap", "Discover pages from sitemap.xml instead of DOM links; use alone or combine with --crawl to set page limit")
  .option("--cookie <string>", "Cookie string for authenticated pages, e.g. \"session=abc; token=xyz\"")
  .option("--header <string>", "Extra HTTP header, e.g. \"Authorization: Bearer eyJ...\"")
  .option("--stealth", "Enable anti-detection: navigator spoofing, human mouse simulation, randomized fingerprint (use only when authorized)")
  .option("--user-agent <string>", "Custom user agent string")
  .option("--locale <string>", "Browser locale for fingerprint, e.g. en-GB, fi-FI; affects content only if the site reacts to Accept-Language (default: en-US)")
  .option("--timezone <string>", "Browser timezone for fingerprint, e.g. Europe/Helsinki; affects content only if the site reacts to timezone (default: America/New_York)")
  .option("--accept-language <string>", "Custom Accept-Language header value")
  .option("--screen-size <WxH>", "Physical screen resolution to report, e.g. 1920x1080 (default: 1920x1080)")
  .action(async (input, paths, opts) => {
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
          const crawlN = opts.crawl ?? null;
          const isAutoCrawl = crawlN && !opts.sitemap && (!paths || paths.length === 0);
          const hasExplicitPaths = paths && paths.length > 0;

          result = await extractBranding(url, spinner, browser, {
            navigationTimeout: 90000,
            darkMode: opts.darkMode,
            mobile: opts.mobile,
            slow: opts.slow,
            screenshotPath: opts.screenshot,
            discoverLinks: isAutoCrawl ? crawlN - 1 : null,
            wcag: opts.wcag,
            includeRawColors: opts.rawColors,
            stealth: opts.stealth,
            cookie: opts.cookie,
            header: opts.header,
            userAgent: opts.userAgent,
            locale: opts.locale,
            timezoneId: opts.timezone,
            acceptLanguage: opts.acceptLanguage,
            screenSize: opts.screenSize,
            _version: version,
          });

          // Build list of additional URLs to extract
          let additionalUrls = [];

          if (hasExplicitPaths) {
            // Explicit paths: resolve against base URL
            const base = new URL(result.url);
            additionalUrls = paths.map(p => {
              if (p.startsWith('http')) return p;
              return `${base.protocol}//${base.host}${p.startsWith('/') ? p : '/' + p}`;
            });
          } else if (opts.sitemap) {
            if (!opts.jsonOnly) spinner.start("Fetching sitemap...");
            const max = crawlN ? crawlN - 1 : 20;
            additionalUrls = await parseSitemap(result.url, max);
            if (additionalUrls.length === 0 && result.url !== url) {
              additionalUrls = await parseSitemap(url, max);
            }
          } else if (isAutoCrawl) {
            additionalUrls = result._discoveredLinks || [];
          }

          delete result._discoveredLinks;

          if (additionalUrls.length === 0) {
            if ((hasExplicitPaths || opts.sitemap || isAutoCrawl) && !opts.jsonOnly) {
              spinner.warn("No additional pages discovered");
            }
          } else {
            spinner.stop();
            if (!opts.jsonOnly) console.log(chalk.dim(`  Found ${additionalUrls.length} page(s) to analyze`));

            const allResults = [result];
            for (let i = 0; i < additionalUrls.length; i++) {
              const pageUrl = additionalUrls[i];
              const pageNum = i + 2;
              const total = additionalUrls.length + 1;
              if (!opts.jsonOnly) spinner.start(`Extracting page ${pageNum}/${total}: ${new URL(pageUrl).pathname}`);

              await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

              try {
                const pageResult = await extractBranding(pageUrl, spinner, browser, {
                  navigationTimeout: 90000,
                  darkMode: opts.darkMode,
                  mobile: opts.mobile,
                  slow: opts.slow,
                  stealth: opts.stealth,
                  userAgent: opts.userAgent,
                  locale: opts.locale,
                  timezoneId: opts.timezone,
                  acceptLanguage: opts.acceptLanguage,
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

          if (!hasExplicitPaths && !opts.sitemap && !isAutoCrawl) {
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
              "Navigation failed → retrying with visible browser"
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

      // Collect "saved to" notices and print them after the results below
      const savedNotices = [];

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
          const filename = `${timestamp}_v${version}${suffix}.json`;
          const filepath = join(outputDir, filename);
          writeFileSync(filepath, JSON.stringify(outputData, null, 2));

          const jsonLabel = opts.dtcg
            ? 'DTCG tokens saved (--dtcg)'
            : 'JSON saved (--save-output)';
          savedNotices.push(
            chalk.dim(
              `💾 ${jsonLabel}: ${color.info(
                `output/${domain}/${filename}`
              )}`
            )
          );
        } catch (err) {
          console.log(
            color.warning(`! Could not save JSON file: ${err.message}`)
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
          savedNotices.push(
            chalk.dim(
              `💾 Brand guide PDF saved (--brand-guide): ${color.info(
                `output/${pdfDomain}/${pdfFilename}`
              )}`
            )
          );
        } catch (err) {
          spinner.stop();
          console.log(
            color.warning(`Could not generate PDF: ${err.message}`)
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
          savedNotices.push(
            chalk.dim(
              `💾 DESIGN.md saved (--design-md): ${color.info(
                `output/${mdDomain}/DESIGN.md`
              )}`
            )
          );
        } catch (err) {
          console.log(
            color.warning(`Could not generate DESIGN.md: ${err.message}`)
          );
        }
      }

      // Output to terminal
      const summaryLine =
        color.accent('✨ Analysis summary: ') +
        chalk.dim(
          `${result.colors?.palette?.length ?? 0} colors, ` +
          `${result.typography?.styles?.length ?? 0} text styles, ` +
          `${result.breakpoints?.length ?? 0} breakpoints.`
        );
      if (opts.jsonOnly) {
        console.log = originalConsoleLog;
        console.log(JSON.stringify(outputData, null, 2));
        // Keep stdout pure JSON: summary and notices go to stderr
        console.error(summaryLine);
        for (const notice of savedNotices) console.error(notice);
      } else {
        console.log();
        displayResults(result);
        console.log();
        console.log(summaryLine);
        for (const notice of savedNotices) console.log(notice);
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

program
  .command("init <url>")
  .description("Save extracted tokens as project baseline (.dembrandtrc + tokens.json)")
  .option("--slow", "3x longer timeouts for slow-loading sites")
  .option("--mobile", "Extract from mobile viewport")
  .option("--stealth", "Enable anti-detection (use only when authorized)")
  .option("--crawl [n]", "Extract up to N pages and merge before saving baseline (default: 5)", (v) => {
    if (v === undefined || v === true) return 5;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) throw new Error(`--crawl must be a positive integer, got: ${v}`);
    return n;
  })
  .option("--sitemap", "Discover pages from sitemap.xml instead of DOM links")
  .option("--cookie <string>", "Cookie string for authenticated pages")
  .option("--header <string>", "Extra HTTP header, e.g. \"Authorization: Bearer eyJ...\"")
  .action(async (input, opts) => {
    let url = input;
    if (!url) {
      console.error(chalk.red("  Usage: dembrandt init <url>"));
      process.exit(1);
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const spinner = ora("Extracting design tokens...").start();
    let browser;

    try {
      browser = await chromium.launch({ headless: true });
      const result = await extractWithCrawl(url, spinner, browser, {
        slow: opts.slow,
        mobile: opts.mobile,
        stealth: opts.stealth,
        cookie: opts.cookie,
        header: opts.header,
        crawl: opts.crawl ?? null,
        sitemap: opts.sitemap ?? false,
      });

      spinner.succeed(`Extracted ${new URL(url).hostname}`);

      const extractedUrls = result._extractedUrls ?? [url];
      delete result._extractedUrls;
      const info = writeConfig(url, result, extractedUrls);
      printInitSuccess(info);
    } catch (err) {
      spinner.fail("Extraction failed");
      console.error(chalk.red(`  ${err.message}`));
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  });

program
  .command("drift")
  .description("Compare live site against .dembrandtrc baseline and report changes")
  .option("--url <url>", "Override the baseline URL (e.g. point at staging)")
  .option("--slow", "3x longer timeouts")
  .option("--mobile", "Extract from mobile viewport")
  .option("--json", "Output raw JSON report")
  .option("--threshold <n>", "Fail if drift score exceeds this (default: 10)", (v) => parseInt(v, 10))
  .option("--quick", "Extract only the primary page, skip additional pages in the baseline")
  .option("--cookie <string>", "Cookie string for authenticated pages")
  .option("--header <string>", "Extra HTTP header, e.g. \"Authorization: Bearer eyJ...\"")
  .action(async (opts) => {
    const configPath = join(process.cwd(), ".dembrandt/config.json");
    if (!existsSync(configPath)) {
      console.error(chalk.red("  No .dembrandt/config.json found. Run `dembrandt init <url>` first."));
      process.exit(1);
    }

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const baseUrl = opts.url ?? config.baseline;
    if (!baseUrl) {
      console.error(chalk.red("  No baseline URL in .dembrandtrc."));
      process.exit(1);
    }

    // Warn if baseline is stale
    if (config.extractedAt) {
      const age = (Date.now() - new Date(config.extractedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (age > 30) {
        console.log(chalk.yellow(`  ⚠ Baseline is ${Math.round(age)} days old. Run \`dembrandt init\` to refresh.`));
      }
    }

    // Re-extract the same pages that were used to build the baseline
    const configPages = config.pages ?? ["/"];
    const primaryUrl = configPages[0] === "/"
      ? baseUrl
      : `${new URL(baseUrl).origin}${configPages[0]}`;
    const additionalPaths = opts.quick ? [] : configPages.slice(1);

    const threshold = opts.threshold ?? config.thresholds?.failThreshold ?? DEFAULT_DRIFT_CONFIG.failThreshold;
    const stdoutLog = console.log.bind(console);
    if (opts.json) console.log = (...args) => console.error(...args);
    const spinner = ora({ text: `Extracting ${new URL(baseUrl).hostname}...`, stream: opts.json ? process.stderr : process.stdout }).start();
    let browser;

    try {
      browser = await chromium.launch({ headless: true });
      const candidate = await extractWithCrawl(primaryUrl, spinner, browser, {
        slow: opts.slow,
        mobile: opts.mobile,
        cookie: opts.cookie,
        header: opts.header,
        paths: additionalPaths,
      });
      spinner.succeed(`Extracted ${new URL(baseUrl).hostname}`);

      const snapshotPath = join(process.cwd(), ".dembrandt/snapshot.yaml");
      if (!existsSync(snapshotPath)) {
        console.error(chalk.red("  .dembrandt/snapshot.yaml not found. Re-run `dembrandt init`."));
        process.exit(1);
      }
      const snap = yaml.load(readFileSync(snapshotPath, "utf8"));

      // Reconstruct ExtractionResult shape from snapshot for drift engine
      const baseline = {
        colors: {
          palette: (snap.palette ?? []).map((entry) => {
            const hex = entry.split("  #")[0].replace(/"/g, "").trim();
            const roleMatch = entry.match(/role:(\w+)/);
            const countMatch = entry.match(/count:(\d+)/);
            return { normalized: hex, color: hex, role: roleMatch?.[1], count: countMatch ? parseInt(countMatch[1]) : 1 };
          }),
        },
        typography: { styles: (snap.typography ?? []).map((s) => ({ context: s.context, family: s.family, size: s.size, weight: String(s.weight) })) },
        spacing: { commonValues: (snap.spacing ?? []).map((px) => ({ px })) },
        borderRadius: { values: (snap.borderRadius ?? []).map((value) => ({ value })) },
        shadows: (snap.shadows ?? []).map((shadow) => ({ shadow })),
      };

      const report = computeDrift(baseline, candidate, {
        failThreshold: threshold,
        ignore: config.ignore ?? {},
      });

      if (opts.json) {
        stdoutLog(JSON.stringify(report, null, 2));
        process.exit(report.status === "drift" ? 1 : 0);
      }

      printDriftReport(report, config, baseUrl);
      process.exit(report.status === "drift" ? 1 : 0);
    } catch (err) {
      spinner.fail("Failed");
      console.error(chalk.red(`  ${err.message}`));
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  });

function printDriftReport(report, config, url) {
  const domain = new URL(url).hostname.replace("www.", "");
  const since = config.extractedAt ? new Date(config.extractedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "baseline";

  console.log("");

  if (report.status === "stable") {
    console.log(chalk.green(`  ✓ Stable`) + chalk.dim(`  score ${report.score}/${report.threshold}  —  ${domain} matches baseline (${since})`));
  } else {
    console.log(chalk.red(`  ✗ Drift detected`) + chalk.dim(`  score ${report.score}/${report.threshold}  —  ${domain} vs baseline (${since})`));
  }

  if (report.changes.length === 0) {
    console.log(chalk.dim("\n  No token changes."));
    console.log("");
    return;
  }

  const byCategory = {};
  for (const c of report.changes) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  console.log("");
  for (const [cat, changes] of Object.entries(byCategory)) {
    console.log(chalk.dim(`  ${cat}`));
    for (const c of changes) {
      const kindColor = c.kind === "added" ? chalk.green : c.kind === "removed" ? chalk.red : chalk.yellow;
      const kindSymbol = c.kind === "added" ? "+" : c.kind === "removed" ? "-" : "~";
      let line = `    ${kindColor(kindSymbol)} ${c.label}`;
      if (c.before && c.after) line += chalk.dim(`  ${c.before} → ${c.after}`);
      if (c.delta !== undefined) line += chalk.dim(`  Δ${c.delta}`);
      console.log(line);
    }
    console.log("");
  }

  const { changed, added, removed } = report.summary;
  const parts = [changed && `${changed} changed`, added && `${added} added`, removed && `${removed} removed`].filter(Boolean);
  console.log(chalk.dim(`  ${parts.join(", ")}`));
  console.log("");
}

program.parse();
