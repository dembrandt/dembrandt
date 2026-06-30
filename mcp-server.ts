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
import { generateHtmlReport } from "./lib/formatters/html.js";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * @modelcontextprotocol/sdk and zod are optional peer dependencies: consumers
 * of the pure exports (drift, types, normalize, dtcg) are not forced to install
 * the MCP stack. The server entry defers their import to startup so a missing
 * install surfaces a clear instruction instead of a raw ERR_MODULE_NOT_FOUND at
 * module load, before any guard could run.
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
async function runExtraction(url: string, options: any = {}) {
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
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (err) {
    return {
      ok: false,
      error: `Browser launch failed. Install the matching browser: npx playwright@${pwVersion} install chromium\n\n${err.message}`,
    };
  }

  // Suppress console output — extractors.js writes directly to stdout
  // which would corrupt the JSON-RPC stream
  const _log = console.log;
  const _warn = console.warn;
  const _error = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  try {
    const data = await extractBranding(url, nullSpinner, browser, {
      navigationTimeout: 90000,
      slow: options.slow || false,
      darkMode: options.darkMode || false,
      mobile: options.mobile || false,
    });
    return { ok: true, data };
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
    console.log = _log;
    console.warn = _warn;
    console.error = _error;
    await browser.close().catch(() => {});
  }
}

function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ── Job Queue ──────────────────────────────────────────────────────────

class JobQueue {
  #jobs = new Map();
  #queue = [];
  #running = new Set();
  #maxConcurrent = 2;

  enqueue(url, opts, pick) {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.#jobs.set(id, {
      status: "queued",
      url,
      opts,
      pick,
      createdAt: Date.now(),
      startedAt: undefined,
      completedAt: undefined,
      result: undefined,
      error: undefined,
    });
    this.#queue.push(id);
    void this.#drain();
    return id;
  }

  get(id) {
    return this.#jobs.get(id) ?? null;
  }

  cancel(id) {
    const job = this.#jobs.get(id);
    if (!job || job.status !== "queued") return false;
    job.status = "cancelled";
    job.completedAt = Date.now();
    const idx = this.#queue.indexOf(id);
    if (idx !== -1) this.#queue.splice(idx, 1);
    return true;
  }

  async #drain() {
    while (this.#queue.length > 0 && this.#running.size < this.#maxConcurrent) {
      const id = this.#queue.shift();
      const job = this.#jobs.get(id);
      if (!job || job.status === "cancelled") continue;

      job.status = "running";
      job.startedAt = Date.now();
      this.#running.add(id);

      runExtraction(job.url, job.opts)
        .then((result) => {
          if (job.status === "cancelled") return;
          if (result.ok) {
            job.status = "completed";
            job.result = job.pick(result.data);
          } else {
            job.status = "failed";
            job.error = result.error;
          }
        })
        .catch((err) => {
          if (job.status !== "cancelled") {
            job.status = "failed";
            job.error = err.message || String(err);
          }
        })
        .finally(() => {
          job.completedAt = Date.now();
          this.#running.delete(id);
          void this.#drain();
        });
    }
  }

  // Remove completed/failed/cancelled jobs older than 1 hour
  cleanup() {
    const cutoff = Date.now() - 3_600_000;
    for (const [id, job] of this.#jobs) {
      if (
        ["completed", "failed", "cancelled"].includes(job.status) &&
        job.completedAt !== undefined &&
        job.completedAt < cutoff
      ) {
        this.#jobs.delete(id);
      }
    }
  }
}

const jobQueue = new JobQueue();
setInterval(() => jobQueue.cleanup(), 600_000);

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Wrapper for extraction tools.
 * Async by default: enqueues and returns a job_id immediately.
 * Pass sync: true to block and return the result directly.
 */
