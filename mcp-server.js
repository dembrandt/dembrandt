#!/usr/bin/env node

/**
 * Dembrandt MCP Server
 *
 * Extract design tokens from any live website. Works with Claude Code, Cursor,
 * Windsurf, and any MCP-compatible client.
 *
 * Install:
 *   claude mcp add --transport stdio dembrandt -- npx -y dembrandt-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { extractBranding } from "./lib/extractors.js";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const server = new McpServer({
  name: "dembrandt",
  version,
});

// extractBranding expects a spinner — stub it for MCP context
const nullSpinner = {
  text: "",
  start(msg) { this.text = msg; return this; },
  stop() { return this; },
  succeed(msg) { return this; },
  fail(msg) { return this; },
  warn(msg) { return this; },
  info(msg) { return this; },
};

/**
 * Run extraction with error handling suitable for MCP responses.
 * Returns { ok, data?, error? } so tool handlers never throw.
 */
async function runExtraction(url, options = {}) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (err) {
    return {
      ok: false,
      error: `Browser launch failed. Is Playwright installed? Run: npx playwright install chromium\n\n${err.message}`,
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

/**
 * Wrapper that handles extraction + error formatting for all tools.
 * `pick` receives the full result and returns the filtered subset.
 */
function toolHandler(pick, extraOptions = {}) {
  return async (params) => {
    const { url, slow, darkMode } = params;
    const result = await runExtraction(url, { slow, darkMode, ...extraOptions });
    if (!result.ok) return errorResult(result.error);
    return jsonResult(pick(result.data));
  };
}

// ── Shared params ──────────────────────────────────────────────────────

const url = z.string().describe("Website URL (e.g. stripe.com)");
const slow = z.boolean().optional().default(false).describe("3x timeouts for heavy SPAs");

// ── Tools ──────────────────────────────────────────────────────────────

server.tool(
  "get_design_tokens",
  "Extract the full design system from a live website. Launches a real browser, navigates to the site, and returns production-ready design tokens: color palette (hex, RGB, LCH, OKLCH) with semantic roles and CSS custom properties, typography scale (families, fallbacks, sizes, weights, line heights, letter spacing by context), spacing system with grid detection, border radii, border patterns, box shadows for elevation, component styles (buttons with hover/focus states, inputs, links, badges), responsive breakpoints, logo and favicons, site name, detected CSS frameworks, and icon systems. Takes 15-40 seconds depending on site complexity.",
  { url, slow },
  toolHandler((d) => d),
);

server.tool(
  "get_color_palette",
  "Extract brand colors from a live website. Returns semantic colors (primary, secondary, accent), full palette ranked by usage frequency and confidence (high/medium/low), CSS custom properties with their design-system names, and hover/focus state colors discovered by simulating real user interactions. Each color in hex, RGB, LCH, and OKLCH.",
  {
    url, slow,
    darkMode: z.boolean().optional().default(false).describe("Also extract dark mode palette"),
  },
  toolHandler((d) => ({ url: d.url, colors: d.colors })),
);

server.tool(
  "get_typography",
  "Extract typography from a live website. Returns every font family with its fallback stack, the complete type scale grouped by context (heading, body, button, link, caption) with pixel and rem sizes, weights, line heights, letter spacing, and text transforms. Also reports font sources: Google Fonts URLs, Adobe Fonts usage, and variable font detection.",
  { url, slow },
  toolHandler((d) => ({ url: d.url, typography: d.typography })),
);

server.tool(
  "get_component_styles",
  "Extract UI component styles from a live website. Returns button variants with default, hover, active, and focus states (background, text color, padding, border radius, border, shadow, outline, opacity), input field styles (border, focus ring, padding, placeholder), link styles (color, text decoration, hover changes), and badge/tag styles.",
  { url, slow },
  toolHandler((d) => ({ url: d.url, components: d.components })),
);

server.tool(
  "get_surfaces",
  "Extract surface treatment tokens from a live website: border radii with element context (which radii are used on buttons vs cards vs inputs vs modals), border patterns (width + style + color combinations), and box shadow elevation levels.",
  { url, slow },
  toolHandler((d) => ({
    url: d.url,
    borderRadius: d.borderRadius,
    borders: d.borders,
    shadows: d.shadows,
  })),
);

server.tool(
  "get_spacing",
  "Extract the spacing system from a live website: common margin and padding values sorted by frequency, pixel and rem values, and grid system detection (4px, 8px, or custom scale).",
  { url, slow },
  toolHandler((d) => ({ url: d.url, spacing: d.spacing })),
);

server.tool(
  "get_brand_identity",
  "Extract brand identity from a live website: site name, logo (source, dimensions, safe zone), all favicon variants (icon, apple-touch-icon, og:image, twitter:image with sizes and URLs), detected CSS frameworks (Tailwind, Bootstrap, MUI, etc.), icon systems (Font Awesome, Material Icons, SVG), and responsive breakpoints.",
  { url, slow },
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

// ── Start ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
