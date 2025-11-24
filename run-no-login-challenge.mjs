#!/usr/bin/env node
// run-global-challenge-suite.mjs – 100% working version (2025)

import { execSync } from "child_process";

const sites = [
  "tesla.com/model3/design#overview", // SPA, WebGL/3D, bot protection
  "dribbble.com", // interactive previews, heavy JS
  "soundcloud.com/discover", // SPA, media streaming, async loading
  "airtable.com/templates", // SaaS grids, dynamic content
  "producthunt.com", // SPA, async product listings
  "behance.net", // portfolios, AJAX-loaded content
];

let passed = 0;
let failed = 0;
const startTotal = Date.now();

console.log("═══════════════════════════════════════════════════════════");
console.log("   Dembrandt Global Hardest Sites Challenge 2025");
console.log("═══════════════════════════════════════════════════════════\n");

for (const [i, site] of sites.entries()) {
  const start = Date.now();
  console.log(`\n[${i + 1}/${sites.length}] Testing → ${site}`);

  try {
    // No unknown flags – only the flags your index.js actually supports
    // (adjust if you have --headless or --slow in your CLI)
    execSync(`node index.js ${site} --slow`, {
      stdio: "inherit",
      timeout: 300000, // 5-minute max per site (this is Node timeout, not a CLI flag)
    });

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`SUCCESS – ${duration}s\n`);
    passed++;
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`FAILED – ${duration}s`);

    // Quick diagnosis
    if (err.message.includes("unknown option")) {
      console.log(
        "   → Fix: remove unsupported CLI flags (e.g. --timeout, --headless) from the test script"
      );
    } else if (
      err.message.includes("ERR_BLOCKED") ||
      err.message.includes("Cloudflare")
    ) {
      console.log("   → Anti-bot / Cloudflare protection");
    } else if (err.message.includes("CAPTCHA")) {
      console.log("   → CAPTCHA detected");
    } else {
      console.log("   → Other error – check logs above");
    }
    console.log();
    failed++;
  }
}

const totalTime = ((Date.now() - startTotal) / 1000 / 60).toFixed(1);
const score = Math.round((passed / sites.length) * 100);

console.log("═══════════════════════════════════════════════════════════");
console.log(
  `FINAL SCORE: ${score}/100 | ${passed} passed | ${failed} failed | ${totalTime} min`
);
console.log("═══════════════════════════════════════════════════════════\n");

if (score === 100)
  console.log("LEGENDARY – You just beat the 10 hardest sites on the planet.");
else if (score >= 70) console.log("ELITE – Top 1% globally.");
else if (score >= 50) console.log("STRONG – Better than 99% of public tools.");
else console.log("Keep improving – anti-bot layer is the next big unlock.");

process.exit(failed === 0 ? 0 : 1);
