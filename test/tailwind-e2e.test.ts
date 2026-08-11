import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { compile } from './helpers/tailwind-compile.js';

/**
 * The only test that exercises `--tailwind` the way a user does: the real CLI,
 * a real browser, a real page, a file on disk. Everything else calls the
 * emitter directly and so cannot catch the flag being unwired, the default path
 * being wrong, or the extractor handing the emitter something it cannot read.
 *
 * Served from localhost rather than a live site so the assertion can be on
 * specific values, and so this never fails because someone else redesigned.
 *
 * The runs must stay asynchronous: the fixture server lives in this process, so
 * a blocking spawnSync would stop the event loop and the page would never be
 * served to the browser the CLI just launched.
 */

const run = promisify(execFile);

/** The CLI writes its notices to stdout and exits non-zero only on failure. */
async function dembrandt(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run('node', [indexJs, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 170_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Theme fixture</title><style>
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
  <header><h1>Theme fixture</h1></header>
  <main>
    <p>Body copy so the body font and size are measured on real text.</p>
    <div class="card"><p>Card copy.</p><button class="cta">Primary action</button></div>
  </main>
</body></html>`;

const indexJs = fileURLToPath(new URL('../index.js', import.meta.url));

let server: Server;
let origin: string;
let workdir: string;

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server did not bind a port');
  origin = `http://127.0.0.1:${address.port}`;

  workdir = mkdtempSync(join(tmpdir(), 'dembrandt-e2e-'));
});

after(() => {
  server?.close();
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

test('--tailwind writes a compilable theme from a real extraction', { timeout: 180_000 }, async () => {
  const themePath = join(workdir, 'theme.css');

  // cwd matters: a relative --tailwind path resolves against it, and the run
  // otherwise litters the repo with output/.
  const stdout = await dembrandt([origin, '--tailwind', themePath], workdir);

  assert.ok(existsSync(themePath), `no theme written\n${stdout}`);
  // The saved-file notice is how the user learns where it went; a silent write
  // is indistinguishable from the flag being ignored.
  assert.match(stdout, /--tailwind/);

  const css = readFileSync(themePath, 'utf8');

  // Values the fixture page actually declares. These are the assertion that the
  // pipeline carried real measurements end to end rather than merely producing
  // a syntactically valid file.
  assert.match(css, /--color-[a-z0-9-]+: #1d4ed8;/);
  assert.match(css, /--text-body: 16px;/);
  assert.match(css, /--radius-\w+: 8px;/);
  assert.match(css, /--font-weight-bold: 700;/);

  // And it has to be a theme Tailwind accepts, not just a file we wrote.
  const out = compile(css, ['bg-primary', 'text-body']);
  assert.ok(out.includes('@layer theme'), 'the extracted theme did not survive compilation');
});

test('bare --tailwind writes to the documented default path', { timeout: 180_000 }, async () => {
  const stdout = await dembrandt([origin, '--tailwind'], workdir);

  // README and --help both promise output/<domain>/theme.css. The domain of a
  // localhost origin is the host, so this also pins that the path is derived
  // from the URL rather than hardcoded.
  const expected = join(workdir, 'output', '127.0.0.1', 'theme.css');
  assert.ok(existsSync(expected), `expected ${expected}\n${stdout}`);
});
