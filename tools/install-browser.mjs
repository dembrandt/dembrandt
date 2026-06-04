#!/usr/bin/env node
/**
 * Install the Playwright browser revision that matches the resolved
 * playwright-core version. dembrandt drives browsers with playwright-core, which
 * does NOT download them — and a browser installed for a different Playwright
 * version won't be found ("Executable doesn't exist"). Deriving the version from
 * the resolved playwright-core keeps the two in lockstep on every platform.
 *
 *   node tools/install-browser.mjs                # chromium + firefox
 *   node tools/install-browser.mjs chromium       # chromium only
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const version = require("playwright-core/package.json").version;
const targets = process.argv.slice(2).join(" ") || "chromium firefox";

console.log(`Installing Playwright browsers (${targets}) for playwright-core ${version}...`);
try {
  execSync(`npx --yes playwright@${version} install ${targets}`, { stdio: "inherit" });
} catch {
  console.error(
    `\nBrowser installation failed. Install manually with the matching version:\n` +
    `  npx playwright@${version} install ${targets}\n` +
    `On Linux/CI add --with-deps for system libraries.`
  );
  process.exit(1);
}
