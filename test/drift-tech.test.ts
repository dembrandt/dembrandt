import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDrift } from '../lib/drift.js';
import type { BrandingResult as ExtractionResult, Framework, IconSystem } from '../lib/types.js';

const palette = ['#112233', '#445566', '#778899', '#aabbcc'].map((normalized) => ({ color: normalized, normalized, count: 10, confidence: 'high' }));

function snapshot(frameworks: Partial<Framework>[], iconSystem: Partial<IconSystem>[] = [], schemaVersion = '1.18.0', colors = palette, dembrandtVersion = '0.39.0'): ExtractionResult {
  return {
    url: 'https://example.com/',
    extractedAt: 't',
    meta: { schemaVersion, dembrandtVersion },
    colors: { palette: colors, semantic: {}, cssVariables: {} },
    typography: { styles: [], sources: {} },
    frameworks: frameworks.map((f) => ({ confidence: 'high', ...f })),
    iconSystem: iconSystem.map((i) => ({ type: 'svg', ...i })),
  } as unknown as ExtractionResult;
}

const stack = [{ name: 'React', version: '19.2.7' }, { name: 'Next.js', version: '16.2.9' }, { name: 'Tailwind CSS', version: '4' }];
const tech = (a: ExtractionResult, b: ExtractionResult) => computeDrift(a, b).changes.filter((c) => c.category === 'tech');

test('the same stack is no drift', () => {
  const report = computeDrift(snapshot(stack), snapshot(stack));
  assert.equal(report.score, 0);
  assert.deepEqual(report.changes, []);
});

test('a patch or minor version is listed and does not move the score', () => {
  const report = computeDrift(snapshot(stack), snapshot([{ name: 'React', version: '19.3.0' }, stack[1], stack[2]]));
  assert.deepEqual(report.changes.map((c) => [c.category, c.kind, c.label, c.before, c.after]), [['tech', 'changed', 'React', '19.2.7', '19.3.0']]);
  assert.equal(report.score, 0);
  assert.equal(report.status, 'stable');
});

test('a major version raises the score', () => {
  const report = computeDrift(snapshot(stack), snapshot([stack[0], stack[1], { name: 'Tailwind CSS', version: '5' }]));
  assert.equal(tech(snapshot(stack), snapshot([stack[0], stack[1], { name: 'Tailwind CSS', version: '5' }])).length, 1);
  assert.ok(report.score > 0, `expected a raised score, got ${report.score}`);
});

test('a replaced stack is drift on its own', () => {
  const report = computeDrift(snapshot(stack), snapshot([{ name: 'Vue', version: '3.5.0' }, { name: 'Nuxt', version: '4.1.0' }, stack[2]]));
  assert.deepEqual(report.changes.map((c) => `${c.kind} ${c.label}`).sort(), ['added Nuxt', 'added Vue', 'removed Next.js', 'removed React']);
  assert.equal(report.status, 'drift');
});

test('a version stated on one side only is not a change', () => {
  assert.deepEqual(tech(snapshot(stack), snapshot([{ name: 'React' }, stack[1], stack[2]])), []);
});

test('a baseline from before the fields existed is not compared', () => {
  const old = snapshot([{ name: 'Tailwind' }], [], '1.17.0');
  const report = computeDrift(old, snapshot(stack));
  assert.deepEqual(report.changes, []);
  assert.equal(report.score, 0);
});

test('snapshots from two CLI versions are not compared: a rule fix must not read as a removed framework', () => {
  const report = computeDrift(snapshot([...stack, { name: 'Quasar' }]), snapshot(stack, [], '1.18.0', palette, '0.39.1'));
  assert.deepEqual(report.changes, []);
  assert.equal(report.score, 0);
});

test('medium-confidence detections and the generic icon entry do not flicker into drift', () => {
  const a = snapshot([...stack, { name: 'Swiper', confidence: 'medium' }], [{ name: 'SVG Icons' }]);
  const b = snapshot(stack, [{ name: 'Heroicons', version: '2' }]);
  assert.deepEqual(tech(a, b).map((c) => `${c.kind} ${c.label}`), ['added Heroicons']);
});

test('an unchanged stack leaves a colour score where it was', () => {
  const moved = [{ ...palette[0], color: '#ff0000', normalized: '#ff0000' }, ...palette.slice(1)];
  const without = computeDrift(snapshot([], [], '1.17.0'), snapshot([], [], '1.17.0', moved)).score;
  const withStack = computeDrift(snapshot(stack), snapshot(stack, [], '1.18.0', moved)).score;
  assert.ok(without > 0);
  assert.equal(withStack, without);
});

test('a failed framework extraction is excluded, not read as a removed stack', () => {
  const failed = { ...snapshot([]), meta: { schemaVersion: '1.18.0', dembrandtVersion: '0.39.0', degraded: ['frameworks'] } } as unknown as ExtractionResult;
  const report = computeDrift(snapshot(stack), failed);
  assert.deepEqual(tech(snapshot(stack), failed), []);
  assert.equal(report.score, 0);
});
