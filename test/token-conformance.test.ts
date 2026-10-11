import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTokenDocument, parseTokenFile, checkConformance, commitFromEnv } from '../lib/token-conformance.js';
import { generateConformanceMd } from '../lib/formatters/conformance-md.js';
import { conformanceAnnotations, detectCiSystem } from '../lib/ci-annotations.js';

const DOC = {
  color: {
    $type: 'color',
    brand: { primary: { $value: '#0057ff' }, ink: { $value: { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] } } },
    surface: { $value: 'rgb(255, 255, 255)' },
    action: { $value: '{color.brand.primary}' },
    deep: { $value: '{color.action}' },
    broken: { $value: '{color.nowhere}' },
  },
  radius: { $type: 'dimension', sm: { $value: '4px' }, lg: { $value: { value: 1, unit: 'rem' } } },
  type: { body: { $type: 'typography', $value: { fontFamily: 'Inter', fontSize: '1rem' } }, caption: { $type: 'fontSize', $value: '12px' } },
  motion: { fast: { $type: 'duration', $value: '100ms' } },
};

test('readTokenDocument flattens groups, inherits $type, resolves aliases and reads composite font sizes', () => {
  const tokens = readTokenDocument(DOC, 'tokens.json');
  const byName = Object.fromEntries(tokens.map((t) => [t.name, t.value]));
  assert.deepEqual(byName, {
    'color.brand.primary': '#0057ff',
    'color.brand.ink': '#1a1a1a',
    'color.surface': '#ffffff',
    'color.action': '#0057ff',
    'color.deep': '#0057ff',
    'radius.sm': 4,
    'radius.lg': 16,
    'type.body.fontSize': 16,
    'type.caption': 12,
  });
  assert.ok(tokens.every((t) => t.source === 'tokens.json'));
});

test('parseTokenFile rejects bad JSON and a file with nothing to compare against', () => {
  assert.throws(() => parseTokenFile('{', 'a.json'), /a\.json: not valid JSON/);
  assert.throws(() => parseTokenFile('{"motion":{"fast":{"$type":"duration","$value":"1s"}}}', 'b.json'), /no colour or dimension tokens/);
});

function result() {
  return {
    url: 'https://app.example.com/',
    colors: {
      detected: [
        { color: 'rgb(0, 87, 255)', normalized: '#0057ff', count: 40 },
        { color: 'rgb(0, 88, 254)', normalized: '#0058fe', count: 3 },
        { color: 'rgb(214, 51, 108)', normalized: '#d6336c', count: 7 },
        { color: 'rgb(214, 51, 108)', normalized: '#d6336c', count: 1 },
      ],
      palette: [],
    },
    borderRadius: { values: [{ value: '4px', count: 9 }, { value: '6px', count: 2 }, { value: '50%', count: 1 }] },
    typography: { styles: [{ size: '16px (1.00rem)', count: 20 }, { size: '13px (0.81rem)', count: 5 }, { size: '13px', count: 1 }] },
  } as never;
}

test('checkConformance passes near-identical colours and exact dimensions, and lists the rest worst first', () => {
  const report = checkConformance(result(), readTokenDocument(DOC, 'tokens.json'), { checkedAt: 't', commit: 'abc' });
  assert.deepEqual(report.categories, {
    color: { checked: 3, offToken: 1 },
    radius: { checked: 2, offToken: 1 },
    fontSize: { checked: 2, offToken: 1 },
  });
  assert.deepEqual(report.offToken.map((r) => [r.category, r.value, r.count, r.nearest?.name, r.distance]), [
    ['color', '#d6336c', 8, 'color.brand.primary', report.offToken[0].distance],
    ['fontSize', '13px', 6, 'type.caption', 1],
    ['radius', '6px', 2, 'radius.sm', 2],
  ]);
  assert.ok((report.offToken[0].distance ?? 0) > 2.3);
  assert.equal(report.commit, 'abc');
  assert.deepEqual(report.tokens, { color: 5, dimension: 4 });
  assert.deepEqual(report.tokenSources, ['tokens.json']);
});

test('checkConformance with no colour tokens reports every colour as off token with no nearest', () => {
  const report = checkConformance(result(), readTokenDocument({ radius: { $type: 'dimension', a: { $value: '4px' } } }, 'r.json'));
  assert.equal(report.categories.color.offToken, 3);
  assert.equal(report.offToken.find((r) => r.category === 'color')?.nearest, null);
});

test('generateConformanceMd is plain tables with the verdict against the limit', () => {
  const report = checkConformance(result(), readTokenDocument(DOC, 'tokens.json'), { checkedAt: '2026-10-11T00:00:00.000Z' });
  const md = generateConformanceMd(report, { version: '0.39.0', maxOffToken: 2 });
  assert.match(md, /^# Rendered values against tokens/);
  assert.match(md, /\*\*3 off-token values, above the limit of 2\.\*\*/);
  assert.match(md, /\| Colour \| 3 \| 1 \|/);
  assert.match(md, /\| Font size \| `13px` \| 6 \| `type\.caption` \(12px\) \| 1px \|/);
  assert.doesNotMatch(md, /<[a-z]/);
  assert.match(generateConformanceMd(report), /\*\*3 off-token values\.\*\*/);
});

test('conformanceAnnotations speak both runners and only headline when over the limit', () => {
  const report = checkConformance(result(), readTokenDocument(DOC, 'tokens.json'));
  const azure = conformanceAnnotations(report, 'azure', 1);
  assert.equal(azure[0], '##vso[task.logissue type=error]Off-token values: 3 rendered values match no token, limit 1');
  assert.match(azure[1], /^##vso\[task\.logissue type=warning\]color #d6336c seen 8×, nearest color\.brand\.primary #0057ff \(ΔE /);
  const github = conformanceAnnotations(report, 'github');
  assert.equal(github.length, 3);
  assert.match(github[0], /^::warning::color #d6336c seen 8×/);
});

test('detectCiSystem and commitFromEnv read the runner variables', () => {
  assert.equal(detectCiSystem({ GITHUB_ACTIONS: 'true' }), 'github');
  assert.equal(detectCiSystem({ TF_BUILD: 'True' }), 'azure');
  assert.equal(detectCiSystem({}), null);
  assert.equal(commitFromEnv({ BUILD_SOURCEVERSION: 'deadbeef' }), 'deadbeef');
  assert.equal(commitFromEnv({}), null);
});