function toolHandler(pick, extraOptions = {}) {
  return async (params) => {
    const { url, slow, darkMode, sync } = params;
    const opts = { slow, darkMode, ...extraOptions };

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

  const server = new McpServer({ name: "dembrandt", version });

  // ── Shared params ──────────────────────────────────────────────────────

  const url = z.string().describe("Website URL (e.g. example.com)");
  const slow = z.boolean().optional().default(false).describe("3x timeouts for heavy SPAs");
  const sync = z.boolean().optional().default(false).describe("Wait for result directly instead of returning a job_id (blocks 15-40s)");

  // ── Extraction tools ───────────────────────────────────────────────────

  (server.tool as any)(
    "get_design_tokens",
    "Extract the full design system from a live website. Launches a real browser, navigates to the site, and returns production-ready design tokens: color palette (hex, RGB, LCH, OKLCH) with semantic roles and CSS custom properties, typography scale (families, fallbacks, sizes, weights, line heights, letter spacing by context), spacing system with grid detection, border radii, border patterns, box shadows for elevation, component styles (buttons with hover/focus states, inputs, links, badges), responsive breakpoints, logo and favicons, site name, detected CSS frameworks, and icon systems. Returns a job_id by default — use get_job_status to poll for the result.",
    { url, slow, sync },
    toolHandler((d) => d),
  );

  (server.tool as any)(
    "get_color_palette",
    "Extract brand colors from a live website. Returns semantic colors (primary, secondary, accent, plus background and text promoted from the page surface and body text), full palette ranked by usage frequency and confidence (high/medium/low), CSS custom properties with their design-system names, and hover/focus state colors discovered by simulating real user interactions. Each color in hex, RGB, LCH, and OKLCH. Returns a job_id by default — use get_job_status to poll for the result.",
    {
      url, slow, sync,
      darkMode: z.boolean().optional().default(false).describe("Also extract dark mode palette"),
    },
    toolHandler((d) => ({ url: d.url, colors: d.colors })),
  );

  (server.tool as any)(
    "get_typography",
    "Extract typography from a live website. Returns every font family with its fallback stack, the complete type scale grouped by context (heading, body, text, button, link, caption) with pixel and rem sizes, weights, line heights, letter spacing, and text transforms. The body context marks the dominant reading-text font; text marks other body-eligible copy. Also reports font sources: Google Fonts URLs, Adobe Fonts usage, and variable font detection. Returns a job_id by default — use get_job_status to poll for the result.",
    { url, slow, sync },
    toolHandler((d) => ({ url: d.url, typography: d.typography })),
  );

  (server.tool as any)(
    "get_component_styles",
    "Extract UI component styles from a live website. Returns button variants with default, hover, active, and focus states (background, text color, padding, border radius, border, shadow, outline, opacity), input field styles (border, focus ring, padding, placeholder), link styles (color, text decoration, hover changes), and badge/tag styles. Returns a job_id by default — use get_job_status to poll for the result.",
    { url, slow, sync },
    toolHandler((d) => ({ url: d.url, components: d.components })),
  );

  (server.tool as any)(
    "get_surfaces",
    "Extract surface treatment tokens from a live website: border radii with element context (which radii are used on buttons vs cards vs inputs vs modals), border patterns (width + style + color combinations), and box shadow elevation levels. Returns a job_id by default — use get_job_status to poll for the result.",
    { url, slow, sync },
    toolHandler((d) => ({
      url: d.url,
      borderRadius: d.borderRadius,
      borders: d.borders,
      shadows: d.shadows,
    })),
  );

  (server.tool as any)(
    "get_spacing",
    "Extract the spacing system from a live website: common margin and padding values sorted by frequency, pixel and rem values, and grid system detection (4px, 8px, or custom scale). Returns a job_id by default — use get_job_status to poll for the result.",
    { url, slow, sync },
    toolHandler((d) => ({ url: d.url, spacing: d.spacing })),
  );

  (server.tool as any)(
    "get_brand_identity",
    "Extract brand identity from a live website: site name, logo (source, dimensions, safe zone), all favicon variants (icon, apple-touch-icon, og:image, twitter:image with sizes and URLs), detected CSS frameworks (Tailwind, Bootstrap, MUI, etc.), icon systems (Font Awesome, Material Icons, SVG), and responsive breakpoints. Returns a job_id by default — use get_job_status to poll for the result.",
    { url, slow, sync },
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
  const extract = z.record(z.string(), z.any()).describe("A dembrandt extraction object, as returned by get_design_tokens");

  (server.tool as any)(
    "compute_drift",
    "Compare two dembrandt extractions and return a design-drift report: a 0-100 score (0 = identical), a stable/drift verdict, per-category scores, and the list of changed/added/removed tokens (colors, typography, spacing, radius, shadows). Pure and synchronous — no browser. Use it to check whether generated or updated UI has drifted from a brand baseline.",
    {
      baseline: extract,
      candidate: extract,
      failThreshold: z.number().optional().describe("Score above this yields a 'drift' verdict (default 10)"),
    },
    ({ baseline, candidate, failThreshold }: any) => {
      const report = computeDrift(baseline, candidate, failThreshold != null ? { failThreshold } : {});
      return jsonResult(report);
    },
  );

  (server.tool as any)(
    "render_report",
    "Render a self-contained HTML report (inline CSS, no external resources) from a dembrandt extraction, optionally including a drift diff. Returns the HTML as text — write it to a .html file to open offline or attach as a CI artifact.",
    {
      result: extract,
      drift: z.any().optional().describe("A drift report from compute_drift, to render the diff banner"),
    },
    ({ result, drift }: any) => {
      const html = generateHtmlReport(result, { drift: drift ?? undefined });
      return { content: [{ type: "text", text: html }] };
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
  await server.connect(transport);
}

await main();
