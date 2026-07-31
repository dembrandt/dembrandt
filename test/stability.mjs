#!/usr/bin/env node
/**
 * Run-stability harness (DEM-84): extract each site N times and compare the
 * normalized outputs. Extraction is deterministic in principle; any run-to-run
 * difference here is wobble that would surface as false-positive drift in a CI
 * gate. This harness is the measurement, not the fix — it exists to prove (or
 * disprove) wobble on given hardware before any reconciliation logic is built.
 *
 *   node test/stability.mjs sites-smoke.json 3
 *
 * A site is stable when all N normalized outputs are byte-identical. On
 * mismatch the differing JSON paths are reported (first 20). The run fails if
 * any site wobbles. Summary JSON goes to test/stability-report.json for the
 * CI artifact. Sites are run sequentially, N runs back-to-back per site, so
 * cross-site interference does not masquerade as wobble.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const sitesFile = process.argv[2] ?? "sites-smoke.json";
const runs = Math.max(2, parseInt(process.argv[3] ?? "2", 10));
const sites = JSON.parse(await readFile(resolve(__dirname, sitesFile), "utf-8"));

function extractOnce(site) {
  return new Promise((done) => {
    const args = [resolve(ROOT, "dist/index.js"), site, "--json-only", "--no-sandbox"];
    const p = spawn(process.execPath, args, { env: { ...process.env, DEMBRANDT_NO_HINTS: "1" } });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", () => {});
    const timer = setTimeout(() => p.kill("SIGKILL"), 180_000);
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return done({ error: `exit=${code}` });
      try { done({ json: JSON.parse(out) }); } catch { done({ error: "unparseable output" }); }
    });
  });
}

// Strip fields that legitimately differ between runs. Everything else is
// contract: if it moves between two back-to-back runs, that is wobble.
function normalize(j) {
  const c = structuredClone(j);
  delete c.extractedAt;
  delete c.meta;
  return JSON.stringify(c, null, 1);
}

// Paths where two parsed JSON values differ. Bounded: collection stops at max.
function diffPaths(a, b, path = "", acc = [], max = 20) {
  if (acc.length >= max) return acc;
  if (a === b) return acc;
  const ta = Object.prototype.toString.call(a);
  const tb = Object.prototype.toString.call(b);
  if (ta !== tb || typeof a !== "object" || a === null || b === null) {
    acc.push(path || "(root)");
    return acc;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (acc.length >= max) break;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffPaths(a[k], b[k], path ? `${path}.${k}` : k, acc, max);
  }
  return acc;
}

const results = [];
for (const site of sites) {
  const outputs = [];
  let error = null;
  for (let i = 0; i < runs; i++) {
    const r = await extractOnce(site);
    if (r.error) { error = `run ${i + 1}: ${r.error}`; break; }
    outputs.push(r.json);
  }
  if (error) {
    results.push({ site, stable: false, error });
    console.log(`FAIL ${site} ${error}`);
    continue;
  }
  const norms = outputs.map(normalize);
  const stable = norms.every((n) => n === norms[0]);
  const wobble = stable ? [] : diffPaths(JSON.parse(norms[0]), JSON.parse(norms[norms.length - 1]));
  results.push({ site, stable, runs, ...(wobble.length ? { wobble } : {}) });
  console.log(`${stable ? "ok  " : "WOBBLE"} ${site} runs=${runs}${wobble.length ? ` paths: ${wobble.slice(0, 5).join(", ")}` : ""}`);
}

const unstable = results.filter((r) => !r.stable).length;
const report = { generatedFor: sitesFile, runs, total: results.length, unstable, results };
await writeFile(resolve(__dirname, "stability-report.json"), JSON.stringify(report, null, 2));

if (unstable > 0) {
  console.error(`\n${unstable}/${results.length} sites unstable — see test/stability-report.json`);
  process.exit(1);
}
console.log(`\nAll ${results.length} sites stable across ${runs} runs`);
