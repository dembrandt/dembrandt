#!/usr/bin/env node
/**
 * Tailwind drift watch.
 *
 * The Tailwind export is text, not a dependency, so nothing breaks at runtime
 * when Tailwind ships. What DOES invalidate the emitter is a new major, which is
 * when the theme namespaces can be renamed or re-scoped (v3's JS config became
 * v4's `@theme` exactly that way). This queries the npm registry for the
 * published latest and exits non-zero when it has moved past the major
 * lib/formatters/tailwind.ts declares.
 *
 * Exit codes: 0 in sync, 1 new major (act), 2 could not check (network).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Read the target off the source rather than importing dist, so the check runs
// without a build step.
const source = readFileSync(join(root, 'lib/formatters/tailwind.ts'), 'utf8');
const declared = /TAILWIND_TARGET_MAJOR\s*=\s*(\d+)/.exec(source);
if (!declared) {
  console.error('Could not read TAILWIND_TARGET_MAJOR from lib/formatters/tailwind.ts');
  process.exit(2);
}
const target = Number(declared[1]);

let latest;
try {
  const res = await fetch('https://registry.npmjs.org/tailwindcss/latest', {
    headers: { accept: 'application/vnd.npm.install-v1+json, application/json' },
  });
  if (!res.ok) throw new Error(`registry responded ${res.status}`);
  latest = (await res.json()).version;
} catch (err) {
  console.error(`Could not reach the npm registry: ${err.message}`);
  process.exit(2);
}

const latestMajor = Number(String(latest).split('.')[0]);
if (!Number.isFinite(latestMajor)) {
  console.error(`Unparseable tailwindcss version from registry: ${latest}`);
  process.exit(2);
}

if (latestMajor <= target) {
  console.log(`tailwindcss ${latest} — emitter targets v${target}, in sync.`);
  process.exit(0);
}

const namespaces = (/TAILWIND_NAMESPACES[\s\S]*?\[([\s\S]*?)\]/.exec(source)?.[1] ?? '')
  .match(/'([^']+)'/g)
  ?.map(s => s.replace(/'/g, '')) ?? [];

console.error(
  [
    `tailwindcss ${latest} is a new major; the emitter targets v${target}.`,
    '',
    'Check whether these theme namespaces still exist and still mean the same thing:',
    ...namespaces.map(n => `  ${n}`),
    '',
    'Then update TAILWIND_TARGET_MAJOR in lib/formatters/tailwind.ts.',
  ].join('\n')
);
process.exit(1);
