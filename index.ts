#!/usr/bin/env node

/**
 * Dembrandt - Design Token Extraction CLI
 *
 * Extracts design tokens, brand colors, typography, spacing, and component styles
 * from any website using Playwright.
 */

import { program, Option } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadBrowserEngines } from "./lib/browser.js";
import { extractBranding } from "./lib/extractors/index.js";
import { displayResults } from "./lib/formatters/terminal.js";
import { color } from "./lib/formatters/theme.js";
import { toDtcgTokens } from "./lib/formatters/dtcg.js";
import { generatePDF } from "./lib/formatters/pdf.js";
import { generateDesignMd } from "./lib/formatters/markdown.js";
import { generateHtmlReport } from "./lib/formatters/html.js";
import { resolveCompare } from "./lib/compare.js";
import { emitDriftAnnotations } from "./lib/ci-annotations.js";
import { parseSitemap } from "./lib/discovery.js";
import { mergeResults } from "./lib/merger.js";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { checkRobotsTxt } from "./lib/robots.js";
import { EXIT, classifyError } from "./lib/exit-codes.js";
import { activeFlags, pathSummary } from "./lib/run-summary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

/**
 * ora options for a spinner on the given stream. The spinner animates only on
 * a real interactive terminal: a non-TTY (piped) or CI environment gets the
 * final status lines without the frame churn that garbles logs. Some CI runners
 * allocate a pseudo-TTY, so we check CI explicitly rather than rely on isTTY.
 */
function spinnerOptions(useStderr = false) {
  const stream = useStderr ? process.stderr : process.stdout;
  return { stream, isEnabled: Boolean(stream.isTTY) && !process.env.CI };
}

