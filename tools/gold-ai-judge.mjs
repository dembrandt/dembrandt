#!/usr/bin/env node
// AI judge: sends site screenshot + extracted brand summary to a vision LLM
// (OpenAI or Anthropic), gets a 1-10 rubric score per dimension. Used for
// sites where hand-labeled gold expectations are too expensive to maintain
// (coverage corpus), or as a second opinion alongside hand labels.
//
// Provider selection:
//   --provider openai | claude | both
//   default: 'openai' if OPENAI_API_KEY set, else 'claude'
//
// Requires the matching API key in env.

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loadEnv } from './env.mjs';

await loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const JUDGE_DIR = resolve(ROOT, 'test/scores/ai-judge');
const QUEUE_FILE = resolve(ROOT, 'test/gold-queue.json');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_JUDGE_MODEL || 'gpt-4o-mini';
const CLAUDE_MODEL = process.env.CLAUDE_JUDGE_MODEL || 'claude-haiku-4-5-20251001';

const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('http'));
const force = args.includes('--force');
let provider = (() => {
  const i = args.findIndex(a => a === '--provider');
  if (i >= 0) return args[i + 1];
  if (OPENAI_KEY) return 'openai';
  if (ANTHROPIC_KEY) return 'claude';
  return null;
})();

if (!provider) {
  console.error('No API key set. Export OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --provider.');
  process.exit(2);
}

const providers = provider === 'both' ? ['openai', 'claude'] : [provider];
for (const p of providers) {
  if (p === 'openai' && !OPENAI_KEY) { console.error('OPENAI_API_KEY not set.'); process.exit(2); }
  if (p === 'claude' && !ANTHROPIC_KEY) { console.error('ANTHROPIC_API_KEY not set.'); process.exit(2); }
}

async function runDembrandt(url) {
  const screenshotPath = resolve(tmpdir(), `judge-${Date.now()}.png`);
  return await new Promise((res, rej) => {
    const proc = spawn(process.execPath, [
      resolve(ROOT, 'dist', 'index.js'),
      url, '--json-only', '--screenshot', screenshotPath,
    ], { cwd: ROOT });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code !== 0) return rej(new Error(`exit ${code}: ${stderr.slice(0, 300)}`));
      try {
        const json = JSON.parse(stdout);
        json._screenshotPath = screenshotPath;
        res(json);
      } catch (e) { rej(e); }
    });
  });
}

function summarizeForJudge(extraction) {
  const c = extraction.colors || {};
  const t = extraction.typography || {};
  const palette = (c.palette || []).slice(0, 8).map(p => p.color).filter(Boolean);
  const fonts = [];
  const seen = new Set();
  for (const s of (t.styles || [])) {
    const fam = (s.family || '').replace(/['"]/g, '').split(',')[0].trim();
    if (!fam || seen.has(fam.toLowerCase())) continue;
    seen.add(fam.toLowerCase());
    fonts.push(fam);
    if (fonts.length >= 5) break;
  }
  return {
    primary: c.semantic?.primary || null,
    secondary: c.semantic?.secondary || null,
    palette,
    fonts,
    logoUrl: extraction.logo?.url || null,
  };
}

function buildPrompt(summary, url, expectedMeta) {
  let context = '';
  if (expectedMeta && Object.keys(expectedMeta).length > 0) {
    const notes = [];
    for (const [field, m] of Object.entries(expectedMeta)) {
      if (m.verdict || m.comment) {
        notes.push(`  ${field}: verdict=${m.verdict || '-'}${m.comment ? `, comment="${m.comment}"` : ''}`);
      }
    }
    if (notes.length) {
      context = `\n\nHuman labeler's notes (use as context for your scoring, do not blindly trust):\n${notes.join('\n')}`;
    }
  }

  return `You are auditing how well an automated tool extracted a brand's visual identity from this website.

Site: ${url}
Screenshot is attached.

Tool's extraction:
- Primary color: ${summary.primary || '(none)'}
- Secondary color: ${summary.secondary || '(none)'}
- Top palette (8): ${summary.palette.join(', ') || '(none)'}
- Fonts (top 5): ${summary.fonts.join(', ') || '(none)'}
- Logo URL: ${summary.logoUrl || '(none)'}${context}

Rate each dimension 1-10. 10 means a brand designer would agree completely. 1 means clearly wrong. Be strict, not generous.

Dimensions:
- primary_color: extracted primary IS the actual brand primary (as a designer would name it)
- palette_completeness: top palette captures the brand's key colors without significant junk (neutral greys, ads, structural greys = junk)
- font_accuracy: primary font in the list matches what the site visibly uses for body and headlines
- logo_correctness: logo URL points to the actual brand wordmark/symbol, not a favicon, ad, or unrelated image

Respond as JSON only. No prose before or after. Schema:
{
  "primary_color": <1-10>,
  "palette_completeness": <1-10>,
  "font_accuracy": <1-10>,
  "logo_correctness": <1-10>,
  "notes": "<one sentence each on what was right and what was wrong>"
}`;
}

function parseJudgmentText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON in response: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(m[0]);
  const dims = ['primary_color', 'palette_completeness', 'font_accuracy', 'logo_correctness'];
  const overall = Math.round(dims.reduce((s, d) => s + (parsed[d] || 0), 0) / dims.length * 10);
  return { ...parsed, overall_100: overall };
}

async function callClaude(screenshotB64, prompt) {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotB64 } },
        { type: 'text', text: prompt },
      ],
    }],
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  return { ...parseJudgmentText(text), usage: data.usage, model: CLAUDE_MODEL };
}

