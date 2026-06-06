import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import yaml from "js-yaml";
import { DEFAULT_LINT_CONFIG } from "./lint.js";

const DIR = ".dembrandt";
const CONFIG_FILE = join(DIR, "config.json");
const TOKENS_FILE = join(DIR, "tokens.json");
const SNAPSHOT_FILE = join(DIR, "snapshot.yaml");

/**
 * Filename (without extension) for a page's per-page snapshot in .dembrandt/pages/.
 * Shared by init (writes them) and drift (reads them) so they always agree.
 *   "/"          -> "index"
 *   "/pricing"   -> "pricing"
 *   "/docs/api"  -> "docs_api"
 */
export function pageSnapshotName(pathOrUrl: any) {
  let pathname;
  try {
    pathname = new URL(pathOrUrl).pathname;
  } catch {
    pathname = pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl;
  }
  return pathname.replace(/\/+$/, "").replace(/\//g, "_").replace(/^_/, "") || "index";
}

/**
 * Convert DEFAULT_LINT_CONFIG into the ESLint-style `[level, options]` shape
 * written to config.json, so the editable form is discoverable after init.
 */
function defaultLintRules() {
  const rules: Record<string, any> = {};
  for (const [name, { level, ...options }] of (Object.entries(DEFAULT_LINT_CONFIG) as any[])) {
    rules[name] = Object.keys(options).length > 0 ? [level, options] : level;
  }
  return rules;
}

export function writeConfig(url: string, result: any, pages: any[] = []) {
  let base;
  try {
    base = new URL(url);
  } catch {
    throw new Error(`Invalid baseline URL: ${url}`);
  }
  const domain = base.hostname.replace("www.", "");

  const tokens = buildTokens(result);

  // Normalize pages to pathnames relative to baseline origin
  const normalizedPages = pages.map((p) => {
    try {
      return new URL(p).pathname;
    } catch {
      return p.startsWith("/") ? p : "/" + p;
    }
  });

  const config = {
    baseline: `${base.protocol}//${base.host}`,
    pages: normalizedPages.length > 0 ? normalizedPages : [base.pathname || "/"],
    extractedAt: result.extractedAt,
    domain,
    thresholds: {
      color: 2.3, // ΔE: colors closer than this are "the same" (drift cfg.colorSame)
      spacing: 4, // percent: dimensions within this are "the same" (drift cfg.dimPct)
    },
    lint: { rules: defaultLintRules() },
    tokens: `./${TOKENS_FILE}`,
  };

  const dirPath = join(process.cwd(), DIR);
  const pagesDir = join(process.cwd(), DIR, "pages");
  const configPath = join(process.cwd(), CONFIG_FILE);
  const tokensPath = join(process.cwd(), TOKENS_FILE);
  const snapshotPath = join(process.cwd(), SNAPSHOT_FILE);

  mkdirSync(dirPath, { recursive: true });
  mkdirSync(pagesDir, { recursive: true });
  const configExists = existsSync(configPath);

  const snapshot = buildSnapshot(url, result);

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + "\n");
  writeFileSync(snapshotPath, buildSnapshotYaml(snapshot));

  return { configPath, tokensPath, snapshotPath, pagesDir, configExists, domain, tokens, baseline: config.baseline };
}

function normalizeColor(color) {
  if (!color) return null;
  if (/^#[0-9a-f]{3,6}$/i.test(color)) return color.toLowerCase();
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) < 0.1) return null;
  return `#${parseInt(m[1]).toString(16).padStart(2,"0")}${parseInt(m[2]).toString(16).padStart(2,"0")}${parseInt(m[3]).toString(16).padStart(2,"0")}`;
}

function buildTokens(result) {
  const tokens: Record<string, any> = {};

  if (result.colors?.semantic) {
    tokens.colors = {};
    for (const [key, val] of (Object.entries(result.colors.semantic) as any[])) {
      const raw = typeof val === "string" ? val : (val?.hex ?? val?.normalized ?? val?.color);
      if (raw) tokens.colors[key] = normalizeColor(raw);
    }
    tokens.colors = Object.fromEntries(
      (Object.entries(tokens.colors) as any[]).filter(([, v]) => v !== null)
    );
    if (!Object.keys(tokens.colors).length) delete tokens.colors;
  }

  if (result.colors?.palette?.length) {
    tokens.palette = result.colors.palette
      .map((c) => c.hex ?? c.normalized ?? c.color)
      .filter(Boolean);
  }

  if (result.typography?.styles?.length) {
    const fontFamilies = [
      ...new Set(
        result.typography.styles.map((s) => s.fontFamily).filter(Boolean)
      ),
    ];
    if (fontFamilies.length) tokens.fontFamilies = fontFamilies;

    const fontSizes = [
      ...new Set(
        result.typography.styles
          .map((s) => s.fontSize)
          .filter(Boolean)
          .sort((a: any, b: any) => parseFloat(a) - parseFloat(b))
      ),
    ];
    if (fontSizes.length) tokens.fontSizes = fontSizes;
  }

  if (result.spacing?.commonValues?.length) {
    tokens.spacing = result.spacing.commonValues
      .slice(0, 12)
      .map((s) => s.px ?? s);
  }

  if (result.borderRadius?.values?.length) {
    tokens.borderRadius = [
      ...new Set(
        result.borderRadius.values
          .filter((r) => r.confidence !== "low" && /^\d/.test(r.value ?? r))
          .map((r) => r.value ?? r)
          .filter((v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 && n <= 500; })
          .slice(0, 8)
      ),
    ];
  }

  if (result.shadows?.length) {
    tokens.shadows = result.shadows
      .slice(0, 6)
      .map((s) => s.shadow ?? s.value ?? s)
      .filter((s) => typeof s === "string" && !s.includes("oklab(") && !s.includes("oklch(") && !s.includes("color("));
  }

  return tokens;
}

