import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Browser-free CLI plumbing tests: arg parsing, exit codes, help output. These
// run before any extraction, so they need no browser. Import resolution is now
// covered by tsc/build (an unresolved import fails compilation), so there is no
// separate runtime module-load test here.

const indexJs = fileURLToPath(new URL('../index.js', import.meta.url));

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

test('reveal is standard (no enable flag exposed)', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  // Reveal runs by default; there must be no --menus/--reveal opt-in flag.
  assert.doesNotMatch(r.stdout, /--menus|--reveal\b/);
});

test('the missing-engine hint names the engine so the fix actually applies', async () => {
  const { PlaywrightMissingError } = await import('../lib/browser.js');
  // install-browser defaults to chromium, so a bare hint sends a firefox user
  // to a command that reinstalls chromium and leaves the same error standing.
  assert.match(new PlaywrightMissingError('firefox').message, /install-browser firefox/);
  assert.match(new PlaywrightMissingError().message, /install-browser chromium/);
});
