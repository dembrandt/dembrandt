import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8'));

test('server.json names the same server the npm package claims', () => {
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.packages[0].transport.type, 'stdio');
  assert.deepEqual(server.packages[0].packageArguments.map((a: { value: string }) => a.value), ['mcp']);
  assert.ok(server.description.length <= 100, `description is ${server.description.length} chars`);
});