export function buildSnapshot(url: string, result: any) {
  const snapshot: any = {
    baseline: url,
    extractedAt: result.extractedAt,
  };

  // Colors: semantic roles + annotated palette
  if (result.colors?.semantic) {
    const colors: Record<string, any> = {};
    for (const [key, val] of (Object.entries(result.colors.semantic) as any[])) {
      const hex = normalizeColor(typeof val === "string" ? val : (val?.hex ?? val?.normalized ?? val?.color));
      if (hex) colors[key] = hex;
    }
    if (Object.keys(colors).length) snapshot.colors = colors;
  }

  if (result.colors?.palette?.length) {
    snapshot.palette = result.colors.palette
      .filter((c) => c.normalized ?? c.color)
      .map((c) => {
        const hex = c.normalized ?? c.color;
        const parts = [hex];
        if (c.role) parts.push(`role:${c.role}`);
        if (c.count) parts.push(`count:${c.count}`);
        return parts.join("  # ").replace(/ {2}# $/, "");
      });
  }

  // Typography: context + family + size + weight
  if (result.typography?.styles?.length) {
    snapshot.typography = result.typography.styles
      .filter((s) => s.context && (s.family ?? s.fontFamily))
      .map((s) => ({
        context: s.context,
        family: (s.family ?? s.fontFamily)?.split(",")[0].trim().replace(/^["']|["']$/g, ""),
        size: s.size ?? s.fontSize,
        weight: s.weight ?? s.fontWeight,
      }));
  }

  // Spacing, radii, shadows
  if (result.spacing?.commonValues?.length) {
    snapshot.spacing = result.spacing.commonValues.map((s) => s.px ?? s);
  }

  if (result.borderRadius?.values?.length) {
    snapshot.borderRadius = result.borderRadius.values
      .map((r) => r.value ?? r)
      .filter((v) => {
        const parts = String(v).split(/\s+/);
        return parts.every((p) => {
          const n = parseFloat(p);
          return !Number.isFinite(n) || (n >= 0 && n <= 500);
        });
      });
  }

  if (result.shadows?.length) {
    snapshot.shadows = result.shadows
      .map((s) => s.shadow ?? s.value ?? s)
      .filter((s) => typeof s === "string" && !s.includes("oklab(") && !s.includes("oklch(") && !s.includes("color("));
  }

  return snapshot;
}

export function buildSnapshotYaml(snapshot: any) {
  let domain;
  try {
    domain = new URL(snapshot.baseline).hostname.replace("www.", "");
  } catch {
    domain = snapshot.baseline ?? "unknown";
  }
  const header = `# dembrandt snapshot — ${domain} — ${snapshot.extractedAt?.slice(0, 10) ?? "unknown"}\n# Run \`dembrandt drift\` to check for changes.\n\n`;

  // Serialize palette with inline comments separately since js-yaml strips them
  const { palette, ...rest } = snapshot;
  let out = header + yaml.dump(rest, { lineWidth: 120, quotingType: '"' });

  if (palette?.length) {
    const paletteLines = palette.map((entry) => {
      const [hex, ...comment] = entry.split("  # ");
      return comment.length ? `  - "${hex}"  # ${comment.join("  # ")}` : `  - "${hex}"`;
    });
    out += `palette:\n${paletteLines.join("\n")}\n`;
  }

  return out;
}

export function printInitSuccess({ configPath, tokensPath, snapshotPath, configExists, domain, tokens, baseline }) {
  const rel = (p) => p.replace(process.cwd() + "/", "");

  console.log("");
  if (configExists) {
    console.log(chalk.yellow(`  ↺ Updated baseline for ${chalk.bold(domain)}`));
  } else {
    console.log(chalk.green(`  ✓ Baseline saved for ${chalk.bold(domain)}`));
  }

  if (baseline && (baseline.includes("localhost") || baseline.includes("127.0.0.1"))) {
    console.log(chalk.yellow(`  ⚠ Baseline URL is ${baseline} — update .dembrandt/config.json before committing.`));
  }
  console.log("");
  console.log(chalk.dim(`  ${rel(configPath)}`) + chalk.dim("  ←  baseline config"));
  console.log(chalk.dim(`  ${rel(tokensPath)}`) + chalk.dim("  ←  token summary"));
  console.log(chalk.dim(`  ${rel(snapshotPath)}`) + chalk.dim("  ←  drift snapshot"));
  console.log("");

  const counts = [
    tokens.colors && `${Object.keys(tokens.colors).length} colors`,
    tokens.fontFamilies && `${tokens.fontFamilies.length} fonts`,
    tokens.spacing && `${tokens.spacing.length} spacing values`,
  ]
    .filter(Boolean)
    .join(", ");

  if (counts) console.log(chalk.dim(`  Captured: ${counts}`));

  console.log("");
  console.log("  Commit " + chalk.cyan(".dembrandt/") + " to your repo.");
  console.log("  Run " + chalk.cyan("dembrandt drift") + " anytime to check for changes.");
  console.log("");
}
