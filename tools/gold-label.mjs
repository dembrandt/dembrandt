#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnv } from './env.mjs';

await loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const QUEUE_FILE = resolve(ROOT, 'test/gold-queue.json');
const GOLD_DIR = resolve(ROOT, 'test/gold');
const UI_FILE = resolve(__dirname, 'gold-label.html');
const PORT = Number(process.env.PORT || 3737);

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

async function loadQueue() {
  return JSON.parse(await readFile(QUEUE_FILE, 'utf-8'));
}

async function listLabeled() {
  if (!existsSync(GOLD_DIR)) return [];
  const dirs = await readdir(GOLD_DIR);
  const out = [];
  for (const d of dirs) {
    const f = resolve(GOLD_DIR, d, 'expected.json');
    if (existsSync(f)) out.push(d);
  }
  return out;
}

async function getNextSite() {
  const queue = await loadQueue();
  const labeled = new Set(await listLabeled());
  const remaining = queue.sites.filter(s => !labeled.has(domainOf(s.url)));
  return {
    viewport: queue.viewport,
    next: remaining[0] || null,
    total: queue.sites.length,
    done: queue.sites.length - remaining.length,
    remaining: remaining.map(s => domainOf(s.url)),
  };
}

const extractionCache = new Map();

async function runExtraction(url) {
  if (extractionCache.has(url)) return extractionCache.get(url);
  const promise = (async () => {
    const ts = Date.now();
    const screenshotPath = resolve(tmpdir(), `dembrandt-gold-${ts}.png`);
    return await new Promise((res, rej) => {
      const proc = spawn(process.execPath, [
        resolve(ROOT, 'dist', 'index.js'),
        url,
        '--json-only',
        '--screenshot', screenshotPath,
        '--raw-colors',
      ], { cwd: ROOT });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code !== 0) return rej(new Error(`Extraction exit ${code}: ${stderr.slice(0, 500)}`));
        try {
          const json = JSON.parse(stdout);
          json._screenshotPath = screenshotPath;
          res(json);
        } catch (e) {
          rej(new Error(`JSON parse failed: ${e.message}. stderr: ${stderr.slice(0, 200)}`));
        }
      });
    });
  })();
  extractionCache.set(url, promise);
  return promise;
}

const aiSuggestCache = new Map();

async function aiSuggest(url, screenshotPath) {
  if (aiSuggestCache.has(url)) return aiSuggestCache.get(url);
  const promise = (async () => {
    const key = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return { error: 'no API key set in env or .env.local', enabled: false };
    if (!existsSync(screenshotPath)) return { error: 'no screenshot available' };
    const provider = process.env.OPENAI_API_KEY ? 'openai' : 'claude';
    const buf = await readFile(screenshotPath);
    const b64 = buf.toString('base64');
    const prompt = `Look at this website screenshot. Identify the brand's visual identity. Respond as JSON only, no prose.

{
  "primary_hex": "#RRGGBB" or null,
  "primary_description": "short visual description, e.g. 'vivid violet used on the hero CTA button'",
  "secondary_hex": "#RRGGBB" or null,
  "secondary_description": "..." or null,
  "additional_brand_hexes": ["#RRGGBB", ...] up to 3 extra brand colors,
  "primary_font_guess": "font family name your best guess" or null,
  "logo_description": "where the logo appears, e.g. 'top-left wordmark in dark text'"
}

Hex values are approximations: name the color you see, don't pixel-pick. Aim within ~15 of the right hue but expect the human to fine-tune. Use null for fields you cannot determine confidently.`;

    if (provider === 'openai') {
      const body = {
        model: process.env.OPENAI_JUDGE_MODEL || 'gpt-4o-mini',
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        }],
      };
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        return { error: `OpenAI ${res.status}: ${t.slice(0, 200)}`, provider };
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { error: 'no JSON in response', provider, raw: text.slice(0, 200) };
      try {
        return { ...JSON.parse(m[0]), provider, model: body.model, enabled: true };
      } catch (e) {
        return { error: `JSON parse: ${e.message}`, provider, raw: text.slice(0, 200) };
      }
    } else {
      const body = {
        model: process.env.CLAUDE_JUDGE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      };
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        return { error: `Claude ${res.status}: ${t.slice(0, 200)}`, provider };
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { error: 'no JSON in response', provider, raw: text.slice(0, 200) };
      try {
        return { ...JSON.parse(m[0]), provider, model: body.model, enabled: true };
      } catch (e) {
        return { error: `JSON parse: ${e.message}`, provider, raw: text.slice(0, 200) };
      }
    }
  })();
  aiSuggestCache.set(url, promise);
  return promise;
}

