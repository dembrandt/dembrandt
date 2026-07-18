/**
 * Install the Playwright browser revision matching the bundled playwright-core.
 *
 * dembrandt drives browsers with playwright-core, which deliberately ships no
 * binaries. A browser installed for a *different* Playwright version is not
 * found ("Executable doesn't exist"), which is the single most common first-run
 * failure. Deriving the version from the playwright-core resolved next to this
 * file keeps the two in lockstep by construction — including in a global
 * install, where a bare `npx playwright-core install` would otherwise fetch an
 * unrelated latest version from the registry.
 *
 * Exposed as `dembrandt install-browser` so the fix ships inside the published
 * package; the repo-only `tools/install-browser.mjs` cannot help an npm user.
 */

import { execFileSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Version of the playwright-core this build actually drives. */
export function bundledPlaywrightVersion(): string {
  return require("playwright-core/package.json").version as string;
}

/**
 * Runs the bundled playwright-core installer. Returns a process exit code:
 * 0 on success, 1 on failure (with the manual command echoed for recovery).
 *
 * Invoked as `node <resolved cli.js>` rather than through npx: the resolved
 * CLI *is* the bundled playwright-core, so the version matches by construction
 * with no registry fetch — and npx is npx.cmd on Windows, which execFileSync
 * will not spawn without a shell.
 */
export function installBrowsers(argv: string[]): number {
  const version = bundledPlaywrightVersion();
  // Default to chromium only: it is the engine every extraction uses, and
  // pulling firefox as well doubles the download for a first-run recovery.
  const targets = argv.length ? argv : ["chromium"];

  console.log(`Installing Playwright ${targets.join(" ")} for playwright-core ${version}...`);
  try {
    const cli = require.resolve("playwright-core/cli.js");
    execFileSync(process.execPath, [cli, "install", ...targets], { stdio: "inherit" });
    return 0;
  } catch {
    console.error(
      `\nBrowser installation failed. Install manually with the matching version:\n` +
      `  npx playwright@${version} install ${targets.join(" ")}\n` +
      `On Linux/CI add --with-deps for system libraries.`
    );
    return 1;
  }
}
