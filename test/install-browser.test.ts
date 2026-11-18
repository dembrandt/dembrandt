import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const installer = new URL('../lib/install-browser.js', import.meta.url).href;

test('browser install output never reaches stdout, so --json-only stays parseable on a first run', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e',
    `const { installBrowsers } = await import(${JSON.stringify(installer)}); installBrowsers(['no-such-engine']);`,
  ], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /Installing Playwright no-such-engine/);
});