program
  .name("dembrandt")
  .description("Extract design tokens from any website.")
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
  .option("--html [path]", "Write a self-contained HTML report (default: output/<domain>/<timestamp>.html)")
  .option("--compare <baseline>", "Drift-compare against a baseline: a local JSON file, or an App baseline id (posts to the .dembrandtrc endpoint, default dembrandt.com). Exits 1 on drift.")
  .option("--approve", "With --compare <file>: accept the current extraction as the new baseline by overwriting that local file, and pass instead of failing. Ignored for App baseline ids.")
  .option("--no-sandbox", "Disable browser sandbox (needed for Docker/CI)")
  .option("--raw-colors", "Include pre-filter raw colors in JSON output")
  .option("--screenshot <path>", "Save a viewport screenshot of the page (not full-page)")
  // Internal, undocumented flag. Hidden from --help; not part of the product surface.
  .addOption(new Option("--teach").hideHelp())
  .option("--ai", "Use ML model to predict brand primary color (experimental)")
  .option("--wcag", "Analyze WCAG contrast ratios between palette colors")
  .option("--crawl [n]", "Auto-discover and extract up to N pages via DOM links (default: 5); combine with --sitemap to use sitemap discovery instead", (v: any) => {
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
  .option("--key <string>", "Dembrandt API key for syncing extractions to your account (falls back to DEMBRANDT_KEY env var)")
  .option("--screen-size <WxH>", "Physical screen resolution to report, e.g. 1920x1080 (default: 1920x1080)")
  .action(async (input, paths, opts) => {
    let url = input;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    // Resolve API key: --key flag takes precedence over env var
    const apiKey: string | undefined = opts.key ?? process.env.DEMBRANDT_KEY;

    if (opts.approve && !opts.compare) {
      console.error(color.warning("! --approve has no effect without --compare <file>."));
    }

    // In --json-only mode, redirect all status output to stderr so stdout is clean JSON
    const originalConsoleLog = console.log;
    if (opts.jsonOnly) {
      console.log = (...args) => console.error(...args);
    }

    const spinner = ora({ text: "Starting extraction...", ...spinnerOptions(opts.jsonOnly) }).start();

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

    let chromium, firefox;
    try {
      ({ chromium, firefox } = await loadBrowserEngines());
    } catch (err) {
      spinner.fail(err.message);
      if (opts.jsonOnly) {
        console.log = originalConsoleLog;
        console.log(JSON.stringify({ url, error: { code: "BROWSER_UNAVAILABLE", message: err.message } }, null, 2));
      }
      process.exit(EXIT.RUNTIME);
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
            verbose: !opts.jsonOnly,
            darkMode: opts.darkMode,
            mobile: opts.mobile,
            reveal: !process.env.DEMBRANDT_DISABLE_REVEAL,
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
            teach: opts.teach,
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
                  verbose: !opts.jsonOnly,
                  darkMode: opts.darkMode,
                  mobile: opts.mobile,
                  reveal: !process.env.DEMBRANDT_DISABLE_REVEAL,
                  slow: opts.slow,
                  stealth: opts.stealth,
                  cookie: opts.cookie,
                  header: opts.header,
                  screenSize: opts.screenSize,
                  wcag: opts.wcag,
                  includeRawColors: opts.rawColors,
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

      // ML primary prediction (--ai flag, experimental)
      if (opts.ai && result.colors?.palette?.length) {
        try {
          const { predictPrimary, modelMeta } = await import('./lib/ml/runtime.js');
          const meta = modelMeta();
          const prediction = await predictPrimary(result as any);
          if (prediction) {
            result.colors.semantic = result.colors.semantic ?? {};
            result.colors.semantic.primary = prediction.hex;
            if (!opts.jsonOnly) {
              const acc = meta?.metrics?.leave_one_site_out_top1;
              const accStr = acc != null ? ` · ${(acc * 100).toFixed(0)}% acc` : '';
              console.error(chalk.dim(`  ⚡ ML primary → ${prediction.hex} (score ${prediction.score.toFixed(2)}${accStr})`));
            }
          }
        } catch (e: any) {
          if (!opts.jsonOnly) console.error(chalk.dim(`  ⚡ ML skipped: ${e.message}`));
        }
      }

      // Strip raw colors unless --raw-colors flag is set
      if (!opts.rawColors && result.colors && result.colors.rawColors) {
        delete result.colors.rawColors;
      }

      // Pull the internal payload off the result before it can reach stdout or
      // the normal saved output, and write it to its own sidecar.
      const teachData = (result as any)._teach;
      delete (result as any)._teach;
      if (opts.teach && teachData) {
        try {
          const tDomain = new URL(url).hostname.replace("www.", "");
          const tStamp = new Date().toISOString().replace(/[:.]/g, "-").split(".")[0];
          const tDir = join(process.cwd(), "output", tDomain);
          mkdirSync(tDir, { recursive: true });
          const tFile = `${tStamp}_v${version}.teach.json`;
          writeFileSync(join(tDir, tFile), JSON.stringify({ url: result.url, extractedAt: new Date().toISOString(), ...teachData }, null, 2));
          if (!opts.jsonOnly) console.error(chalk.dim(`  teach → output/${tDomain}/${tFile}`));
        } catch { /* non-fatal */ }
      }

      // Convert to W3C format if requested
      const outputData = opts.dtcg ? toDtcgTokens(result) : result;

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

          // The two flags are orthogonal: --save-output writes the raw
          // extraction, --dtcg writes the tokens file. Both flags = both files.
          const saves = [];
          if (opts.saveOutput) saves.push({ data: result, suffix: '', label: 'JSON saved (--save-output)' });
          if (opts.dtcg) saves.push({ data: outputData, suffix: '.tokens', label: 'DTCG tokens saved (--dtcg)' });
          for (const { data, suffix, label } of saves) {
            const filename = `${timestamp}_v${version}${suffix}.json`;
            writeFileSync(join(outputDir, filename), JSON.stringify(data, null, 2));
            savedNotices.push(
              chalk.dim(
                `💾 ${label}: ${color.info(
                  `output/${domain}/${filename}`
                )}`
              )
            );
          }
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

      // Compare against a baseline: a local file (free, offline) or an App
      // baseline id (platform). resolveCompare dispatches on file-vs-id.
      let driftReport;
      if (opts.compare) {
        try {
          // The App endpoint for baseline-id compares comes from .dembrandtrc.
          let apiBase;
          try {
            const rc = JSON.parse(readFileSync(join(process.cwd(), ".dembrandtrc"), "utf-8"));
            if (typeof rc.endpoint === "string") apiBase = rc.endpoint;
          } catch { /* no .dembrandtrc, or unreadable — use the default */ }
          const { report, source, mode } = await resolveCompare(opts.compare, result, apiBase ? { api: apiBase } : {});
          driftReport = report;
          const verdict = report.status === "drift"
            ? color.warning(`drift ${report.score} (threshold ${report.threshold})`)
            : color.accent(`stable ${report.score}`);
          savedNotices.push(
            chalk.dim(
              `⟂ Drift vs ${source} (${mode}): ${verdict} — ` +
              `${report.summary.changed} changed, ${report.summary.added} added, ${report.summary.removed} removed`
            )
          );
          for (const w of report.warnings ?? []) {
            savedNotices.push(color.warning(`! ${w}`));
          }
          // --approve: accept the current extraction as the new baseline.
          // Only local files can be overwritten; App baseline ids are read-only.
          if (opts.approve) {
            if (mode === "local") {
              writeFileSync(resolve(process.cwd(), source), JSON.stringify(result, null, 2));
              savedNotices.push(
                chalk.dim(`✓ Baseline accepted (--approve): ${color.info(source)}`)
              );
              // Accepted — pass the run regardless of drift.
            } else {
              savedNotices.push(
                color.warning("! --approve only updates local baseline files, not App baseline ids — drift stands.")
              );
              if (report.status === "drift") process.exitCode = EXIT.DRIFT;
            }
          } else if (report.status === "drift") {
            // CI gate: drift fails the run, but the report still writes first.
            process.exitCode = EXIT.DRIFT;
          }
          // Under GitHub Actions, surface a failing drift gate inline on the PR
          // via workflow-command annotations (DEM-83). No-op locally. Gated on
          // the gate actually failing, so an --approve'd local baseline (which
          // passes despite a drift report) emits nothing.
          if (process.exitCode === EXIT.DRIFT) emitDriftAnnotations(report);
        } catch (err) {
          // A gate that cannot evaluate its baseline must not pass: exit RUNTIME
          // ("check broke, investigate") so CI distinguishes this from stable (0)
          // and from real drift (1). See lib/exit-codes.ts.
          console.log(color.warning(`! Could not compare against baseline: ${err.message}`));
          process.exitCode = EXIT.RUNTIME;
        }
      }

      // Generate self-contained HTML report
      if (opts.html !== undefined) {
        try {
          const htmlDomain = new URL(url).hostname.replace("www.", "");
          let htmlPath;
          if (typeof opts.html === "string") {
            htmlPath = resolve(process.cwd(), opts.html);
            mkdirSync(dirname(htmlPath), { recursive: true });
          } else {
            const htmlStamp = new Date().toISOString().replace(/[:.]/g, "-").split(".")[0];
            const htmlDir = join(process.cwd(), "output", htmlDomain);
            mkdirSync(htmlDir, { recursive: true });
            htmlPath = join(htmlDir, `${htmlStamp}_v${version}.html`);
          }
          writeFileSync(
            htmlPath,
            generateHtmlReport(result, {
              version,
              drift: driftReport,
              baselineLabel: opts.compare,
            })
          );
          const htmlLabel = typeof opts.html === "string" ? opts.html : `output/${htmlDomain}/${htmlPath.split("/").pop()}`;
          savedNotices.push(
            chalk.dim(`💾 HTML report saved (--html): ${color.info(htmlLabel)}`)
          );
        } catch (err) {
          console.log(color.warning(`! Could not write HTML report: ${err.message}`));
        }
      }

      // Sync to cloud if --key / DEMBRANDT_KEY is set
      if (apiKey) {
        try {
          const payload = JSON.stringify(result);
          const byteSize = Buffer.byteLength(payload, "utf8");
          const MAX_BYTES = 150_000;
          if (byteSize > MAX_BYTES) {
            console.error(color.warning(`! Extraction too large to sync (${byteSize} bytes > ${MAX_BYTES}). Skipping cloud upload.`));
          } else {
            const apiBase = process.env.DEMBRANDT_API_URL ?? "https://www.dembrandt.com";
            const syncRes = await fetch(`${apiBase}/api/extractions`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: payload,
            });
            if (syncRes.ok) {
              savedNotices.push(chalk.dim(`☁  Synced to your account (--key)`));
            } else {
              const err = await syncRes.json().catch(() => ({ error: syncRes.statusText }));
              console.error(color.warning(`! Cloud sync failed: ${err.error ?? syncRes.statusText}`));
            }
          }
        } catch (syncErr) {
          console.error(color.warning(`! Cloud sync error: ${syncErr.message}`));
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

      // Surface what shaped this run (DEM-99) — active flags and merged paths —
      // so the summary confirms what was asked for, not just what was extracted.
      const flagBits = activeFlags(opts);
      const flagsLine = flagBits.length ? chalk.dim(`   Flags: ${flagBits.join(' ')}`) : null;
      const pathBits = pathSummary(paths, result.pages?.length ?? 0);
      const pathsLine = pathBits.length ? chalk.dim(`   Paths: ${pathBits.join(' ')}`) : null;

      if (opts.jsonOnly) {
        console.log = originalConsoleLog;
        // Attach the drift report to the JSON stream (only here, so --save-output
        // and baseline files stay pure extractions). Lets consumers — e.g. a CI
        // gate posting a PR comment — read the per-token changes machine-readably
        // instead of scraping the HTML report.
        const jsonOut = driftReport ? { ...outputData, drift: driftReport } : outputData;
        console.log(JSON.stringify(jsonOut, null, 2));
        console.error(summaryLine);
        if (pathsLine) console.error(pathsLine);
        if (flagsLine) console.error(flagsLine);
        for (const notice of savedNotices) console.error(notice);
      } else {
        console.log();
        displayResults(result);
        console.log();
        console.log(summaryLine);
        if (pathsLine) console.log(pathsLine);
        if (flagsLine) console.log(flagsLine);
        for (const notice of savedNotices) console.log(notice);
      }
    } catch (err) {
      const { code, exit } = classifyError(err);
      spinner.fail("Failed");
      if (opts.jsonOnly) {
        console.log = originalConsoleLog;
        console.log(JSON.stringify({ url, error: { code, message: err.message } }, null, 2));
      } else {
        console.error(chalk.red("\n✗ Extraction failed"));
        console.error(chalk.red(`  Error [${code}]: ${err.message}`));
        console.error(chalk.dim(`  URL: ${url}`));
        if (exit === EXIT.TIMEOUT) console.error(chalk.dim("  Hint: retry with --slow"));
      }
      process.exit(exit);
    } finally {
      if (browser) await browser.close();
    }
  });

// Grouped --help for the root command. Commander 11 has no native option groups,
// so render them via a custom formatHelp. Subcommands keep a single flat list.
const OPTION_GROUPS = [
  ["Extraction", ["--dark-mode", "--mobile", "--slow", "--crawl", "--sitemap", "--browser"]],
  ["Output & export", ["--json-only", "--save-output", "--dtcg", "--brand-guide", "--design-md", "--html", "--screenshot", "--raw-colors"]],
  ["Analysis", ["--wcag", "--compare", "--approve"]],
  ["Network & auth", ["--cookie", "--header", "--user-agent", "--locale", "--timezone", "--accept-language", "--screen-size"]],
  ["Anti-detection", ["--stealth", "--no-sandbox"]],
];

program.configureHelp({
  formatHelp(cmd, helper) {
    const helpWidth = helper.helpWidth ?? 80;
    const termWidth = helper.padWidth(cmd, helper);
    const indent = 2;

    const item = (term, desc) => {
      if (!desc) return term;
      const full = `${term.padEnd(termWidth + 2)}${desc}`;
      return helper.wrap(full, helpWidth - indent, termWidth + 2);
    };
    const block = (lines) => lines.map((l) => " ".repeat(indent) + l).join("\n");

    const out = [`Usage: ${helper.commandUsage(cmd)}`, ""];
    const description = helper.commandDescription(cmd);
    if (description) out.push(description, "");

    const args = helper.visibleArguments(cmd);
    if (args.length) {
      out.push("Arguments:", block(args.map((a) => item(helper.argumentTerm(a), helper.argumentDescription(a)))), "");
    }

    const options = helper.visibleOptions(cmd);
    if (options.length) {
      if (cmd.parent) {
        out.push("Options:", block(options.map((o) => item(helper.optionTerm(o), helper.optionDescription(o)))), "");
      } else {
        const byLong = new Map(options.map((o) => [o.long ?? o.short, o]));
        const used = new Set();
        for (const [title, flags] of OPTION_GROUPS) {
          const groupOpts = (flags as any[]).map((f: any) => byLong.get(f)).filter(Boolean);
          if (!groupOpts.length) continue;
          groupOpts.forEach((o) => used.add(o));
          out.push(`${title}:`, block(groupOpts.map((o) => item(helper.optionTerm(o), helper.optionDescription(o)))), "");
        }
        const rest = options.filter((o) => !used.has(o));
        if (rest.length) {
          out.push("General:", block(rest.map((o) => item(helper.optionTerm(o), helper.optionDescription(o)))), "");
        }
      }
    }

    const commands = helper.visibleCommands(cmd);
    if (commands.length) {
      out.push("Commands:", block(commands.map((c) => item(helper.subcommandTerm(c), helper.subcommandDescription(c)))), "");
    }

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  },
});

program.parse();
