#!/usr/bin/env node
/**
 * Release churn check — the golden-baseline idea, done with the product's own
 * drift engine: extract reference sites with the PUBLISHED CLI as baseline,
 * re-extract with the LOCAL build, and report what changed and which tokens
 * disappeared. Run before writing release notes (internal README step 6).
 *
 *   npm run release:churn                 # default sites
 *   node tools/release-churn.mjs stripe.com
 *
 * Exit 1 when any site drifts past its threshold, so the number lands in the
 * release notes instead of in a user's CI.
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITES = process.argv.slice(2).length ? process.argv.slice(2) : ["dembrandt.com", "stripe.com"];

function run(cmd, args) {
  return new Promise((done) => {
    const p = spawn(cmd, args, { env: { ...process.env, DEMBRANDT_NO_HINTS: "1" } });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", () => {});
    p.on("close", (code) => done({ code, out }));
  });
}

const dir = await mkdtemp(join(tmpdir(), "churn-"));
let drifted = 0;

for (const site of SITES) {
  process.stdout.write(`${site}: baseline (published)… `);
  const base = await run("npx", ["-y", "dembrandt@latest", site, "--json-only", "--no-sandbox"]);
  if (base.code !== 0) { console.log("baseline extraction failed, skipping"); continue; }
  const baseFile = join(dir, `${site}.json`);
  await writeFile(baseFile, base.out);

  process.stdout.write("candidate (local build)… ");
  const cand = await run(process.execPath, [resolve(ROOT, "dist/index.js"), site, "--json-only", "--no-sandbox", "--compare", baseFile]);

  let drift;
  try { drift = JSON.parse(cand.out).drift; } catch { /* fall through */ }
  if (!drift) { console.log(`no drift report (exit ${cand.code})`); continue; }

  const { score, status, threshold, summary } = drift;
  console.log(`${status} ${score} (threshold ${threshold}) — ${summary.changed} changed, ${summary.added} added, ${summary.removed} removed`);
  for (const ch of (drift.changes ?? []).slice(0, 20)) {
    console.log(`  ${ch.kind === "added" ? "+" : ch.kind === "removed" ? "-" : "~"} [${ch.category}] ${ch.label}${ch.before && ch.after ? `: ${ch.before} -> ${ch.after}` : ""}`);
  }
  if ((drift.changes ?? []).length > 20) console.log(`  … ${drift.changes.length - 20} more`);
  if (status === "drift") drifted++;
}

if (drifted) {
  console.error(`\n${drifted}/${SITES.length} sites drift past threshold — quantify this in the release notes (or --approve the intent).`);
  process.exit(1);
}
console.log(`\nNo churn past threshold. Baselines: ${dir}`);
