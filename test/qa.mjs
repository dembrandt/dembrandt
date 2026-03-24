#!/usr/bin/env node

/**
 * QA Toolchain for Dembrandt
 *
 * Three-layer visual comparison: website screenshot, raw identified colors, extracted palette.
 *
 * Usage:
 *   node test/qa.mjs --baseline                  # Generate golden baselines for all sites
 *   node test/qa.mjs --diff                       # Compare current vs golden, generate HTML report
 *   node test/qa.mjs --site stripe.com            # Single site (baseline or diff)
 *   node test/qa.mjs --baseline --site stripe.com # Baseline single site
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const GOLDEN_DIR = path.join(__dirname, "golden");
const REPORT_PATH = path.join(__dirname, "report.html");

// Parse CLI args
const args = process.argv.slice(2);
const isBaseline = args.includes("--baseline");
const isDiff = args.includes("--diff");
const siteIdx = args.indexOf("--site");
const singleSite = siteIdx !== -1 ? args[siteIdx + 1] : null;
const isCI = args.includes("--ci");

// Load site list
const sites = JSON.parse(
  fs.readFileSync(path.join(__dirname, "sites.json"), "utf8")
);
const targetSites = singleSite ? [singleSite] : sites;

function extractSite(domain) {
  const goldenDir = path.join(GOLDEN_DIR, domain);
  fs.mkdirSync(goldenDir, { recursive: true });

  const screenshotPath = path.join(goldenDir, "screenshot.png");
  const jsonPath = path.join(goldenDir, "extraction.json");

  console.log(`  Extracting ${domain}...`);

  try {
    const stdout = execSync(
      `node index.js ${domain} --json-only --raw-colors --slow --screenshot "${screenshotPath}"`,
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 5 * 60 * 1000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Parse JSON from stdout — skip any non-JSON lines (spinner output, warnings)
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      console.log(`    FAILED — no JSON output`);
      return null;
    }

    const data = JSON.parse(stdout.slice(jsonStart));
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    const paletteCount = data.colors?.palette?.length || 0;
    const rawCount = data.colors?.rawColors?.length || 0;
    console.log(
      `    OK — ${paletteCount} extracted colors, ${rawCount} raw colors`
    );
    return data;
  } catch (err) {
    console.log(`    FAILED — ${err.message.split("\n")[0]}`);
    return null;
  }
}

function extractToTemp(domain) {
  const tmpDir = path.join(__dirname, ".tmp", domain);
  fs.mkdirSync(tmpDir, { recursive: true });

  const screenshotPath = path.join(tmpDir, "screenshot.png");

  console.log(`  Extracting ${domain} (current branch)...`);

  try {
    const stdout = execSync(
      `node index.js ${domain} --json-only --raw-colors --slow --screenshot "${screenshotPath}"`,
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 5 * 60 * 1000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) return null;

    const data = JSON.parse(stdout.slice(jsonStart));
    fs.writeFileSync(path.join(tmpDir, "extraction.json"), JSON.stringify(data, null, 2));
    return { data, screenshotPath, dir: tmpDir };
  } catch (err) {
    console.log(`    FAILED — ${err.message.split("\n")[0]}`);
    return null;
  }
}

function loadGolden(domain) {
  const jsonPath = path.join(GOLDEN_DIR, domain, "extraction.json");
  const screenshotPath = path.join(GOLDEN_DIR, domain, "screenshot.png");

  if (!fs.existsSync(jsonPath)) return null;

  return {
    data: JSON.parse(fs.readFileSync(jsonPath, "utf8")),
    screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
  };
}

// Perceptual color distance (CIE76 delta-E in LAB space)
function deltaE(hex1, hex2) {
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function toLab(rgb) {
    let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
    g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
    b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;
    let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    let y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000;
    let z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    x = x > 0.008856 ? x ** (1/3) : 7.787 * x + 16/116;
    y = y > 0.008856 ? y ** (1/3) : 7.787 * y + 16/116;
    z = z > 0.008856 ? z ** (1/3) : 7.787 * z + 16/116;
    return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
  }
  const rgb1 = hexToRgb(hex1), rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 999;
  const lab1 = toLab(rgb1), lab2 = toLab(rgb2);
  return Math.sqrt((lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
}

const PERCEPTUAL_THRESHOLD = 15; // Same as extractor uses

function diffColors(goldenPalette, currentPalette) {
  const golden = (goldenPalette || []).map(c => c.normalized);
  const current = (currentPalette || []).map(c => c.normalized);

  // Match colors perceptually — two colors within delta-E 15 are "the same"
  const goldenMatched = new Set();
  const currentMatched = new Set();

  for (let i = 0; i < current.length; i++) {
    for (let j = 0; j < golden.length; j++) {
      if (goldenMatched.has(j)) continue;
      if (deltaE(current[i], golden[j]) < PERCEPTUAL_THRESHOLD) {
        currentMatched.add(i);
        goldenMatched.add(j);
        break;
      }
    }
  }

  const added = current.filter((_, i) => !currentMatched.has(i));
  const removed = golden.filter((_, i) => !goldenMatched.has(i));
  const kept = current.filter((_, i) => currentMatched.has(i));

  return { added, removed, kept };
}

function diffTypography(goldenTypo, currentTypo) {
  const goldenFamilies = new Set(
    (goldenTypo?.styles || []).map((s) => s.family)
  );
  const currentFamilies = new Set(
    (currentTypo?.styles || []).map((s) => s.family)
  );

  const added = [...currentFamilies].filter((f) => !goldenFamilies.has(f));
  const removed = [...goldenFamilies].filter((f) => !currentFamilies.has(f));

  return { added, removed };
}

function diffSpacing(goldenSpacing, currentSpacing) {
  const goldenVals = new Set(
    (goldenSpacing?.commonValues || []).map((v) => v.px)
  );
  const currentVals = new Set(
    (currentSpacing?.commonValues || []).map((v) => v.px)
  );

  const added = [...currentVals].filter((v) => !goldenVals.has(v));
  const removed = [...goldenVals].filter((v) => !currentVals.has(v));

  return { added, removed };
}

function swatch(hex, size = 28) {
  return `<span class="sw" style="--c:${hex};--s:${size}px" title="${hex}"></span>`;
}

function swatchDiff(hex, type, size = 28) {
  return `<span class="sw ${type}" style="--c:${hex};--s:${size}px" title="${hex}"></span>`;
}

function generateReport(results) {
  const regressions = results.filter(r => {
    const d = diffColors(r.golden?.data?.colors?.palette, r.current?.data?.colors?.palette);
    return d.added.length > 3 || d.removed.length > 0;
  }).length;
  const ok = regressions === 0;

  const rows = results.map(r => {
    const paletteDiff = diffColors(r.golden?.data?.colors?.palette, r.current?.data?.colors?.palette);
    const goldenPalette = r.golden?.data?.colors?.palette || [];
    const currentPalette = r.current?.data?.colors?.palette || [];
    const addedSet = new Set(paletteDiff.added);
    const removedSet = new Set(paletteDiff.removed);
    const hasChanges = paletteDiff.added.length || paletteDiff.removed.length;

    const goldenImg = r.golden?.screenshotPath
      ? `<img src="file://${r.golden.screenshotPath}">`
      : `<div class="no-img">-</div>`;
    const currentImg = r.current?.screenshotPath
      ? `<img src="file://${r.current.screenshotPath}">`
      : `<div class="no-img">-</div>`;

    const diffHtml = hasChanges ? [
      ...paletteDiff.added.map(c => swatchDiff(c, "added")),
      ...paletteDiff.removed.map(c => swatchDiff(c, "removed")),
    ].join("") : '<span class="unchanged">-</span>';

    return `<tr class="${!r.current ? 'fail' : hasChanges ? 'changed' : ''}">
      <td class="domain">${r.domain}</td>
      <td class="shots"><div class="shot-pair">${goldenImg}${currentImg}</div></td>
      <td class="colors">${goldenPalette.map(c => swatch(c.normalized, 22)).join("")}</td>
      <td class="colors">${currentPalette.map(c => {
        if (addedSet.has(c.normalized)) return swatchDiff(c.normalized, "added", 22);
        return swatch(c.normalized, 22);
      }).join("")}</td>
      <td class="diff">${diffHtml}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QA</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#111;color:#aaa;padding:32px 24px}
h1{font-size:16px;font-weight:500;color:#eee;margin-bottom:4px}
.meta{font-size:12px;color:#555;margin-bottom:24px}
.verdict{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:3px;margin-bottom:24px}
.verdict.ok{background:#0d2818;color:#3fb950}
.verdict.bad{background:#2d0b0b;color:#f85149}
table{width:100%;border-collapse:collapse}
th{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:#555;text-align:left;padding:8px 12px;border-bottom:1px solid #222}
td{padding:10px 12px;border-bottom:1px solid #1a1a1a;vertical-align:middle}
tr.changed{background:#1a1a1a}
tr.fail td.domain{color:#f85149}
.domain{font-weight:600;color:#ddd;font-size:13px;white-space:nowrap;width:120px}
.shots{width:200px}
.shot-pair{display:flex;gap:4px}
.shot-pair img{width:96px;height:60px;object-fit:cover;object-position:top;border-radius:3px;border:1px solid #222}
.no-img{width:96px;height:60px;background:#1a1a1a;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#333;font-size:11px}
.colors{min-width:100px}
.sw{display:inline-block;width:var(--s);height:var(--s);background:var(--c);border:1px solid #333;border-radius:2px;vertical-align:middle;margin:1px}
.sw:hover{transform:scale(1.4);z-index:1;position:relative}
.sw.added{border:2px solid #3fb950}
.sw.removed{border:2px solid #f85149;opacity:.5}
.diff{min-width:60px}
.unchanged{color:#333;font-size:11px}
</style>
</head>
<body>
<h1>Dembrandt QA</h1>
<div class="meta">${new Date().toISOString().slice(0,10)} &middot; ${results.length} sites</div>
<div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? 'OK to ship' : regressions + ' site(s) regressed'}</div>
<table>
<tr><th>Site</th><th>Screenshot</th><th>Baseline</th><th>Current</th><th>Diff</th></tr>
${rows}
</table>
</body>
</html>`;
}

function generateMarkdownReport(results) {
  let md = `## Dembrandt QA Report\n\n`;
  md += `Generated: ${new Date().toISOString()} | Sites: ${results.length}\n\n`;

  for (const r of results) {
    const paletteDiff = diffColors(
      r.golden?.data?.colors?.palette,
      r.current?.data?.colors?.palette
    );
    const goldenCount = r.golden?.data?.colors?.palette?.length || 0;
    const currentCount = r.current?.data?.colors?.palette?.length || 0;
    const delta = currentCount - goldenCount;
    const deltaStr = delta === 0 ? "=" : delta > 0 ? `+${delta}` : `${delta}`;
    const icon = delta === 0 ? "=" : delta < 0 ? "v" : "^";

    md += `### ${r.domain} ${icon} ${deltaStr} colors (${goldenCount} -> ${currentCount})\n\n`;

    if (paletteDiff.added.length) {
      md += `**Added:** ${paletteDiff.added.join(", ")}\n\n`;
    }
    if (paletteDiff.removed.length) {
      md += `**Removed:** ${paletteDiff.removed.join(", ")}\n\n`;
    }
    if (!paletteDiff.added.length && !paletteDiff.removed.length) {
      md += `No palette changes.\n\n`;
    }
  }

  return md;
}

// Main
async function main() {
  if (!isBaseline && !isDiff) {
    console.log("Usage:");
    console.log("  node test/qa.mjs --baseline              Generate golden baselines");
    console.log("  node test/qa.mjs --diff                  Compare current vs golden");
    console.log("  node test/qa.mjs --site stripe.com       Target single site");
    console.log("  node test/qa.mjs --ci                    Exit 1 on regression");
    process.exit(0);
  }

  console.log(
    `\nDembrandt QA — ${isBaseline ? "BASELINE" : "DIFF"} mode — ${targetSites.length} site(s)\n`
  );

  if (isBaseline) {
    for (const domain of targetSites) {
      extractSite(domain);
    }
    console.log(`\nBaselines saved to ${GOLDEN_DIR}`);
    return;
  }

  // Diff mode
  const results = [];
  let regressions = 0;

  for (const domain of targetSites) {
    const golden = loadGolden(domain);
    const current = extractToTemp(domain);

    if (!golden) {
      console.log(`    No golden for ${domain} — run --baseline first`);
    }

    const paletteDiff = diffColors(
      golden?.data?.colors?.palette,
      current?.data?.colors?.palette
    );
    const delta =
      (current?.data?.colors?.palette?.length || 0) -
      (golden?.data?.colors?.palette?.length || 0);

    if (delta > 3) {
      regressions++;
      console.log(`    REGRESSION: +${delta} colors`);
    } else if (delta < 0) {
      console.log(`    IMPROVEMENT: ${delta} colors`);
    } else {
      console.log(`    OK (delta: ${delta})`);
    }

    results.push({
      domain,
      golden,
      current: current
        ? { data: current.data, screenshotPath: current.screenshotPath }
        : null,
    });
  }

  // Copy tmp screenshots to report-assets so HTML can reference them after cleanup
  const assetsDir = path.join(__dirname, "report-assets");
  if (fs.existsSync(assetsDir)) fs.rmSync(assetsDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const r of results) {
    if (r.current?.screenshotPath && fs.existsSync(r.current.screenshotPath)) {
      const dest = path.join(assetsDir, `${r.domain}-current.png`);
      fs.copyFileSync(r.current.screenshotPath, dest);
      r.current.screenshotPath = dest;
    }
  }

  // Generate reports
  const html = generateReport(results);
  fs.writeFileSync(REPORT_PATH, html);
  console.log(`\nHTML report: ${REPORT_PATH}`);

  const md = generateMarkdownReport(results);
  fs.writeFileSync(path.join(__dirname, "diff-report.md"), md);
  console.log(`Markdown report: ${path.join(__dirname, "diff-report.md")}`);

  // Cleanup tmp
  const tmpDir = path.join(__dirname, ".tmp");
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }

  if (isCI && regressions > 0) {
    console.log(`\n${regressions} regression(s) detected — failing CI`);
    process.exit(1);
  }

  console.log(
    `\nDone. ${regressions} regression(s), ${results.filter((r) => r.current).length}/${results.length} extracted.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