async function callOpenAI(screenshotB64, prompt) {
  const body = {
    model: OPENAI_MODEL,
    max_tokens: 600,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotB64}` } },
      ],
    }],
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${OPENAI_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { ...parseJudgmentText(text), usage: data.usage, model: OPENAI_MODEL };
}

async function callProvider(p, screenshotB64, prompt) {
  if (p === 'openai') return callOpenAI(screenshotB64, prompt);
  if (p === 'claude') return callClaude(screenshotB64, prompt);
  throw new Error(`unknown provider: ${p}`);
}

async function loadExpectedMeta(domain) {
  const expectedPath = resolve(ROOT, 'test/gold', domain, 'expected.json');
  if (!existsSync(expectedPath)) return null;
  try {
    const data = JSON.parse(await readFile(expectedPath, 'utf-8'));
    return data.meta || null;
  } catch { return null; }
}

async function judgeSite(url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  await mkdir(JUDGE_DIR, { recursive: true });
  const cacheFile = resolve(JUDGE_DIR, `${domain}.json`);

  const providerLabel = providers.length === 1 ? providers[0] : 'both';
  console.log(`▸ judging ${domain} (${providerLabel})`);
  console.log(`  extracting...`);
  const extraction = await runDembrandt(url);
  const screenshot = await readFile(extraction._screenshotPath);
  const hash = createHash('sha256').update(screenshot).digest('hex').slice(0, 12);

  let cached = null;
  if (!force && existsSync(cacheFile)) {
    try { cached = JSON.parse(await readFile(cacheFile, 'utf-8')); } catch {}
  }

  const expectedMeta = await loadExpectedMeta(domain);
  const summary = summarizeForJudge(extraction);
  const prompt = buildPrompt(summary, url, expectedMeta);
  const b64 = screenshot.toString('base64');

  const results = cached?.results || {};
  for (const p of providers) {
    const cachedForP = cached?.results?.[p];
    if (!force && cachedForP && cachedForP.screenshotHash === hash) {
      console.log(`  ${p}: cached overall ${cachedForP.overall_100}`);
      results[p] = cachedForP;
      continue;
    }
    console.log(`  ${p}: asking...`);
    try {
      const j = await callProvider(p, b64, prompt);
      results[p] = { ...j, screenshotHash: hash };
      console.log(`  ${p}: overall ${j.overall_100}  (model ${j.model})`);
      if (j.notes) console.log(`        ${j.notes}`);
    } catch (e) {
      results[p] = { error: e.message };
      console.log(`  ${p}: ERROR ${e.message}`);
    }
  }

  // disagreement metric when both providers ran
  let disagreement = null;
  if (results.openai?.overall_100 != null && results.claude?.overall_100 != null) {
    disagreement = Math.abs(results.openai.overall_100 - results.claude.overall_100);
    console.log(`  disagreement: ${disagreement}${disagreement > 15 ? ' (HIGH, review manually)' : ''}`);
  }

  const record = {
    url, domain, timestamp: new Date().toISOString(),
    screenshotHash: hash, summary, expectedMeta, results, disagreement,
  };
  await writeFile(cacheFile, JSON.stringify(record, null, 2));
  return record;
}

async function main() {
  if (urlArg) {
    await judgeSite(urlArg);
    return;
  }
  if (!existsSync(QUEUE_FILE)) {
    console.error('no URL given and no gold-queue.json present. usage: gold-ai-judge.mjs <url> [--provider openai|claude|both] [--force]');
    process.exit(1);
  }
  const queue = JSON.parse(await readFile(QUEUE_FILE, 'utf-8'));
  const aggregateByProvider = {};
  let aggregateBoth = [];
  for (const s of queue.sites) {
    try {
      const r = await judgeSite(s.url);
      for (const p of providers) {
        if (r.results[p]?.overall_100 != null) {
          aggregateByProvider[p] = aggregateByProvider[p] || [];
          aggregateByProvider[p].push(r.results[p].overall_100);
        }
      }
      if (r.disagreement != null) aggregateBoth.push(r.disagreement);
    } catch (e) {
      console.error(`  ✗ ${s.url}: ${e.message}`);
    }
  }
  console.log('');
  for (const [p, scores] of Object.entries(aggregateByProvider)) {
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    console.log(`${p} aggregate: ${avg}/100 across ${scores.length} sites`);
  }
  if (aggregateBoth.length > 0) {
    const avgDis = Math.round(aggregateBoth.reduce((s, v) => s + v, 0) / aggregateBoth.length);
    console.log(`mean provider disagreement: ${avgDis} points`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
