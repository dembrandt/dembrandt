#!/usr/bin/env node
/**
 * Minimal liveness smoke: does extraction complete and produce tokens on real
 * sites, with the CLI built as-is. No baselines, no screenshots, no accuracy
 * claims — accuracy lives in the dembrandt-ml dataset and the gold harness.
 *
 *   node test/liveness.mjs sites-smoke.json
 *
 * A site fails if the CLI exits non-zero, or if it exits 0 with zero colors
 * AND zero text styles AND no degraded stamps (runs-but-extracts-nothing).
 * The run fails when more than 25% of sites fail. Summary JSON goes to
 * test/liveness-report.json for the CI artifact.
 *
 * Unattended runs are the tool acting on its own behalf, not a user's, so this
 * harness names itself in the User-Agent and treats robots.txt as binding. A
 * site that refuses is skipped, not failed: it is a decision by the site, not a
 * regression in the engine, and it is the signal that the site belongs off the
 * list.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const sitesFile = process.argv[2] ?? "sites-smoke.json";
const sites = JSON.parse(await readFile(resolve(__dirname, sitesFile), "utf-8"));
const { version } = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf-8"));

const SKIPPED_BY_ROBOTS = 4;
const BOT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  `Chrome/136.0.0.0 Safari/537.36 Dembrandt/${version} (+https://dembrandt.com/bot)`;

function runSite(site) {
  return new Promise((done) => {
    const args = [
      resolve(ROOT, "dist/index.js"), site,
      "--json-only", "--no-sandbox", "--user-agent", BOT_UA,
    ];
    const p = spawn(process.execPath, args, {
      env: { ...process.env, DEMBRANDT_NO_HINTS: "1", DEMBRANDT_ENFORCE_ROBOTS: "1" },
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", () => {});
    // A site stuck past 3 minutes is a failure, not a wait.
    const timer = setTimeout(() => p.kill("SIGKILL"), 180_000);
    p.on("close", (code) => {
      clearTimeout(timer);
      let colors = 0, styles = 0, degraded = 0;
      try {
        const j = JSON.parse(out);
        colors = j.colors?.palette?.length ?? 0;
        styles = j.typography?.styles?.length ?? 0;
        degraded = (j.meta?.degraded?.length ?? 0) + (j.meta?.errors?.length ?? 0);
      } catch { /* unparseable output counts via the empty rule below */ }
      const skipped = code === SKIPPED_BY_ROBOTS;
      const empty = colors === 0 && styles === 0 && degraded === 0;
      const ok = code === 0 && !empty;
      done({ site, code, colors, styles, degraded, ok, skipped });
    });
  });
}

const results = [];
for (const site of sites) {
  const r = await runSite(site);
  results.push(r);
  const label = r.skipped ? "skip" : r.ok ? "ok  " : "FAIL";
  const detail = r.skipped ? "robots.txt refused" : `colors=${r.colors} styles=${r.styles}${r.degraded ? ` degraded=${r.degraded}` : ""}`;
  console.log(`${label} ${r.site} exit=${r.code} ${detail}`);
}

const skipped = results.filter((r) => r.skipped);
const attempted = results.filter((r) => !r.skipped);
const failed = attempted.filter((r) => !r.ok).length;
const report = {
  generatedFor: sitesFile,
  total: results.length,
  attempted: attempted.length,
  skipped: skipped.length,
  failed,
  results,
};
await writeFile(resolve(__dirname, "liveness-report.json"), JSON.stringify(report, null, 2));

if (skipped.length > 0) {
  console.log(`\n${skipped.length} site(s) skipped by robots.txt: ${skipped.map((r) => r.site).join(", ")}`);
  console.log("A site that refuses an identified run belongs off test/sites.json.");
}

// Every site refusing us is a list problem, not an engine regression, but it
// leaves nothing measured — say so rather than reporting a pass.
if (attempted.length === 0) {
  console.error("\nNo sites were attempted — every target refused the run");
  process.exit(1);
}

if (failed / attempted.length > 0.25) {
  console.error(`\n${failed}/${attempted.length} sites failed — engine regression`);
  process.exit(1);
}
console.log(`\n${attempted.length - failed}/${attempted.length} sites live`);
