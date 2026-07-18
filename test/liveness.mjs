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
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const sitesFile = process.argv[2] ?? "sites-smoke.json";
const sites = JSON.parse(await readFile(resolve(__dirname, sitesFile), "utf-8"));

function runSite(site) {
  return new Promise((done) => {
    const args = [resolve(ROOT, "dist/index.js"), site, "--json-only", "--no-sandbox"];
    const p = spawn(process.execPath, args, { env: { ...process.env, DEMBRANDT_NO_HINTS: "1" } });
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
      const empty = colors === 0 && styles === 0 && degraded === 0;
      const ok = code === 0 && !empty;
      done({ site, code, colors, styles, degraded, ok });
    });
  });
}

const results = [];
for (const site of sites) {
  const r = await runSite(site);
  results.push(r);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.site} exit=${r.code} colors=${r.colors} styles=${r.styles}${r.degraded ? ` degraded=${r.degraded}` : ""}`);
}

const failed = results.filter((r) => !r.ok).length;
const report = { generatedFor: sitesFile, total: results.length, failed, results };
await writeFile(resolve(__dirname, "liveness-report.json"), JSON.stringify(report, null, 2));

if (failed / results.length > 0.25) {
  console.error(`\n${failed}/${results.length} sites failed — engine regression`);
  process.exit(1);
}
console.log(`\n${results.length - failed}/${results.length} sites live`);
