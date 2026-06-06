#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { scoreSite } from './gold-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GOLD_DIR = resolve(ROOT, 'test/gold');
const SCORES_DIR = resolve(ROOT, 'test/scores');

const args = process.argv.slice(2);
const onlyDomain = args.find(a => !a.startsWith('--'));
const jsonOut = args.includes('--json');
const failBelow = (() => {
  const i = args.findIndex(a => a === '--fail-below');
  return i >= 0 ? Number(args[i + 1]) : null;
})();

async function pkgVersion() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

async function listGoldSites() {
  if (!existsSync(GOLD_DIR)) return [];
  const dirs = await readdir(GOLD_DIR);
  const out = [];
  for (const d of dirs) {
    const f = resolve(GOLD_DIR, d, 'expected.json');
    if (!existsSync(f)) continue;
    const expected = JSON.parse(await readFile(f, 'utf-8'));
    if (expected.skipped) continue;
    out.push({ domain: d, expected });
  }
  return out;
}

async function runDembrandt(url) {
  const screenshotPath = resolve(tmpdir(), `dembrandt-score-${Date.now()}.png`);
  return await new Promise((res, rej) => {
    const proc = spawn(process.execPath, [
      resolve(ROOT, 'dist', 'index.js'),
      url,
      '--json-only',
      '--screenshot', screenshotPath,
    ], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code !== 0) return rej(new Error(`exit ${code}: ${stderr.slice(0, 300)}`));
      try {
        const json = JSON.parse(stdout);
        json._screenshotPath = screenshotPath;
        res(json);
      } catch (e) {
        rej(new Error(`JSON parse: ${e.message}`));
      }
    });
  });
}

function bar(score) {
  if (score == null) return ' (no data)';
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
  return ` ${color}${'█'.repeat(filled)}${'░'.repeat(empty)} ${score}\x1b[0m`;
}

function metaTag(v) {
  if (!v?.userMeta) return '';
  const m = v.userMeta;
  const parts = [];
  if (m.verdict) parts.push(`\x1b[36m${m.verdict}\x1b[0m`);
  if (m.comment) parts.push(`"${m.comment}"`);
  return parts.length ? `  [${parts.join(' · ')}]` : '';
}
function printBreakdown(b) {
  const fmt = (k, v) => `    ${k}: ${v.score != null ? v.score : '-'}${k === 'primary' || k === 'secondary' ? `  (expect ${v.expected}, got ${v.actualSemantic || v.bestInPalette || 'none'}, ΔE ${v.bestDeltaE ?? '-'})` : ''}${metaTag(v)}`;
  for (const [k, v] of Object.entries(b)) {
    if (k === 'brandPalette') {
      console.log(`    brandPalette: ${v.score}${metaTag(v)}`);
      for (const d of v.details) {
        console.log(`      ${d.expected} → ${d.bestMatch || 'none'} (ΔE ${d.deltaE ?? '-'}, score ${d.score})`);
      }
      continue;
    }
    if (k === 'logoUrl') { console.log(`    logoUrl: ${v.score}  (expect ${v.expected}, got ${v.actual || 'none'})${metaTag(v)}`); continue; }
    if (k === 'primaryFont' || k === 'secondaryFont') {
      console.log(`    ${k}: ${v.score}  (expect ${v.expected}, top ${v.actualTop.slice(0,3).join(', ')})${metaTag(v)}`);
      continue;
    }
    console.log(fmt(k, v));
  }
}

async function main() {
  const sites = await listGoldSites();
  const filtered = onlyDomain ? sites.filter(s => s.domain === onlyDomain) : sites;
  if (filtered.length === 0) {
    console.error(onlyDomain ? `no gold expected.json for ${onlyDomain}` : 'no gold sites labeled. run `npm run gold:label` first.');
    process.exit(1);
  }
  const version = await pkgVersion();
  console.log(`\nGold benchmark · dembrandt ${version} · ${filtered.length} site(s)\n`);

  const results = [];
  for (const { domain, expected } of filtered) {
    process.stdout.write(`▸ ${domain.padEnd(20)} extracting...`);
    let actual = null, error = null, score = null;
    try {
      actual = await runDembrandt(expected.url);
      score = scoreSite(expected, actual);
    } catch (e) {
      error = e.message;
    }
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    if (error) {
      console.log(`✗ ${domain.padEnd(20)} ERROR: ${error}`);
      results.push({ domain, url: expected.url, error });
      continue;
    }
    console.log(`▸ ${domain.padEnd(20)}${bar(score.aggregate)}`);
    if (!jsonOut) printBreakdown(score.breakdown);
    results.push({
      domain, url: expected.url, aggregate: score.aggregate, breakdown: score.breakdown,
      screenshotPath: actual._screenshotPath,
    });
  }

  const scored = results.filter(r => r.aggregate != null);
  const aggregate = scored.length ? Math.round(scored.reduce((s, r) => s + r.aggregate, 0) / scored.length) : null;

  console.log('\n' + '─'.repeat(60));
  console.log(`AGGREGATE${' '.repeat(11)}${bar(aggregate)}   (${scored.length}/${results.length} sites scored)`);
  console.log('─'.repeat(60) + '\n');

  await mkdir(SCORES_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = resolve(SCORES_DIR, `${version}_${ts}.json`);
  await writeFile(outFile, JSON.stringify({
    version, timestamp: new Date().toISOString(), aggregate, results,
  }, null, 2));
  console.log(`saved → ${outFile}\n`);

  if (failBelow != null && aggregate != null && aggregate < failBelow) {
    console.error(`✗ aggregate ${aggregate} < threshold ${failBelow}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
