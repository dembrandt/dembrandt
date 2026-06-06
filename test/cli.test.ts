import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser-free CLI plumbing tests: arg parsing, file IO, exit codes, and module
// resolution. These exercise the layer that produced the mcp-hosted import bug
// and the JSON-lint exit-code bug — neither of which needs a real browser, since
// they fail (or run) before any extraction. Extraction-based tests live in the
// smoke job, which has Playwright installed.

const indexJs = fileURLToPath(new URL('../index.js', import.meta.url));
const mcpServerJs = fileURLToPath(new URL('../mcp-server.js', import.meta.url));

function run(args, opts = {}) {
  return spawnSync('node', [indexJs, ...args], { encoding: 'utf8', ...opts });
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), 'dembrandt-cli-'));
}

test('--version exits 0 and prints a semver', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('--help exits 0 and shows the core workflow', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /drift/);
  assert.match(r.stdout, /init/);
});

test('drift without a baseline exits 1 with a guiding message', () => {
  const r = run(['drift'], { cwd: tempProject() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No \.dembrandt\/config\.json/);
});

test('conformance without a contract exits 1 with a guiding message', () => {
  const r = run(['conformance', 'example.com'], { cwd: tempProject() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Contract not found/);
});

test('conformance with a missing --contract path exits 1', () => {
  const r = run(['conformance', 'example.com', '--contract', './nope.json'], { cwd: tempProject() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Contract not found/);
});

test('conformance with an invalid JSON contract exits 1', () => {
  const dir = tempProject();
  mkdirSync(join(dir, '.dembrandt'));
  writeFileSync(join(dir, '.dembrandt', 'tokens.json'), '{ not valid json');
  const r = run(['conformance', 'example.com'], { cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not be parsed/);
});

test('mcp-server.js resolves its imports and starts (does not crash on load)', () => {
  // If an import is broken (the mcp-hosted bug class), node exits fast with
  // ERR_MODULE_NOT_FOUND. If it loads, it blocks on stdio until the timeout.
  const r = spawnSync('node', [mcpServerJs], { encoding: 'utf8', timeout: 2500 });
  assert.doesNotMatch(r.stderr || '', /ERR_MODULE_NOT_FOUND|Cannot find module/);
});
