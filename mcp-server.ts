#!/usr/bin/env node

/**
 * Dembrandt MCP Server
 *
 * Extract design tokens from any live website. Works with Claude Code, Cursor,
 * Windsurf, and any MCP-compatible client.
 *
 * Install:
 *   claude mcp add --transport stdio dembrandt -- npx -y --package dembrandt dembrandt-mcp
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadBrowserEngines, PlaywrightMissingError } from "./lib/browser.js";
import { extractBranding } from "./lib/extractors/index.js";
import { computeDrift } from "./lib/drift.js";
import { computeFindings } from "./lib/findings.js";
import { generateHtmlReport } from "./lib/formatters/html.js";
import { toDtcgTokens } from "./lib/formatters/dtcg.js";
import { generateDesignMd } from "./lib/formatters/markdown.js";
import { mergeResults } from "./lib/merger.js";
import { additionalPages, discoveryBudget, extractOptions, isMultiPage, launchArgs } from "./lib/mcp/options.js";
import type { Extraction, ExtractionRequest } from "./lib/mcp/options.js";
import { JobQueue, resolveExtraction } from "./lib/mcp/jobs.js";
import { checkRobotsTxt, fetchRobotsRules, filterAllowedUrls } from "./lib/robots.js";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * @modelcontextprotocol/sdk and zod are regular dependencies since 0.23.1 —
 * they were optional peers before, which broke the documented npx install
 * (npx never installs optional peers, and the suggested `npm i` remedy cannot
 * reach the npx cache tree). The deferred import stays as a backstop so a
 * broken install surfaces a clear instruction instead of a raw
 * ERR_MODULE_NOT_FOUND at module load.
 */
class McpDepsMissingError extends Error {
  constructor() {
    super("MCP server dependencies not installed, run: npm i @modelcontextprotocol/sdk zod");
    this.name = "McpDepsMissingError";
  }
}

async function loadMcpDeps() {
  try {
    const [mcp, stdio, zod] = await Promise.all([
      import("@modelcontextprotocol/sdk/server/mcp.js"),
      import("@modelcontextprotocol/sdk/server/stdio.js"),
      import("zod"),
    ]);
    return { McpServer: mcp.McpServer, StdioServerTransport: stdio.StdioServerTransport, z: zod.z };
  } catch {
    throw new McpDepsMissingError();
  }
}

// extractBranding expects a spinner — stub it for MCP context
const nullSpinner = {
  text: "",
  start(msg) { this.text = msg; return this; },
  stop() { return this; },
  succeed(_msg) { return this; },
  fail(_msg) { return this; },
  warn(_msg) { return this; },
  info(_msg) { return this; },
};

/**
 * Run extraction with error handling suitable for MCP responses.
 * Returns { ok, data?, error? } so tool handlers never throw.
 */
async function runExtraction(url: string, options: ExtractionRequest = {}) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let browser;
  let chromium;
  try {
    ({ chromium } = await loadBrowserEngines());
  } catch (err) {
    if (err instanceof PlaywrightMissingError) return { ok: false, error: err.message };
    throw err;
  }
  const pwVersion = createRequire(import.meta.url)("playwright-core/package.json").version;
  try {
    browser = await chromium.launch({ headless: true, args: launchArgs(options.noSandbox) });
  } catch (err) {
    const sandboxHint = options.noSandbox
      ? ""
      : "\n\nIn a container or CI sandbox, retry with noSandbox: true.";
    return {
      ok: false,
      error: `Browser launch failed. Install the matching browser: npx playwright@${pwVersion} install chromium${sandboxHint}\n\n${err.message}`,
    };
  }

  try {
    const first: Extraction = await extractBranding(url, nullSpinner, browser, {
      ...extractOptions(options, version),
      discoverLinks: discoveryBudget(options),
    });

    const entryRobots = await checkRobotsTxt(url).catch(() => null);
    if (entryRobots?.status === "ok" && entryRobots.allowed === false && first.meta) {
      first.meta.robotsWarnings = [`robots.txt disallows ${url} (rule: "${entryRobots.rule}")`];
    }

    if (!isMultiPage(options)) {
      delete first._discoveredLinks;
      return { ok: true, data: first };
    }

    let extraUrls = await additionalPages(first, url, options);
    delete first._discoveredLinks;

    if (extraUrls.length > 0) {
      const robotsRules = await fetchRobotsRules(first.url);
      const { allowed, disallowed } = filterAllowedUrls(extraUrls, robotsRules);
      if (disallowed.length > 0) {
        extraUrls = allowed;
        if (first.meta) {
          first.meta.robotsWarnings = [
            ...(first.meta.robotsWarnings || []),
            `robots.txt disallowed ${disallowed.length} discovered page(s): ${disallowed.map((d) => d.url).join(", ")}`,
          ];
        }
      }
    }

    const results = [first];
    for (const pageUrl of extraUrls) {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      try {
        const pageResult: Extraction = await extractBranding(pageUrl, nullSpinner, browser, extractOptions(options, version));
        delete pageResult._discoveredLinks;
        results.push(pageResult);
      } catch {
        // A page that fails to load is dropped; the merge still carries the rest.
      }
    }

    return { ok: true, data: results.length > 1 ? mergeResults(results) : first };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("timeout") || msg.includes("Timeout")) {
      return { ok: false, error: `Extraction timed out for ${url}. Try with slow: true for heavy SPAs.` };
    }
    if (msg.includes("net::ERR_NAME_NOT_RESOLVED")) {
      return { ok: false, error: `Could not resolve ${url}. Check the URL.` };
    }
    if (msg.includes("net::ERR_CONNECTION_REFUSED")) {
      return { ok: false, error: `Connection refused by ${url}.` };
    }
    return { ok: false, error: `Extraction failed for ${url}: ${msg}` };
  } finally {
    await browser.close().catch(() => {});
  }
}

