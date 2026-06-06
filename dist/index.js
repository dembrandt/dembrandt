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
import { toDtcgTokens } from "./lib/formatters/dtcg.js";
import { generatePDF } from "./lib/formatters/pdf.js";
import { generateDesignMd } from "./lib/formatters/markdown.js";
import { parseSitemap } from "./lib/discovery.js";
import { mergeResults } from "./lib/merger.js";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { checkRobotsTxt } from "./lib/robots.js";
import { writeConfig, printInitSuccess, pageSnapshotName, buildSnapshot, buildSnapshotYaml } from "./lib/init.js";
import { lint } from "./lib/lint.js";
import { extractWithCrawl } from "./lib/crawl.js";
import { computeDrift, DEFAULT_DRIFT_CONFIG } from "./lib/drift.js";
import { computeConformance, DEFAULT_CONFORMANCE_CONFIG, designTokensToContract } from "./lib/conformance.js";
import { existsSync } from "fs";
import yaml from "js-yaml";
const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));
/**
 * Read the `lint` section from .dembrandt/config.json if present.
 * Returns {} when no config exists or it cannot be parsed, so lint falls
 * back to built-in defaults.
 */
function loadLintConfig() {
    const configPath = join(process.cwd(), ".dembrandt", "config.json");
    if (!existsSync(configPath))
        return {};
    try {
        const config = JSON.parse(readFileSync(configPath, "utf8"));
        return config?.lint && typeof config.lint === "object" ? config.lint : {};
    }
    catch {
        return {};
    }
}
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
/** Date + time for drift/conformance reports, e.g. "4 Jun 2026 14:32". */
function fmtTimestamp(d) {
    return new Date(d).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
/** Reconstruct the ExtractionResult shape the drift engine compares against, from a snapshot. */
function snapshotToBaseline(snap) {
    return {
        colors: {
            palette: (snap.palette ?? []).filter((e) => typeof e === "string").map((entry) => {
                const hex = entry.split("  #")[0].replace(/"/g, "").trim();
                const roleMatch = entry.match(/role:(\w+)/);
                const countMatch = entry.match(/count:(\d+)/);
                return { normalized: hex, color: hex, role: roleMatch?.[1], count: countMatch ? parseInt(countMatch[1]) : 1 };
            }),
        },
        typography: { styles: (snap.typography ?? []).filter(Boolean).map((s) => ({ context: s.context ?? "", family: s.family ?? "", size: s.size ?? "", weight: String(s.weight ?? "") })) },
        spacing: { commonValues: (snap.spacing ?? []).filter(Boolean).map((px) => ({ px: String(px) })) },
        borderRadius: { values: (snap.borderRadius ?? []).filter(Boolean).map((value) => ({ value: String(value) })) },
        shadows: (snap.shadows ?? []).filter((s) => typeof s === "string").map((shadow) => ({ shadow })),
    };
}
/** Build computeDrift overrides from config (threshold + any wired sensitivity thresholds + ignore). */
function buildDriftOverrides(config, threshold) {
    const overrides = { failThreshold: threshold, ignore: config.ignore ?? {} };
    if (config.thresholds?.color != null)
        overrides.colorSame = config.thresholds.color;
    if (config.thresholds?.spacing != null)
        overrides.dimPct = config.thresholds.spacing;
    return overrides;
}
/**
 * Resolve the baseline snapshot to compare a single page against.
 * Returns { kind: "page", snap } when a snapshot is available, or
 * { kind: "new" } (not in baseline → use conformance) or
 * { kind: "no-snapshot" } (in baseline but no per-page snapshot → re-run init).
 */
function loadPageBaseline(path, config) {
    const perPagePath = join(process.cwd(), ".dembrandt", "pages", `${pageSnapshotName(path)}.yaml`);
    if (existsSync(perPagePath)) {
        return { kind: "page", snap: yaml.load(readFileSync(perPagePath, "utf8")) };
    }
    const pages = config.pages ?? ["/"];
    // The primary page falls back to the main snapshot (single-page baselines have no per-page files).
    if (path === "/" || path === pages[0]) {
        const mainPath = join(process.cwd(), ".dembrandt", "snapshot.yaml");
        if (existsSync(mainPath))
            return { kind: "page", snap: yaml.load(readFileSync(mainPath, "utf8")) };
    }
    return { kind: pages.includes(path) ? "no-snapshot" : "new" };
}
program
    .name("dembrandt")
    .description([
    "Extract design tokens from any website.",
    "",
    "  dembrandt dembrandt.com          # extract design tokens",
    "  dembrandt init dembrandt.com     # save baseline for drift detection",
    "  dembrandt drift               # check for changes since baseline",
].join("\n"))
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
    .option("--lint", "Run design lint rules against extracted tokens")
    .option("--crawl [n]", "Auto-discover and extract up to N pages via DOM links (default: 5); combine with --sitemap to use sitemap discovery instead", (v) => {
    if (v === undefined || v === true)
        return 5;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1)
        throw new Error(`--crawl must be a positive integer, got: ${v}`);
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
    const spinner = ora({ text: "Starting extraction...", ...spinnerOptions(opts.jsonOnly) }).start();
    try {
        const robots = await checkRobotsTxt(url);
        if (robots.status === "ok" && robots.allowed === false) {
            spinner.warn(chalk.hex("#FFB86C")(`robots.txt disallows this path (rule: "${robots.rule}"). Proceeding anyway — respect the site's terms.`));
            spinner.start("Starting extraction...");
        }
    }
    catch {
        // robots check is advisory; never block extraction
    }
    let browser = null;
    try {
        let useHeaded = false;
        let result;
        while (true) {
            // Select browser type based on --browser flag
            const browserType = opts.browser === 'firefox' ? firefox : chromium;
            spinner.text = `Launching browser (${useHeaded ? "visible" : "headless"} mode)`;
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
            }
            else {
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
                        if (p.startsWith('http'))
                            return p;
                        return `${base.protocol}//${base.host}${p.startsWith('/') ? p : '/' + p}`;
                    });
                }
                else if (opts.sitemap) {
                    if (!opts.jsonOnly)
                        spinner.start("Fetching sitemap...");
                    const max = crawlN ? crawlN - 1 : 20;
                    additionalUrls = await parseSitemap(result.url, max);
                    if (additionalUrls.length === 0 && result.url !== url) {
                        additionalUrls = await parseSitemap(url, max);
                    }
                }
                else if (isAutoCrawl) {
                    additionalUrls = result._discoveredLinks || [];
                }
                delete result._discoveredLinks;
                if (additionalUrls.length === 0) {
                    if ((hasExplicitPaths || opts.sitemap || isAutoCrawl) && !opts.jsonOnly) {
                        spinner.warn("No additional pages discovered");
                    }
                }
                else {
                    spinner.stop();
                    if (!opts.jsonOnly)
                        console.log(chalk.dim(`  Found ${additionalUrls.length} page(s) to analyze`));
                    const allResults = [result];
                    for (let i = 0; i < additionalUrls.length; i++) {
                        const pageUrl = additionalUrls[i];
                        const pageNum = i + 2;
                        const total = additionalUrls.length + 1;
                        if (!opts.jsonOnly)
                            spinner.start(`Extracting page ${pageNum}/${total}: ${new URL(pageUrl).pathname}`);
                        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
                        try {
                            const pageResult = await extractBranding(pageUrl, spinner, browser, {
                                navigationTimeout: 90000,
                                verbose: !opts.jsonOnly,
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
                        }
                        catch (err) {
                            if (!opts.jsonOnly)
                                spinner.warn(`Skipping ${pageUrl}: ${String(err?.message || err).slice(0, 80)}`);
                        }
                    }
                    spinner.stop();
                    result = mergeResults(allResults);
                }
                if (!hasExplicitPaths && !opts.sitemap && !isAutoCrawl) {
                    delete result._discoveredLinks;
                }
                break;
            }
            catch (err) {
                await browser.close();
                browser = null;
                if (useHeaded || process.env.BROWSER_CDP_ENDPOINT)
                    throw err;
                if (err.message.includes("Timeout") ||
                    err.message.includes("net::ERR_")) {
                    spinner.warn("Navigation failed → retrying with visible browser");
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
                const suffix = opts.dtcg ? '.tokens' : '';
                const filename = `${timestamp}_v${version}${suffix}.json`;
                const filepath = join(outputDir, filename);
                writeFileSync(filepath, JSON.stringify(outputData, null, 2));
                const jsonLabel = opts.dtcg
                    ? 'DTCG tokens saved (--dtcg)'
                    : 'JSON saved (--save-output)';
                savedNotices.push(chalk.dim(`💾 ${jsonLabel}: ${color.info(`output/${domain}/${filename}`)}`));
            }
            catch (err) {
                console.log(color.warning(`! Could not save JSON file: ${err.message}`));
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
                savedNotices.push(chalk.dim(`💾 Brand guide PDF saved (--brand-guide): ${color.info(`output/${pdfDomain}/${pdfFilename}`)}`));
            }
            catch (err) {
                spinner.stop();
                console.log(color.warning(`Could not generate PDF: ${err.message}`));
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
                savedNotices.push(chalk.dim(`💾 DESIGN.md saved (--design-md): ${color.info(`output/${mdDomain}/DESIGN.md`)}`));
            }
            catch (err) {
                console.log(color.warning(`Could not generate DESIGN.md: ${err.message}`));
            }
        }
        // Output to terminal
        const summaryLine = color.accent('✨ Analysis summary: ') +
            chalk.dim(`${result.colors?.palette?.length ?? 0} colors, ` +
                `${result.typography?.styles?.length ?? 0} text styles, ` +
                `${result.breakpoints?.length ?? 0} breakpoints.`);
        if (opts.jsonOnly) {
            console.log = originalConsoleLog;
            if (opts.lint) {
                const lintResult = lint(result, loadLintConfig());
                outputData.lint = lintResult;
                // Match the terminal path: lint errors fail the build, including for CI consuming JSON.
                if (lintResult.errors.length > 0)
                    process.exitCode = 1;
            }
            console.log(JSON.stringify(outputData, null, 2));
            console.error(summaryLine);
            for (const notice of savedNotices)
                console.error(notice);
        }
        else {
            console.log();
            displayResults(result);
            console.log();
            console.log(summaryLine);
            for (const notice of savedNotices)
                console.log(notice);
            if (opts.lint)
                printLintResults(lint(result, loadLintConfig()));
        }
    }
    catch (err) {
        spinner.fail("Failed");
        console.error(chalk.red("\n✗ Extraction failed"));
        console.error(chalk.red(`  Error: ${err.message}`));
        console.error(chalk.dim(`  URL: ${url}`));
        process.exit(1);
    }
    finally {
        if (browser)
            await browser.close();
    }
});
program
    .command("init <url>")
    .description("Save baseline to .dembrandt/ (config.json + snapshot.yaml + tokens.json)")
    .option("--slow", "3x longer timeouts for slow-loading sites")
    .option("--mobile", "Extract from mobile viewport")
    .option("--stealth", "Enable anti-detection (use only when authorized)")
    .option("--crawl [n]", "Extract up to N pages and merge before saving baseline (default: 5)", (v) => {
    if (v === undefined || v === true)
        return 5;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1)
        throw new Error(`--crawl must be a positive integer, got: ${v}`);
    return n;
})
    .option("--sitemap", "Discover pages from sitemap.xml instead of DOM links")
    .option("--cookie <string>", "Cookie string for authenticated pages")
    .option("--header <string>", "Extra HTTP header, e.g. \"Authorization: Bearer eyJ...\"")
    .option("--verbose", "Show extraction progress")
    .action(async (input, opts) => {
    let url = input;
    if (!url) {
        console.error(chalk.red("  Usage: dembrandt init <url>"));
        process.exit(1);
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }
    const spinner = ora({ text: "Extracting design tokens...", ...spinnerOptions() }).start();
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const result = await extractWithCrawl(url, spinner, browser, {
            verbose: opts.verbose,
            slow: opts.slow,
            mobile: opts.mobile,
            stealth: opts.stealth,
            cookie: opts.cookie,
            header: opts.header,
            crawl: opts.crawl ?? null,
            sitemap: opts.sitemap ?? false,
        });
        spinner.succeed(`Extracted ${new URL(url).hostname || url}`);
        const extractedUrls = result._extractedUrls ?? [url];
        const pageResults = result._pageResults ?? [];
        delete result._extractedUrls;
        delete result._pageResults;
        const info = writeConfig(url, result, extractedUrls);
        // Write per-page snapshots to .dembrandt/pages/
        if (pageResults.length > 1) {
            for (const { url: pageUrl, result: pageResult } of pageResults) {
                try {
                    const pagePath = join(info.pagesDir, `${pageSnapshotName(pageUrl)}.yaml`);
                    writeFileSync(pagePath, buildSnapshotYaml(buildSnapshot(pageUrl, pageResult)));
                }
                catch { }
            }
        }
        printInitSuccess(info);
    }
    catch (err) {
        spinner.fail("Extraction failed");
        console.error(chalk.red(`  ${err.message}`));
        process.exit(1);
    }
    finally {
        if (browser)
            await browser.close();
    }
});
program
    .command("drift")
    .description("Compare live site against .dembrandt/ baseline and report changes")
    .option("--url <url>", "Override the baseline URL (e.g. point at staging)")
    .option("--slow", "3x longer timeouts")
    .option("--mobile", "Extract from mobile viewport")
    .option("--json", "Output raw JSON report")
    .option("--threshold <n>", "Fail if drift score exceeds this (default: 10)", (v) => parseInt(v, 10))
    .option("--quick", "Extract only the primary page, skip additional pages in the baseline")
    .option("--pages <paths...>", "Drift-check specific pages against their own per-page baseline, e.g. --pages /checkout /pricing (pages not in the baseline are reported as new)")
    .option("--cookie <string>", "Cookie string for authenticated pages")
    .option("--header <string>", "Extra HTTP header, e.g. \"Authorization: Bearer eyJ...\"")
    .option("-y, --accept", "With --pages, accept those pages' current live state as the baseline (writes/updates their snapshots)")
    .option("--verbose", "Show extraction progress")
    .action(async (opts) => {
    const configPath = join(process.cwd(), ".dembrandt", "config.json");
    if (!existsSync(configPath)) {
        console.error(chalk.red("  No .dembrandt/config.json found. Run `dembrandt init <url>` first."));
        process.exit(1);
    }
    let config;
    try {
        config = JSON.parse(readFileSync(configPath, "utf8"));
    }
    catch (e) {
        console.error(chalk.red("  .dembrandt/config.json is invalid JSON. Re-run `dembrandt init <url>`."));
        process.exit(1);
    }
    if (!config || typeof config !== "object") {
        console.error(chalk.red("  .dembrandt/config.json is malformed. Re-run `dembrandt init <url>`."));
        process.exit(1);
    }
    const baseUrl = opts.url ?? config.baseline;
    if (!baseUrl) {
        console.error(chalk.red("  No baseline URL found. Re-run `dembrandt init <url>`."));
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
    let additionalPaths;
    if (opts.quick) {
        additionalPaths = [];
    }
    else if (opts.pages?.length) {
        additionalPaths = opts.pages.map((p) => p.startsWith("/") ? p : "/" + p).filter((p) => p !== "/");
    }
    else {
        additionalPaths = configPages.slice(1);
    }
    const threshold = opts.threshold ?? config.thresholds?.failThreshold ?? DEFAULT_DRIFT_CONFIG.failThreshold;
    const stdoutLog = console.log.bind(console);
    if (opts.json)
        console.log = (...args) => console.error(...args);
    const spinner = ora({ text: `Extracting ${new URL(baseUrl).hostname}...`, ...spinnerOptions(opts.json) }).start();
    let browser;
    // Accept mode: bless the current live state of specific pages as the baseline.
    // Per-page only — it writes just those pages' snapshots and appends them to
    // config.pages, preserving the rest of the config (lint rules, ignore, thresholds).
    // A full-baseline refresh would clobber that config, so it routes to `init`.
    if (opts.accept) {
        if (!opts.pages?.length) {
            spinner.stop();
            console.error(chalk.yellow("  --accept needs --pages (e.g. --accept --pages /checkout)."));
            console.error(chalk.dim("  To rebuild the whole baseline, run `dembrandt init` instead."));
            process.exit(1);
        }
        const paths = opts.pages.map((p) => (p.startsWith("/") ? p : "/" + p));
        const origin = new URL(baseUrl).origin;
        const pagesDir = join(process.cwd(), ".dembrandt", "pages");
        mkdirSync(pagesDir, { recursive: true });
        const accepted = [];
        try {
            browser = await chromium.launch({ headless: true });
            for (const path of paths) {
                spinner.start(`Extracting ${path}...`);
                const pageUrl = path === "/" ? baseUrl : `${origin}${path}`;
                const res = await extractWithCrawl(pageUrl, spinner, browser, {
                    verbose: opts.verbose, slow: opts.slow, mobile: opts.mobile, cookie: opts.cookie, header: opts.header, paths: [],
                });
                writeFileSync(join(pagesDir, `${pageSnapshotName(path)}.yaml`), buildSnapshotYaml(buildSnapshot(pageUrl, res)));
                if (!(config.pages ?? ["/"]).includes(path))
                    config.pages = [...(config.pages ?? ["/"]), path];
                accepted.push(path);
            }
            spinner.stop();
            writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
        }
        catch (err) {
            spinner.fail("Failed");
            console.error(chalk.red(`  ${err.message}`));
            process.exit(1);
        }
        finally {
            if (browser)
                await browser.close();
        }
        console.log(chalk.green(`\n  ✓ Accepted ${accepted.join(", ")} into the baseline`));
        console.log(chalk.dim("  Commit .dembrandt/ to record the approval.\n"));
        process.exit(0);
    }
    // Per-page mode: --pages compares each requested page against its OWN baseline
    // snapshot, not the merged whole-site baseline. This is the "test just this
    // page" workflow (e.g. 4 pages fine, 1 changed) and avoids the false drift you
    // get from comparing one page to the merged baseline. Pages not in the baseline
    // are reported as new (use conformance), never as drift.
    if (opts.pages?.length) {
        const paths = opts.pages.map((p) => (p.startsWith("/") ? p : "/" + p));
        const overrides = buildDriftOverrides(config, threshold);
        const origin = new URL(baseUrl).origin;
        const results = [];
        try {
            browser = await chromium.launch({ headless: true });
            for (const path of paths) {
                const base = loadPageBaseline(path, config);
                if (base.kind !== "page") {
                    results.push({ path, kind: base.kind });
                    continue;
                }
                spinner.start(`Extracting ${path}...`);
                const cand = await extractWithCrawl(path === "/" ? baseUrl : `${origin}${path}`, spinner, browser, {
                    verbose: opts.verbose, slow: opts.slow, mobile: opts.mobile, cookie: opts.cookie, header: opts.header, paths: [],
                });
                results.push({ path, kind: "page", report: computeDrift(snapshotToBaseline(base.snap), cand, overrides) });
            }
            spinner.stop();
        }
        catch (err) {
            spinner.fail("Failed");
            console.error(chalk.red(`  ${err.message}`));
            process.exit(1);
        }
        finally {
            if (browser)
                await browser.close();
        }
        const anyDrift = results.some((r) => r.report?.status === "drift");
        if (opts.json)
            stdoutLog(JSON.stringify({ pages: results }, null, 2));
        else
            printPerPageDrift(results, config, baseUrl);
        process.exit(anyDrift ? 1 : 0);
    }
    try {
        browser = await chromium.launch({ headless: true });
        const candidate = await extractWithCrawl(primaryUrl, spinner, browser, {
            verbose: opts.verbose,
            slow: opts.slow,
            mobile: opts.mobile,
            cookie: opts.cookie,
            header: opts.header,
            paths: additionalPaths,
        });
        spinner.succeed(`Extracted ${new URL(baseUrl).hostname}`);
        const snapshotPath = join(process.cwd(), ".dembrandt", "snapshot.yaml");
        if (!existsSync(snapshotPath)) {
            console.error(chalk.red("  .dembrandt/snapshot.yaml not found. Re-run `dembrandt init`."));
            process.exit(1);
        }
        let snap;
        try {
            snap = yaml.load(readFileSync(snapshotPath, "utf8"));
        }
        catch (e) {
            console.error(chalk.red("  .dembrandt/snapshot.yaml is invalid. Re-run `dembrandt init`."));
            process.exit(1);
        }
        if (!snap || typeof snap !== "object") {
            console.error(chalk.red("  .dembrandt/snapshot.yaml is empty or malformed. Re-run `dembrandt init`."));
            process.exit(1);
        }
        const baseline = snapshotToBaseline(snap);
        const report = computeDrift(baseline, candidate, buildDriftOverrides(config, threshold));
        if (opts.json) {
            stdoutLog(JSON.stringify(report, null, 2));
            process.exit(report.status === "drift" ? 1 : 0);
        }
        printDriftReport(report, config, baseUrl);
        process.exit(report.status === "drift" ? 1 : 0);
    }
    catch (err) {
        spinner.fail("Failed");
        console.error(chalk.red(`  ${err.message}`));
        process.exit(1);
    }
    finally {
        if (browser)
            await browser.close();
    }
});
program
    .command("conformance [url]")
    .description("Check a live site against a declared token contract (.dembrandt/tokens.json)")
    .option("--contract <path>", "Contract to check against: tokens.json, DESIGN.md, or a YAML file (default: .dembrandt/tokens.json)")
    .option("--slow", "3x longer timeouts")
    .option("--mobile", "Extract from mobile viewport")
    .option("--json", "Output raw JSON report")
    .option("--threshold <n>", "Fail if more than this percent of tokens are unsatisfied (default: 10)", (v) => parseInt(v, 10))
    .option("--cookie <string>", "Cookie string for authenticated pages")
    .option("--header <string>", "Extra HTTP header, e.g. \"Authorization: Bearer eyJ...\"")
    .option("--verbose", "Show extraction progress")
    .action(async (url, opts) => {
    const contractPath = opts.contract
        ? join(process.cwd(), opts.contract)
        : join(process.cwd(), ".dembrandt", "tokens.json");
    if (!existsSync(contractPath)) {
        console.error(chalk.red(`  Contract not found: ${contractPath}`));
        console.error(chalk.dim("  Run `dembrandt init <url>` to write .dembrandt/tokens.json, or pass --contract <path>."));
        process.exit(1);
    }
    let contract;
    try {
        const raw = readFileSync(contractPath, "utf8");
        if (/\.(md|ya?ml)$/i.test(contractPath)) {
            // DESIGN.md / YAML: parse front matter and map to the contract shape.
            const fence = raw.match(/^---\n([\s\S]*?)\n---/);
            const parsed = yaml.load(fence ? fence[1] : raw);
            if (!parsed || typeof parsed !== "object") {
                throw new Error("no YAML front matter found");
            }
            contract = designTokensToContract(parsed);
        }
        else {
            contract = JSON.parse(raw);
        }
    }
    catch (e) {
        console.error(chalk.red(`  Contract could not be parsed: ${contractPath}`));
        console.error(chalk.dim(`  ${e.message}`));
        process.exit(1);
    }
    // Target URL: explicit arg, else baseline from config.
    let baseUrl = url;
    if (!baseUrl) {
        const configPath = join(process.cwd(), ".dembrandt", "config.json");
        if (existsSync(configPath)) {
            try {
                baseUrl = JSON.parse(readFileSync(configPath, "utf8"))?.baseline;
            }
            catch { /* ignore */ }
        }
    }
    if (!baseUrl) {
        console.error(chalk.red("  No target URL. Pass one (`dembrandt conformance example.com`) or run `dembrandt init` first."));
        process.exit(1);
    }
    const threshold = opts.threshold ?? DEFAULT_CONFORMANCE_CONFIG.failThreshold;
    const stdoutLog = console.log.bind(console);
    if (opts.json)
        console.log = (...args) => console.error(...args);
    const spinner = ora({ text: `Extracting ${new URL(baseUrl).hostname}...`, ...spinnerOptions(opts.json) }).start();
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const candidate = await extractWithCrawl(baseUrl, spinner, browser, {
            verbose: opts.verbose,
            slow: opts.slow,
            mobile: opts.mobile,
            cookie: opts.cookie,
            header: opts.header,
            paths: [],
        });
        spinner.succeed(`Extracted ${new URL(baseUrl).hostname}`);
        const report = computeConformance(contract, candidate, { failThreshold: threshold });
        if (opts.json) {
            stdoutLog(JSON.stringify(report, null, 2));
            process.exit(report.status === "violation" ? 1 : 0);
        }
        printConformanceReport(report, baseUrl, contractPath);
        process.exit(report.status === "violation" ? 1 : 0);
    }
    catch (err) {
        spinner.fail("Failed");
        console.error(chalk.red(`  ${err.message}`));
        process.exit(1);
    }
    finally {
        if (browser)
            await browser.close();
    }
});
const DRIFT_SYM = {
    added: ["+", chalk.green],
    removed: ["-", chalk.red],
    changed: ["~", chalk.yellow],
};
const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
const swatch = (hex) => (isHex(hex) ? chalk.bgHex(hex)("  ") + " " : "");
function renderColorChange(c) {
    const [sym, col] = DRIFT_SYM[c.kind];
    const role = chalk.dim((c.role || "color").padEnd(10));
    if (c.kind === "changed") {
        const delta = c.delta !== undefined ? chalk.dim(`  Δ${c.delta}`) : "";
        return `    ${col(sym)} ${role} ${swatch(c.before)}${c.before} ${chalk.dim("→")} ${swatch(c.after)}${c.after}${delta}`;
    }
    const hex = c.label;
    const uses = c.count ? chalk.dim(`  (${c.count} uses)`) : "";
    return `    ${col(sym)} ${role} ${swatch(hex)}${hex}${uses}`;
}
function renderTypographyChange(c) {
    const [sym, col] = DRIFT_SYM[c.kind];
    const ctx = chalk.dim((c.label || "").padEnd(10));
    if (c.kind === "changed" && c.from && c.to) {
        const diffs = [], same = [];
        for (const k of ["size", "family", "weight"]) {
            if (String(c.from[k]) !== String(c.to[k]))
                diffs.push(`${k} ${c.from[k]} ${chalk.dim("→")} ${c.to[k]}`);
            else
                same.push(k);
        }
        const note = same.length ? chalk.dim(`   ${same.join(" + ")} unchanged`) : "";
        return `    ${col(sym)} ${ctx} ${diffs.join(", ")}${note}`;
    }
    const f = c.kind === "removed" ? c.from : c.to;
    const desc = f ? `${f.family} ${f.size}/${f.weight}` : (c.before || c.after || "");
    return `    ${col(sym)} ${ctx} ${chalk.dim(desc)}`;
}
function renderGenericChange(c) {
    const [sym, col] = DRIFT_SYM[c.kind];
    let line = `    ${col(sym)} ${c.label}`;
    if (c.before && c.after)
        line += chalk.dim(`  ${c.before} → ${c.after}`);
    if (c.delta !== undefined)
        line += chalk.dim(`  Δ${c.delta}`);
    return line;
}
function printDriftReport(report, config, url) {
    const domain = new URL(url).hostname.replace("www.", "");
    const meta = `score ${report.score}/100 · threshold ${report.threshold}   ${domain}`;
    const verdict = report.status === "stable"
        ? chalk.green("  ✓ Stable") + chalk.dim(`   ${meta}`)
        : chalk.red("  ✗ Drift") + chalk.dim(`   ${meta}`);
    console.log("\n" + verdict);
    // Drift is a comparison across time — show both ends, with the clock, so the
    // report is unambiguous about which snapshot it measured against and when.
    const baseline = config.extractedAt ? fmtTimestamp(config.extractedAt) : "baseline";
    console.log(chalk.dim(`  baseline ${baseline}  →  now ${fmtTimestamp(Date.now())}`));
    if (report.changes.length === 0) {
        console.log(chalk.dim("\n  Identical — no token changes.\n"));
        return;
    }
    const byCategory = {};
    for (const c of report.changes)
        (byCategory[c.category] ??= []).push(c);
    console.log("");
    for (const [cat, changes] of Object.entries(byCategory)) {
        console.log(chalk.dim(`  ${cat}`));
        for (const c of changes) {
            if (cat === "color")
                console.log(renderColorChange(c));
            else if (cat === "typography")
                console.log(renderTypographyChange(c));
            else
                console.log(renderGenericChange(c));
        }
        console.log("");
    }
    const n = report.changes.length;
    const tail = report.status === "stable"
        ? `${n} change${n === 1 ? "" : "s"} — under threshold, not failing`
        : `${n} change${n === 1 ? "" : "s"} — over threshold, failing the check`;
    console.log(chalk.dim(`  ${tail}`));
    console.log("");
}
function printPerPageDrift(results, config, url) {
    const domain = new URL(url).hostname.replace("www.", "");
    const baseline = config.extractedAt ? fmtTimestamp(config.extractedAt) : "baseline";
    console.log(`\n  ${chalk.bold(domain)} ${chalk.dim("— per-page drift")}`);
    console.log(chalk.dim(`  baseline ${baseline}  →  now ${fmtTimestamp(Date.now())}\n`));
    for (const r of results) {
        if (r.kind === "new") {
            console.log(chalk.cyan("  •") + ` ${r.path}` + chalk.dim("   not in baseline — new page. Check it with `dembrandt conformance`."));
            continue;
        }
        if (r.kind === "no-snapshot") {
            console.log(chalk.yellow("  •") + ` ${r.path}` + chalk.dim("   no per-page snapshot — re-run `dembrandt init --crawl` to enable per-page drift."));
            continue;
        }
        const rep = r.report;
        const head = rep.status === "stable" ? chalk.green("  ✓") : chalk.red("  ✗");
        console.log(head + ` ${r.path}` + chalk.dim(`   score ${rep.score}/100 · threshold ${rep.threshold}`));
        const byCategory = {};
        for (const c of rep.changes)
            (byCategory[c.category] ??= []).push(c);
        for (const [cat, changes] of Object.entries(byCategory)) {
            console.log(chalk.dim(`      ${cat}`));
            for (const c of changes) {
                const line = cat === "color" ? renderColorChange(c) : cat === "typography" ? renderTypographyChange(c) : renderGenericChange(c);
                console.log("  " + line);
            }
        }
    }
    console.log("");
}
function printConformanceReport(report, url, contractPath) {
    const domain = new URL(url).hostname.replace("www.", "");
    const contract = contractPath.replace(process.cwd() + "/", "");
    const { total, satisfied, violated } = report.summary;
    console.log("");
    if (report.status === "conformant") {
        console.log(chalk.green("  ✓ Conformant") + chalk.dim(`  ${satisfied}/${total} declared tokens present  —  ${domain} honors ${contract}`));
    }
    else {
        console.log(chalk.red("  ✗ Contract violated") + chalk.dim(`  ${violated}/${total} declared tokens missing (score ${report.score}/100 · threshold ${report.threshold})  —  ${domain} vs ${contract}`));
    }
    console.log(chalk.dim(`  checked ${fmtTimestamp(Date.now())}`));
    if (report.violations.length > 0) {
        const byCategory = {};
        for (const v of report.violations)
            (byCategory[v.category] ??= []).push(v.token);
        console.log("");
        for (const [cat, tokens] of Object.entries(byCategory)) {
            console.log(chalk.dim(`  ${cat} — declared but absent from live`));
            for (const t of tokens)
                console.log(`    ${chalk.red("-")} ${t}`);
        }
    }
    // Honest about the lossy, unweighted nature of contract comparison.
    console.log(chalk.dim("\n  Unweighted: every declared token counts equally (contract has no usage/role data)."));
    console.log("");
}
function printLintResults({ errors, warnings }) {
    if (errors.length === 0 && warnings.length === 0) {
        console.log(chalk.green("\n  ✓ Lint passed — no issues found"));
        return;
    }
    console.log(chalk.bold("\n  Lint results"));
    for (const r of errors) {
        console.log(chalk.red(`  ✗ [${r.rule}] ${r.message}`));
    }
    for (const r of warnings) {
        console.log(chalk.yellow(`  ⚠ [${r.rule}] ${r.message}`));
    }
    console.log(chalk.dim("\n  Configure rules in .dembrandt/config.json (run `dembrandt init` to create it)"));
    if (errors.length > 0)
        process.exitCode = 1;
}
// Grouped --help for the root command. Commander 11 has no native option groups,
// so render them via a custom formatHelp. Subcommands keep a single flat list.
const OPTION_GROUPS = [
    ["Extraction", ["--dark-mode", "--mobile", "--slow", "--crawl", "--sitemap", "--browser"]],
    ["Output & export", ["--json-only", "--save-output", "--dtcg", "--brand-guide", "--design-md", "--screenshot", "--raw-colors"]],
    ["Analysis", ["--wcag", "--lint"]],
    ["Network & auth", ["--cookie", "--header", "--user-agent", "--locale", "--timezone", "--accept-language", "--screen-size"]],
    ["Anti-detection", ["--stealth", "--no-sandbox"]],
];
program.configureHelp({
    formatHelp(cmd, helper) {
        const helpWidth = helper.helpWidth ?? 80;
        const termWidth = helper.padWidth(cmd, helper);
        const indent = 2;
        const item = (term, desc) => {
            if (!desc)
                return term;
            const full = `${term.padEnd(termWidth + 2)}${desc}`;
            return helper.wrap(full, helpWidth - indent, termWidth + 2);
        };
        const block = (lines) => lines.map((l) => " ".repeat(indent) + l).join("\n");
        const out = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const description = helper.commandDescription(cmd);
        if (description)
            out.push(description, "");
        const args = helper.visibleArguments(cmd);
        if (args.length) {
            out.push("Arguments:", block(args.map((a) => item(helper.argumentTerm(a), helper.argumentDescription(a)))), "");
        }
        const options = helper.visibleOptions(cmd);
        if (options.length) {
            if (cmd.parent) {
                out.push("Options:", block(options.map((o) => item(helper.optionTerm(o), helper.optionDescription(o)))), "");
            }
            else {
                const byLong = new Map(options.map((o) => [o.long ?? o.short, o]));
                const used = new Set();
                for (const [title, flags] of OPTION_GROUPS) {
                    const groupOpts = flags.map((f) => byLong.get(f)).filter(Boolean);
                    if (!groupOpts.length)
                        continue;
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
//# sourceMappingURL=index.js.map