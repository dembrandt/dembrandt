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
import { stripAssetBytes } from "./lib/mcp/assets.js";
import { generateHtmlReport } from "./lib/formatters/html.js";
import { toDtcgTokens } from "./lib/formatters/dtcg.js";
import { validateTokensObject } from "./lib/dtcg/validate.js";
import { contrastRatio, isLargeScale, wcagVerdict } from "./lib/colors.js";
import { generateDesignMd } from "./lib/formatters/markdown.js";
import { generateTailwindTheme } from "./lib/formatters/tailwind.js";
import { generateShadcnTheme } from "./lib/formatters/shadcn.js";
import { mergeResults } from "./lib/merger.js";
import { additionalPages, discoveryBudget, extractOptions, isMultiPage, launchArgs } from "./lib/mcp/options.js";
import type { Extraction, ExtractionRequest } from "./lib/mcp/options.js";
import { JobQueue, resolveExtraction } from "./lib/mcp/jobs.js";
import { checkRobotsTxt, fetchRobotsRules, filterAllowedUrls, robotsAgentFor, robotsVerdict } from "./lib/robots.js";

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

  // Checked before the fetch, and before the browser: an enforcing run has to be
  // able to not make the request, and the warning is only honest if it precedes it.
  const enforceRobots = process.env.DEMBRANDT_ENFORCE_ROBOTS === "1";
  // Only the group matching the User-Agent we actually send applies to us.
  const robotsAgent = robotsAgentFor(options.userAgent);
  const entryRobots = await checkRobotsTxt(url, { agent: robotsAgent }).catch(() => null);
  const verdict = entryRobots
    ? robotsVerdict(entryRobots, { enforce: enforceRobots })
    : { action: "proceed" as const };

  if (verdict.action === "refuse") {
    return { ok: false, error: `${verdict.reason}. Skipping ${url} (DEMBRANDT_ENFORCE_ROBOTS=1).` };
  }

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

    if (verdict.action === "warn" && first.meta) {
      first.meta.robotsWarnings = [`robots.txt disallows ${url} (rule: "${verdict.rule}")`];
    }

    if (!isMultiPage(options)) {
      delete first._discoveredLinks;
      return { ok: true, data: first };
    }

    let extraUrls = await additionalPages(first, url, options);
    delete first._discoveredLinks;

    if (extraUrls.length > 0) {
      const robotsRules = await fetchRobotsRules(first.url, { agent: robotsAgent });
      const { allowed, disallowed } = filterAllowedUrls(extraUrls, robotsRules, { enforce: enforceRobots });
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

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(stripAssetBytes(data), null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
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

interface ContrastPair {
  foreground: string;
  background: string;
  fontSizePx?: number;
  fontWeight?: number;
  label?: string;
}

interface GradedPair extends ContrastPair {
  ratio?: number;
  large?: boolean;
  requiredAA?: number;
  passAA?: boolean;
  passAAA?: boolean;
  error?: string;
}

type McpDeps = Awaited<ReturnType<typeof loadMcpDeps>>;

async function main() {
  let McpServer: McpDeps["McpServer"];
  let StdioServerTransport: McpDeps["StdioServerTransport"];
  let z: McpDeps["z"];
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
  const darkMode = z.boolean().optional().default(false).describe("Extract the dark theme: the page is rendered with prefers-color-scheme: dark");
  const cookie = z.string().optional().describe('Cookie string for authenticated pages, e.g. "session=abc; token=xyz"');
  const header = z.string().optional().describe('Extra HTTP header, e.g. "Authorization: Bearer eyJ..."');
  const userAgent = z.string().optional().describe("Custom user agent string");
  const noSandbox = z.boolean().optional().default(false).describe("Disable the browser sandbox, required inside Docker and most CI containers");
  const pages = z.number().int().min(1).max(20).optional().default(1).describe("Extract up to N pages and merge them into one token set. Pages are discovered from DOM links, or from sitemap.xml when sitemap is true. Merged tokens are markedly stronger than a single page.");
  const paths = z.array(z.string()).max(20).optional().describe('Explicit extra paths on the same domain to extract and merge, e.g. ["/pricing", "/docs"]. Overrides page discovery.');
  const sitemap = z.boolean().optional().default(false).describe("Discover the extra pages from sitemap.xml instead of DOM links. Alone it takes up to 20 pages; set pages to cap it");

  // Every extraction tool takes the same navigation, auth and crawl surface.
  const crawlParams = { pages, paths, sitemap };
  const browserParams = { slow, mobile, darkMode, cookie, header, userAgent, noSandbox };

  // ── Extraction tools ───────────────────────────────────────────────────

  server.tool(
    "get_design_tokens",
    "Extract the full design system from a live website. Launches a real browser, navigates to the site, and returns production-ready design tokens: color palette (hex, RGB, LCH, OKLCH) with semantic roles and CSS custom properties, typography scale (families, fallbacks, sizes, weights, line heights, letter spacing by context), spacing system with grid detection, border radii, border patterns, box shadows for elevation, component styles (buttons with hover/focus states, inputs, links, badges), responsive breakpoints, logo and favicons, site name, detected CSS frameworks, and icon systems. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    {
      url, sync, ...browserParams, ...crawlParams,
      wcag: z.boolean().optional().default(false).describe("Include WCAG contrast analysis between palette colors"),
    },
    toolHandler((d) => d),
  );

  server.tool(
    "get_color_palette",
    "Extract brand colors from a live website. Returns semantic colors (primary, secondary, accent, plus background and text promoted from the page surface and body text), full palette ranked by usage frequency and confidence (high/medium/low), CSS custom properties with their design-system names, and hover/focus state colors discovered by simulating real user interactions. Each color in hex, RGB, LCH, and OKLCH. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    {
      url, sync, ...browserParams, ...crawlParams,
      darkMode: z.boolean().optional().default(false).describe("Also extract dark mode palette"),
      wcag: z.boolean().optional().default(false).describe("Include WCAG contrast analysis between palette colors"),
    },
    toolHandler((d) => ({ url: d.url, colors: d.colors, ...(d.wcag ? { wcag: d.wcag } : {}) })),
  );

  server.tool(
    "get_typography",
    "Extract typography from a live website. Returns every font family with its fallback stack, the complete type scale grouped by context (heading, body, text, button, link, caption) with pixel and rem sizes, weights, line heights, letter spacing, and text transforms. The body context marks the dominant reading-text font; text marks other body-eligible copy. Also reports font sources: Google Fonts URLs, Adobe Fonts usage, and variable font detection. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, typography: d.typography })),
  );

  server.tool(
    "get_component_styles",
    "Extract UI component styles from a live website. Returns button variants with default, hover, active, and focus states (background, text color, padding, border radius, border, shadow, outline, opacity), input field styles (border, focus ring, padding, placeholder), link styles (color, text decoration, hover changes), and badge/tag styles. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, components: d.components })),
  );

  server.tool(
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

  server.tool(
    "get_spacing",
    "Extract the spacing system from a live website: common margin and padding values sorted by frequency, pixel and rem values, and grid system detection (4px, 8px, or custom scale). Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status, and pass the same job_id to compute_drift, get_findings, export_dtcg, generate_design_md or render_report instead of resending the extraction.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, spacing: d.spacing })),
  );

  server.tool(
    "get_motion",
    "Extract the motion system from a live website: transition and animation durations with their usage counts, easing curves, the durations and easings used per component context (button, link, nav, card, modal), named keyframe animations, and the hover patterns discovered by simulating real interaction. Also returns gradients, which travel with motion as the decorative layer. Set pages > 1 to crawl and merge several pages, which yields a markedly stronger token set than a single page. Returns a job_id by default: poll it with get_job_status.",
    { url, sync, ...browserParams, ...crawlParams },
    toolHandler((d) => ({ url: d.url, motion: d.motion, gradients: d.gradients })),
  );

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
    "get_findings",
    "Lint a dembrandt extraction for design-system quality issues: WCAG contrast failures, inconsistency (near-duplicate colors, off-scale spacing values, radius sprawl), and duplication. Returns findings with severity (error/warn), category, and a human-readable message, plus summary counts. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Complements compute_drift: drift asks 'did it change', findings asks 'is it good'.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      return source.ok ? jsonResult(computeFindings(source.value)) : errorResult(source.error);
    },
  );

  server.tool(
    "export_dtcg",
    "Convert a dembrandt extraction to W3C Design Tokens (DTCG) format: color, typography, spacing, radius, border, and shadow tokens with $type/$value structure and dembrandt provenance under $extensions. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Use it to hand tokens to Style Dictionary, Figma token plugins, or any DTCG-compatible pipeline.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      return source.ok ? jsonResult(toDtcgTokens(source.value)) : errorResult(source.error);
    },
  );

  server.tool(
    "generate_design_md",
    "Render a DESIGN.md brand guide (markdown) from a dembrandt extraction: colors, typography, spacing, surfaces, and components as a human-readable design reference. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Write the output to DESIGN.md in a project so agents and developers build UI against the extracted brand.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      if (!source.ok) return errorResult(source.error);
      return { content: [{ type: "text", text: generateDesignMd(source.value, { version }) }] };
    },
  );

  server.tool(
    "export_tailwind",
    "Render a Tailwind v4 @theme CSS block from a dembrandt extraction: colors, typography, spacing, radii and shadows as custom properties, observed values only, with nothing invented. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one. Write the output to a project's CSS entry point so Tailwind utilities resolve to the measured brand.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      if (!source.ok) return errorResult(source.error);
      return { content: [{ type: "text", text: generateTailwindTheme(source.value, { version }) }] };
    },
  );

  server.tool(
    "export_shadcn",
    "Render a shadcn/ui theme from a dembrandt extraction: the :root block and the @theme inline mapping Tailwind v4 needs. A slot is written only where the page supplied a value, and the rest are named in the file header and left at shadcn's own defaults, so no slot is filled with an invented value that reads as measured. Pure and synchronous, no browser. Takes either an inline extraction or the job_id of a completed one.",
    { result: extract, job_id: sourceJob },
    ({ result, job_id }: any) => {
      const source = resolveExtraction(result, job_id, "result", jobQueue);
      if (!source.ok) return errorResult(source.error);
      return { content: [{ type: "text", text: generateShadcnTheme(source.value, { version }) }] };
    },
  );

  server.tool(
    "validate_dtcg",
    "Validate a W3C Design Tokens (DTCG) document against the 2025.10 spec: token types, colour objects and their component ranges, dimensions, references, and property-level $ref pointers. Returns valid plus the list of errors with the path each one sits at. Pure and synchronous, no browser. Use it after writing or editing a token file, including one this server produced, so a hand edit cannot quietly break the document.",
    { tokens: z.record(z.string(), z.any()).describe("The DTCG token document to validate, as an object") },
    ({ tokens }: { tokens: Record<string, unknown> }) => {
      if (!tokens || typeof tokens !== "object") return errorResult("Pass tokens: a DTCG document object.");
      return jsonResult(validateTokensObject(tokens));
    },
  );

  server.tool(
    "check_contrast",
    "Grade colour pairs against WCAG 2.1 contrast, at the threshold the text size earns: 18pt, or 14pt bold, is large scale and needs 3:1 where body text needs 4.5:1. Takes pairs you name, so it grades colours you are about to ship rather than only colours already on a page. Returns the ratio, the required ratio, and the AA and AAA verdicts per pair. Pure and synchronous, no browser. For pairs already rendered on a site, extract with wcag instead.",
    {
      pairs: z.array(z.object({
        foreground: z.string().describe("Text colour, hex or rgb()"),
        background: z.string().describe("Background it sits on, hex or rgb()"),
        fontSizePx: z.number().optional().describe("Rendered size in px. Without it the pair is graded as body text"),
        fontWeight: z.number().optional().describe("Numeric weight, 400 unless given"),
        label: z.string().optional().describe("Your own name for the pair, echoed back"),
      })).min(1).max(200).describe("The colour pairs to grade"),
    },
    ({ pairs }: { pairs: ContrastPair[] }) => {
      const graded: GradedPair[] = pairs.map((pair) => {
        const ratio = contrastRatio(pair.foreground, pair.background);
        if (ratio == null) {
          return { ...pair, error: "Could not parse one of the colours" };
        }
        const large = isLargeScale(pair.fontSizePx ?? 16, pair.fontWeight ?? 400);
        const rounded = Math.round(ratio * 100) / 100;
        return { ...pair, ratio: rounded, ...wcagVerdict(rounded, large) };
      });
      const failures = graded.filter((g) => g.passAA === false).length;
      return jsonResult({ pairs: graded, summary: { total: graded.length, failingAA: failures } });
    },
  );

  server.tool(
    "check_robots",
    "Ask whether robots.txt allows extracting a URL, before spending a browser run on it. Returns the verdict, the rule that decided it, and the robots.txt status. A 404 or 410 means no robots.txt and everything is allowed; any other unreadable response is treated as a refusal. Cheap and synchronous: one HTTP request, no browser.",
    { url: z.string().describe("The URL you intend to extract") },
    async ({ url: target }: { url: string }) => {
      const result = await checkRobotsTxt(target);
      const strict = robotsVerdict(result, { enforce: true });
      const lenient = robotsVerdict(result, { enforce: false });
      return jsonResult({
        ...result,
        allowed: lenient.action === "proceed",
        allowedWhenEnforcing: strict.action === "proceed",
        reason: ("reason" in strict ? strict.reason : undefined) ?? ("reason" in lenient ? lenient.reason : undefined) ?? null,
      });
    },
  );

  // ── Job management tools ───────────────────────────────────────────────

  server.tool(
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

  server.tool(
    "list_jobs",
    "List all extraction jobs from this session with their status (queued/running/completed/failed/cancelled), URL, and timestamps. Completed jobs are kept for one hour.",
    {},
    () => jsonResult({ jobs: jobQueue.list() }),
  );

  server.tool(
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
