import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
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

test('--version exits 0 and prints a semver', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('--help exits 0 and shows the extraction usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Extract design tokens/);
  assert.match(r.stdout, /--dtcg/);
});

test('mcp-server.js resolves its imports and starts (does not crash on load)', () => {
  // If an import is broken (the mcp-hosted bug class), node exits fast with
  // ERR_MODULE_NOT_FOUND. If it loads, it blocks on stdio until the timeout.
  const r = spawnSync('node', [mcpServerJs], { encoding: 'utf8', timeout: 2500 });
  assert.doesNotMatch(r.stderr || '', /ERR_MODULE_NOT_FOUND|Cannot find module/);
});