async function generateBrandGuide(url) {
  const ts = Date.now();
  return await new Promise((res, rej) => {
    const proc = spawn(process.execPath, [
      resolve(ROOT, 'dist', 'index.js'),
      url, '--brand-guide', '--json-only',
    ], { cwd: ROOT });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code !== 0) return rej(new Error(`brand-guide exit ${code}: ${stderr.slice(0, 300)}`));
      // PDF lands in cwd/output/<domain>/<file>.pdf. Find the latest.
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        const dir = resolve(ROOT, 'output', domain);
        if (!existsSync(dir)) return rej(new Error('output dir missing'));
        readdir(dir).then(files => {
          const pdfs = files.filter(f => f.endsWith('.pdf'))
            .map(f => ({ name: f, path: resolve(dir, f) }));
          if (pdfs.length === 0) return rej(new Error('no PDF generated'));
          Promise.all(pdfs.map(p => stat(p.path).then(s => ({ ...p, mtime: s.mtimeMs }))))
            .then(stats => {
              stats.sort((a, b) => b.mtime - a.mtime);
              res(stats[0].path);
            });
        });
      } catch (e) { rej(e); }
    });
  });
}

async function saveExpected(domain, payload) {
  const dir = resolve(GOLD_DIR, domain);
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, 'expected.json');
  const data = {
    ...payload,
    labeledAt: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(data, null, 2));
  return file;
}

function readBody(req) {
  return new Promise((res, rej) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

function send(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, 'application/json', JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'GET' && u.pathname === '/') {
      const html = await readFile(UI_FILE, 'utf-8');
      return send(res, 200, 'text/html; charset=utf-8', html);
    }

    if (req.method === 'GET' && u.pathname === '/api/status') {
      return sendJson(res, 200, await getNextSite());
    }

    if (req.method === 'POST' && u.pathname === '/api/extract') {
      const body = JSON.parse((await readBody(req)).toString());
      if (!body.url) return sendJson(res, 400, { error: 'url required' });
      const result = await runExtraction(body.url);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && u.pathname === '/api/prefetch') {
      const body = JSON.parse((await readBody(req)).toString());
      const urls = Array.isArray(body.urls) ? body.urls : [];
      // fire and forget
      for (const url of urls) {
        if (!extractionCache.has(url)) runExtraction(url).catch(() => {});
      }
      return sendJson(res, 200, { ok: true, queued: urls.length });
    }

    if (req.method === 'GET' && u.pathname === '/api/screenshot') {
      const p = u.searchParams.get('path');
      if (!p || !existsSync(p)) return sendJson(res, 404, { error: 'not found' });
      const buf = await readFile(p);
      const ext = extname(p).slice(1).toLowerCase();
      return send(res, 200, `image/${ext === 'jpg' ? 'jpeg' : ext}`, buf);
    }

    if (req.method === 'GET' && u.pathname === '/api/file') {
      const p = u.searchParams.get('path');
      if (!p || !existsSync(p)) return sendJson(res, 404, { error: 'not found' });
      const buf = await readFile(p);
      const ext = extname(p).slice(1).toLowerCase();
      const ct = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';
      return send(res, 200, ct, buf);
    }

    if (req.method === 'POST' && u.pathname === '/api/ai-suggest') {
      const body = JSON.parse((await readBody(req)).toString());
      if (!body.url) return sendJson(res, 400, { error: 'url required' });
      // Need a screenshot. Re-use cached extraction if present.
      let screenshotPath = body.screenshotPath;
      if (!screenshotPath && extractionCache.has(body.url)) {
        try {
          const e = await extractionCache.get(body.url);
          screenshotPath = e._screenshotPath;
        } catch {}
      }
      if (!screenshotPath) return sendJson(res, 400, { error: 'no screenshot. run /api/extract first.' });
      const result = await aiSuggest(body.url, screenshotPath);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && u.pathname === '/api/brand-guide') {
      const body = JSON.parse((await readBody(req)).toString());
      if (!body.url) return sendJson(res, 400, { error: 'url required' });
      const path = await generateBrandGuide(body.url);
      return sendJson(res, 200, { path });
    }

    if (req.method === 'POST' && u.pathname === '/api/save') {
      const body = JSON.parse((await readBody(req)).toString());
      if (!body.url) return sendJson(res, 400, { error: 'url required' });
      const domain = domainOf(body.url);
      if (!domain) return sendJson(res, 400, { error: 'invalid url' });
      const file = await saveExpected(domain, body);
      extractionCache.delete(body.url);
      return sendJson(res, 200, { ok: true, file });
    }

    if (req.method === 'POST' && u.pathname === '/api/skip') {
      const body = JSON.parse((await readBody(req)).toString());
      extractionCache.delete(body.url);
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    sendJson(res, 500, { error: e.message, stack: e.stack });
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`gold labeler ready at ${url}`);
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  if (!process.env.NO_OPEN) {
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
  }
});