function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

const jobQueue = new JobQueue<Extraction>({ run: runExtraction });
const cleanupTimer = setInterval(() => jobQueue.cleanup(), 600_000);
cleanupTimer.unref();

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Wrapper for extraction tools.
 * Async by default: enqueues and returns a job_id immediately.
 * Pass sync: true to block and return the result directly.
 */
function toolHandler(pick, extraOptions = {}) {
  return async (params) => {
    const { url, sync, ...rest } = params;
    const opts = { ...rest, ...extraOptions };

    if (sync) {
      const result = await runExtraction(url, opts);
      if (!result.ok) return errorResult(result.error);
      return jsonResult(pick(result.data));
    }

    const jobId = jobQueue.enqueue(url, opts, pick);
    return jsonResult({ job_id: jobId, status: "queued" });
  };
}

// ── Server entry ───────────────────────────────────────────────────────

async function main() {
  let McpServer, StdioServerTransport, z;
  try {
    ({ McpServer, StdioServerTransport, z } = await loadMcpDeps());
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // stdout is the JSON-RPC stream. Anything a dependency prints would corrupt
  // it, so silence console for the process once. Per-call save/restore is not
  // an option: two concurrent extractions would restore each other's handlers.
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  const server = new McpServer({ name: "dembrandt", version });

  // ── Shared params ──────────────────────────────────────────────────────

  const url = z.string().describe("Website URL (e.g. example.com)");
  const slow = z.boolean().optional().default(false).describe("3x timeouts for heavy SPAs");
  const sync = z.boolean().optional().default(false).describe("Wait for the result directly instead of returning a job_id. Blocks 15-40s for one page, and proportionally longer for a multi-page crawl.");
  const mobile = z.boolean().optional().default(false).describe("Extract from a mobile viewport instead of desktop");
  const cookie = z.string().optional().describe('Cookie string for authenticated pages, e.g. "session=abc; token=xyz"');
  const header = z.string().optional().describe('Extra HTTP header, e.g. "Authorization: Bearer eyJ..."');
  const userAgent = z.string().optional().describe("Custom user agent string");
  const noSandbox = z.boolean().optional().default(false).describe("Disable the browser sandbox, required inside Docker and most CI containers");
  const pages = z.number().int().min(1).max(20).optional().default(1).describe("Extract up to N pages and merge them into one token set. Pages are discovered from DOM links, or from sitemap.xml when sitemap is true. Merged tokens are markedly stronger than a single page.");
  const paths = z.array(z.string()).max(20).optional().describe('Explicit extra paths on the same domain to extract and merge, e.g. ["/pricing", "/docs"]. Overrides page discovery.');
  const sitemap = z.boolean().optional().default(false).describe("Discover the extra pages from sitemap.xml instead of DOM links. Alone it takes up to 20 pages; set pages to cap it");

  // Every extraction tool takes the same navigation, auth and crawl surface.
  const crawlParams = { pages, paths, sitemap };
  const browserParams = { slow, mobile, cookie, header, userAgent, noSandbox };

  // ── Extraction tools ───────────────────────────────────────────────────

  (server.tool as any)(
    "get_design_tokens",
    "Extract the full design system from a live website. Launches a real browser, navigates to the site, and returns production-ready design tokens: color palette (hex, RGB, LCH, OKLCH) with semantic roles and CSS custom properties, typography scale (families, fallbacks, sizes, weights, line heights, letter spacing by context), spacing system with grid detection, border radii, border patterns, box shadows for elevation, component styles (buttons with hover/focus states, inputs, links, badges), responsive breakpoints, logo and favicons, site name, detected CSS frameworks, and icon systems. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    {
      url, sync, ...browserParams, ...crawlParams,
      darkMode: z.boolean().optional().default(false).describe("Extract with dark mode emulation (prefers-color-scheme: dark)"),
      wcag: z.boolean().optional().default(false).describe("Include WCAG contrast analysis between palette colors"),
    },
    toolHandler((d) => d),
  );

  (server.tool as any)(
    "get_color_palette",
    "Extract brand colors from a live website. Returns semantic colors (primary, secondary, accent, plus background and text promoted from the page surface and body text), full palette ranked by usage frequency and confidence (high/medium/low), CSS custom properties with their design-system names, and hover/focus state colors discovered by simulating real user interactions. Each color in hex, RGB, LCH, and OKLCH. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    {
      url, sync, ...browserParams, ...crawlParams,
      darkMode: z.boolean().optional().default(false).describe("Also extract dark mode palette"),
      wcag: z.boolean().optional().default(false).describe("Include WCAG contrast analysis between palette colors"),
    },
    toolHandler((d) => ({ url: d.url, colors: d.colors, ...(d.wcag ? { wcag: d.wcag } : {}) })),
  );

  (server.tool as any)(
    "get_typography",
    "Extract typography from a live website. Returns every font family with its fallback stack, the complete type scale grouped by context (heading, body, text, button, link, caption) with pixel and rem sizes, weights, line heights, letter spacing, and text transforms. The body context marks the dominant reading-text font; text marks other body-eligible copy. Also reports font sources: Google Fonts URLs, Adobe Fonts usage, and variable font detection. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, typography: d.typography })),
  );

  (server.tool as any)(
    "get_component_styles",
    "Extract UI component styles from a live website. Returns button variants with default, hover, active, and focus states (background, text color, padding, border radius, border, shadow, outline, opacity), input field styles (border, focus ring, padding, placeholder), link styles (color, text decoration, hover changes), and badge/tag styles. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, components: d.components })),
  );

  (server.tool as any)(
    "get_surfaces",
    "Extract surface treatment tokens from a live website: border radii with element context (which radii are used on buttons vs cards vs inputs vs modals), border patterns (width + style + color combinations), and box shadow elevation levels. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({
      url: d.url,
      borderRadius: d.borderRadius,
      borders: d.borders,
      shadows: d.shadows,
    })),
  );

  (server.tool as any)(
    "get_spacing",
    "Extract the spacing system from a live website: common margin and padding values sorted by frequency, pixel and rem values, and grid system detection (4px, 8px, or custom scale). Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, spacing: d.spacing })),
  );

  (server.tool as any)(
    "get_brand_identity",
    "Extract brand identity from a live website: site name, logo (source, dimensions, safe zone), all favicon variants (icon, apple-touch-icon, og:image, twitter:image with sizes and URLs), detected CSS frameworks (Tailwind, Bootstrap, MUI, etc.), icon systems (Font Awesome, Material Icons, SVG), and responsive breakpoints. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({
      url: d.url,
      siteName: d.siteName,
      logo: d.logo,
      favicons: d.favicons,
      frameworks: d.frameworks,
      iconSystem: d.iconSystem,
      breakpoints: d.breakpoints,
    })),
  );

  // ── Drift & report tools (synchronous, no browser) ─────────────────────

  // zod 4: z.record needs explicit key + value types; z.record(z.any()) treats
  // the lone arg as the KEY and leaves value undefined, which crashes tools/list.
  const extract = z
    .record(z.string(), z.any())
    .optional()
    .describe("A dembrandt extraction object. Omit it and pass job_id instead to read a completed extraction straight out of the job queue, which avoids sending the whole extraction back through the model.");
  const sourceJob = z
    .string()
    .optional()
    .describe("job_id of a completed extraction to read instead of passing result inline");

  (server.tool as any)(
    "compute_drift",
    "Compare two dembrandt extractions and return a design-drift report: a 0-100 score (0 = identical), a stable/drift verdict, per-category scores, and the list of changed/added/removed tokens (colors, typography, spacing, radius, shadows). Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Use it to check whether generated or updated UI has drifted from a brand baseline.",
    {
      baseline: extract,
      candidate: extract,
      baselineJobId: sourceJob,
      candidateJobId: sourceJob,
      failThreshold: z.number().optional().describe("Score above this yields a 'drift' verdict (default 10)"),
    },
    ({ baseline, candidate, baselineJobId, candidateJobId, failThreshold }: any) => {
      const a = resolveExtraction(baseline, baselineJobId, "baseline", jobQueue);
      if (!a.ok) return errorResult(a.error);
      const b = resolveExtraction(candidate, candidateJobId, "candidate", jobQueue);
      if (!b.ok) return errorResult(b.error);
      const report = computeDrift(a.value, b.value, failThreshold != null ? { failThreshold } : {});
      return jsonResult(report);
    },
  );

  (server.tool as any)(
    "render_report",
    "Render a self-contained HTML report (inline CSS, no external resources) from a dembrandt extraction, optionally including a drift diff. Takes either an inline extraction or the job_id of a completed one. Returns the HTML as text: write it to a .html file to open offline or attach as a CI artifact.",
    {
      result: extract,
      job_id: sourceJob,
      drift: z.any().optional().describe("A drift report from compute_drift, to render the diff banner"),
    },
    ({ result, job_id, drift }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      if (!source.ok) return errorResult(source.error);
      const html = generateHtmlReport(source.value, { drift: drift ?? undefined });
      return { content: [{ type: "text", text: html }] };
    },
  );

  (server.tool as any)(
    "get_findings",
    "Lint a dembrandt extraction for design-system quality issues: WCAG contrast failures, inconsistency (near-duplicate colors, off-scale spacing values, radius sprawl), and duplication. Returns findings with severity (error/warn), category, and a human-readable message, plus summary counts. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Complements compute_drift: drift asks 'did it change', findings asks 'is it good'.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      return source.ok ? jsonResult(computeFindings(source.value)) : errorResult(source.error);
    },
  );

  (server.tool as any)(
    "export_dtcg",
    "Convert a dembrandt extraction to W3C Design Tokens (DTCG) format: color, typography, spacing, radius, border, and shadow tokens with $type/$value structure and dembrandt provenance under $extensions. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Use it to hand tokens to Style Dictionary, Figma token plugins, or any DTCG-compatible pipeline.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      return source.ok ? jsonResult(toDtcgTokens(source.value)) : errorResult(source.error);
    },
  );

  (server.tool as any)(
    "generate_design_md",
    "Render a DESIGN.md brand guide (markdown) from a dembrandt extraction: colors, typography, spacing, surfaces, and components as a human-readable design reference. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Write the output to DESIGN.md in a project so agents and developers build UI against the extracted brand.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      if (!source.ok) return errorResult(source.error);
      return { content: [{ type: "text", text: generateDesignMd(source.value, { version }) }] };
    },
  );

  // ── Job management tools ───────────────────────────────────────────────

  (server.tool as any)(
    "get_job_status",
    "Poll for the result of an async extraction job. Returns status (queued/running/completed/failed/cancelled) and the full result once completed. Call this after any extraction tool that returned a job_id.",
    { job_id: z.string().describe("The job_id returned by an extraction tool") },
    ({ job_id }) => {
      const job = jobQueue.get(job_id);
      if (!job) return errorResult(`No job found with id: ${job_id}`);
      if (job.status === "completed") return jsonResult({ job_id, status: "completed", result: job.result });
      if (job.status === "failed") return errorResult(`Job failed: ${job.error}`);
      return jsonResult({ job_id, status: job.status });
    },
  );

  (server.tool as any)(
    "list_jobs",
    "List all extraction jobs from this session with their status (queued/running/completed/failed/cancelled), URL, and timestamps. Completed jobs are kept for one hour.",
    {},
    () => jsonResult({ jobs: jobQueue.list() }),
  );

  (server.tool as any)(
    "cancel_job",
    "Cancel a queued extraction job. Has no effect on jobs that are already running.",
    { job_id: z.string().describe("The job_id to cancel") },
    ({ job_id }) => {
      const cancelled = jobQueue.cancel(job_id);
      return jsonResult({ job_id, cancelled });
    },
  );

  // ── Start ──────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  transport.onclose = () => process.exit(0);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
  await server.connect(transport);
}

await main();
