#!/usr/bin/env node
/**
 * DESIGN.md spec drift watch.
 *
 * The DESIGN.md format is owned by google-labs-code/design.md, not by us. Our
 * `--design-md` export has to satisfy a spec we do not control, so the failure
 * mode is not a broken build: it is our export quietly ceasing to validate
 * while everything here still passes.
 *
 * The spec is pre-1.0, so a MINOR bump is the breaking one. This queries the
 * npm registry for the published latest of @google/design.md and exits
 * non-zero when it has moved past the version lib/formatters/markdown.ts
 * declares.
 *
 * Exit codes: 0 in sync, 1 new spec release (act), 2 could not check (network).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Read the target off the source rather than importing dist, so the check runs
// without a build step. Same reasoning as tools/tailwind-check.mjs.
const source = readFileSync(join(root, 'lib/formatters/markdown.ts'), 'utf8');
const declared = /DESIGN_MD_TARGET_SPEC\s*=\s*'([\d.]+)'/.exec(source);
if (!declared) {
  console.error('Could not read DESIGN_MD_TARGET_SPEC from lib/formatters/markdown.ts');
  process.exit(2);
}
const target = declared[1];

let latest;
try {
  const res = await fetch('https://registry.npmjs.org/@google%2Fdesign.md/latest', {
    headers: { accept: 'application/vnd.npm.install-v1+json, application/json' },
  });
  if (!res.ok) throw new Error(`registry responded ${res.status}`);
  latest = (await res.json()).version;
} catch (err) {
  console.error(`Could not reach the npm registry: ${err.message}`);
  process.exit(2);
}

const series = (v) => String(v).split('.').slice(0, 2).join('.');
const rank = (v) => String(v).split('.').slice(0, 2).map(Number);
const [tMajor, tMinor] = rank(target);
const [lMajor, lMinor] = rank(latest);
if (![tMajor, tMinor, lMajor, lMinor].every(Number.isFinite)) {
  console.error(`Unparseable version pair: target ${target}, registry ${latest}`);
  process.exit(2);
}

if (lMajor < tMajor || (lMajor === tMajor && lMinor <= tMinor)) {
  console.log(`@google/design.md ${latest} — emitter targets ${target}, in sync.`);
  process.exit(0);
}

console.error(
  [
    `@google/design.md ${latest} is a new spec release; the emitter targets ${target}.`,
    '',
    'The spec is pre-1.0, so a minor bump is allowed to break the format. Check',
    'docs/spec.md upstream for changes to:',
    '  section order and allowed headings',
    '  token types (Color, Dimension, Typography) and the {token.reference} syntax',
    '  the list of valid component properties',
    '  which findings are errors rather than warnings',
    '',
    'Then run the lint test against the new release, and only after it passes',
    `update DESIGN_MD_TARGET_SPEC in lib/formatters/markdown.ts to ${series(latest)}.`,
    '',
    'Mind the 30-day dependency cooldown before pinning it as a devDependency.',
  ].join('\n')
);
process.exit(1);
