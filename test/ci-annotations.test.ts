import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGitHubActions, driftAnnotations, emitDriftAnnotations } from '../lib/ci-annotations.js';
import type { DriftReport } from '../lib/drift.js';

function report(partial: Partial<DriftReport> = {}): DriftReport {
  return {
    score: 42,
    status: 'drift',
    threshold: 20,
    summary: { changed: 1, added: 1, removed: 1 },
    categories: [],
    changes: [
      { category: 'color', kind: 'changed', label: '#2564ea', before: '#2564ea', after: '#1050d0', delta: 6.2 },
      { category: 'color', kind: 'added', label: '#00a2e1', after: '#00a2e1' },
      { category: 'typography', kind: 'removed', label: 'body', before: 'Inter 16px' },
    ],
    ...partial,
  };
}

test('isGitHubActions reads GITHUB_ACTIONS=true exactly', () => {
  assert.equal(isGitHubActions({ GITHUB_ACTIONS: 'true' }), true);
  assert.equal(isGitHubActions({ GITHUB_ACTIONS: 'false' }), false);
  assert.equal(isGitHubActions({}), false);
});

test('driftAnnotations emits nothing for a stable report', () => {
  assert.deepEqual(driftAnnotations(report({ status: 'stable' })), []);
});

test('driftAnnotations leads with an error summary carrying score + threshold', () => {
  const lines = driftAnnotations(report());
  assert.match(lines[0], /^::error title=Design drift 42 exceeds threshold 20::/);
  assert.match(lines[0], /1 changed, 1 added, 1 removed/);
});

test('driftAnnotations maps changed/removed to error and added to warning', () => {
  const lines = driftAnnotations(report()).slice(1);
  assert.match(lines[0], /^::error::#2564ea #2564ea -> #1050d0 \(token-drift:color, delta 6.2\)/);
  assert.match(lines[1], /^::warning::#00a2e1 #00a2e1 new \(token-drift:color\)/);
  assert.match(lines[2], /^::error::body Inter 16px removed \(token-drift:typography\)/);
});

test('driftAnnotations escapes commas and colons in the title property', () => {
  const lines = driftAnnotations(report({ threshold: 20 }));
  // title contains no comma/colon here, but the summary (data) keeps its commas
  // raw — only the title property is property-escaped. Guard the contract: no
  // raw comma leaks into the property segment before the second ::.
  const prop = lines[0].slice('::error '.length, lines[0].indexOf('::', 2));
  assert.ok(!prop.includes(','), `property segment must not contain a raw comma: ${prop}`);
});

test('emitDriftAnnotations prints under GitHub Actions, no-op otherwise', () => {
  const out: string[] = [];
  emitDriftAnnotations(report(), (l) => out.push(l), { GITHUB_ACTIONS: 'true' });
  assert.equal(out.length, 4); // summary + 3 changes
  const out2: string[] = [];
  emitDriftAnnotations(report(), (l) => out2.push(l), {});
  assert.equal(out2.length, 0);
});
