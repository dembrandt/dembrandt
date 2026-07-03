import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCompare } from '../lib/compare.js';

/**
 * resolveCompare dispatches `--compare <arg>` on file-vs-id with injectable deps,
 * so both backends are exercised without a real filesystem or network: a local
 * file diffs here; a baseline id POSTs to the App and uses its returned report.
 */

function fixture(overrides: any = {}): any {
  return {
    url: 'https://example.com/',
    extractedAt: 't',
    colors: { palette: [{ normalized: '#133174', count: 40, confidence: 'high' }], semantic: { primary: '#133174' }, cssVariables: {} },
    typography: { styles: [], sources: {} },
    spacing: { scaleType: 'base-8', commonValues: [] },
    borderRadius: { values: [] },
    borders: {}, shadows: [],
    components: { buttons: [], inputs: [], links: [], badges: [] },
    breakpoints: [], iconSystem: [], frameworks: [],
    ...overrides,
  };
}

test('local file path: diffs against the file here', async () => {
  const baseline = fixture();
  const candidate = fixture({ colors: { palette: [{ normalized: '#0a0a0a', count: 40, confidence: 'high' }], semantic: {}, cssVariables: {} } });
  const r = await resolveCompare('baseline.json', candidate, {
    isFile: () => true,
    readFile: () => JSON.stringify(baseline),
  });
  assert.equal(r.mode, 'local');
  assert.equal(r.source, 'baseline.json');
  assert.equal(r.report.status, 'drift');
});

test('baseline id path: POSTs candidate to the App and returns its report', async () => {
  const candidate = fixture();
  let captured: any = null;
  const fakeReport = { score: 7, status: 'stable', threshold: 10, summary: { changed: 0, added: 0, removed: 0 }, categories: [], changes: [] };
  const fetchFn = (async (url: string, init: any) => {
    captured = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ drift: fakeReport }) };
  }) as any;

  const r = await resolveCompare('dembrandt.com', candidate, {
    isFile: () => false,
    fetchFn,
    api: 'https://app.example.com/',
  });

  assert.equal(captured.url, 'https://app.example.com/api/app/drift');
  assert.equal(captured.body.baselineId, 'dembrandt.com');
  assert.ok(captured.body.candidate.colors, 'sends the candidate extraction');
  assert.equal(r.mode, 'platform');
  assert.equal(r.report.score, 7);
});

test('local file path: unparseable baseline rejects with a clear error, not a bare SyntaxError', async () => {
  await assert.rejects(
    () => resolveCompare('DESIGN.md', fixture(), {
      isFile: () => true,
      readFile: () => '---\nname: not json\n---',
    }),
    /baseline DESIGN\.md is not a dembrandt JSON extraction .*--save-output/,
  );
});

test('path-looking argument that is not a file rejects instead of POSTing to the App', async () => {
  let fetched = false;
  const fetchFn = (async () => { fetched = true; return { ok: true, json: async () => ({}) }; }) as any;
  for (const typo of ['output/missing.json', 'baselines\\win.json', 'baseline.JSON', 'DESIGN.md']) {
    await assert.rejects(
      () => resolveCompare(typo, fixture(), { isFile: () => false, fetchFn }),
      /baseline file not found/,
    );
  }
  assert.equal(fetched, false, 'never hits the network for a path-looking typo');
});

test('baseline id path: surfaces a platform error', async () => {
  const fetchFn = (async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({ error: 'baseline not found: nope' }) })) as any;
  await assert.rejects(
    () => resolveCompare('nope', fixture(), { isFile: () => false, fetchFn, api: 'https://app.example.com' }),
    /platform compare failed \(404\): baseline not found: nope/,
  );
});
