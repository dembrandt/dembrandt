import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';

/**
 * A redirect to another origin lands on a robots.txt the entry check never
 * read. Only the real CLI can catch that wiring: the entry URL is allowed, and
 * the decision that matters is taken after navigation.
 */

const run = promisify(execFile);
const indexJs = fileURLToPath(new URL('../index.js', import.meta.url));

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Landing fixture</title><style>
  :root { --brand-ink: #1d4ed8; }
  body { margin: 0; font-family: Georgia, serif; font-size: 16px; line-height: 1.5;
         color: #202124; background: #ffffff; }
  h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
  .cta { background: var(--brand-ink); color: #ffffff; border-radius: 8px;
         padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); border: 0; }
  .card { border-radius: 8px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
  @media (min-width: 768px) { .card { padding: 32px; } }
</style></head>
<body>
  <header><h1>Landing fixture</h1></header>
  <main>
    <p>Body copy so the body font and size are measured on real text.</p>
    <div class="card"><p>Card copy.</p><button class="cta">Primary action</button></div>
  </main>
</body></html>`;

let landing: Server;
let entry: Server;
let landingOrigin: string;
let entryOrigin: string;
let workdir: string;

before(async () => {
  landing = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /\n');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });

  entry = createServer((req, res) => {
    // No robots.txt of its own: the entry origin reserves nothing, so the run
    // gets past the entry check and the landing origin is the only refusal.
    if (req.url === '/robots.txt') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(302, { location: landingOrigin + '/' });
    res.end();
  });

  await new Promise<void>(resolve => landing.listen(0, '127.0.0.1', resolve));
  await new Promise<void>(resolve => entry.listen(0, '127.0.0.1', resolve));
  const l = landing.address();
  const e = entry.address();
  assert.ok(l && typeof l === 'object' && e && typeof e === 'object', 'servers did not bind');
  landingOrigin = `http://127.0.0.1:${l.port}`;
  entryOrigin = `http://127.0.0.1:${e.port}`;
  workdir = mkdtempSync(join(tmpdir(), 'dembrandt-robots-e2e-'));
});

after(() => {
  landing?.close();
  entry?.close();
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

test('an enforcing run refuses the origin it was redirected to', { timeout: 180_000 }, async () => {
  const err = await run('node', [indexJs, entryOrigin, '--json-only'], {
    cwd: workdir,
    encoding: 'utf8',
    timeout: 170_000,
    env: { ...process.env, DEMBRANDT_ENFORCE_ROBOTS: '1', DEMBRANDT_NO_HINTS: '1' },
  }).then(() => null, (e) => e);

  assert.ok(err, 'the run should not have succeeded');
  assert.equal(err.code, 4);
  assert.match(err.stderr, /redirected from/);
});

test('the same redirect only warns when nobody is enforcing', { timeout: 180_000 }, async () => {
  const { stdout } = await run('node', [indexJs, entryOrigin, '--json-only'], {
    cwd: workdir,
    encoding: 'utf8',
    timeout: 170_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DEMBRANDT_NO_HINTS: '1' },
  });

  const result = JSON.parse(stdout);
  assert.equal(new URL(result.url).port, new URL(landingOrigin).port);
  assert.match(result.meta.robotsWarnings.join(' '), /robots\.txt disallows/);
});
