import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";

const CONFIG_FILE = ".dembrandtrc";
const TOKENS_FILE = "tokens.json";
const SNAPSHOT_FILE = ".dembrandt-snapshot.json";

export function writeConfig(url, result) {
  const domain = new URL(url).hostname.replace("www.", "");

  const tokens = buildTokens(result);

  const config = {
    baseline: url,
    extractedAt: result.extractedAt,
    domain,
    thresholds: {
      color: 2.3,
      spacing: 4,
      typography: 0,
    },
    tokens: `./${TOKENS_FILE}`,
  };

  const configPath = join(process.cwd(), CONFIG_FILE);
  const tokensPath = join(process.cwd(), TOKENS_FILE);
  const snapshotPath = join(process.cwd(), SNAPSHOT_FILE);

  const configExists = existsSync(configPath);

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + "\n");
  writeFileSync(snapshotPath, JSON.stringify(result, null, 2) + "\n");

  return { configPath, tokensPath, snapshotPath, configExists, domain, tokens };
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
  const tokens = {};

  if (result.colors?.semantic) {
    tokens.colors = {};
    for (const [key, val] of Object.entries(result.colors.semantic)) {
      const raw = typeof val === "string" ? val : (val?.hex ?? val?.normalized ?? val?.color);
      if (raw) tokens.colors[key] = normalizeColor(raw);
    }
    tokens.colors = Object.fromEntries(
      Object.entries(tokens.colors).filter(([, v]) => v !== null)
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
          .sort((a, b) => parseFloat(a) - parseFloat(b))
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
          .slice(0, 8)
          .map((r) => r.value ?? r)
      ),
    ];
  }

  if (result.shadows?.length) {
    tokens.shadows = result.shadows
      .slice(0, 6)
      .map((s) => s.shadow ?? s.value ?? s);
  }

  return tokens;
}

export function printInitSuccess({ configPath, tokensPath, snapshotPath, configExists, domain, tokens }) {
  const rel = (p) => p.replace(process.cwd() + "/", "");

  console.log("");
  if (configExists) {
    console.log(chalk.yellow(`  ↺ Updated baseline for ${chalk.bold(domain)}`));
  } else {
    console.log(chalk.green(`  ✓ Baseline saved for ${chalk.bold(domain)}`));
  }
  console.log("");
  console.log(chalk.dim(`  ${rel(configPath)}`) + chalk.dim("  ←  thresholds, baseline URL"));
  console.log(chalk.dim(`  ${rel(tokensPath)}`) + chalk.dim("  ←  token summary (commit this)"));
  console.log(chalk.dim(`  ${rel(snapshotPath)}`) + chalk.dim("  ←  full snapshot for drift (commit this)"));
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
  console.log(
    "  Commit " +
      chalk.cyan(".dembrandtrc") +
      " and " +
      chalk.cyan("tokens.json") +
      " to your repo."
  );
  console.log(
    "  Run " + chalk.cyan("dembrandt drift") + " anytime to check for changes."
  );
  console.log("");
}
