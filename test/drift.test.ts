import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDrift } from '../lib/drift.js';

/**
 * Low-confidence tokens are single-use, margin-of-detection elements the
 * extractor is unsure about; they surface inconsistently between two
 * extractions of the same design. computeDrift must ignore them so they never
 * produce phantom drift.
 */

function fixture(overrides: any = {}): any {
  return {
    url: 'https://example.com/',
    extractedAt: 't',
    colors: { palette: [{ normalized: '#133174', count: 40, confidence: 'high' }], semantic: { primary: '#133174' }, cssVariables: {} },
    typography: { styles: [], sources: {} },
    // Representative extract: spacing and radius present, so overall-score
    // assertions run against a realistic category denominator.
    spacing: { scaleType: 'base-8', commonValues: [{ px: 8 }, { px: 16 }, { px: 24 }] },
    borderRadius: { values: [{ value: '4px', count: 20, confidence: 'high' }] },
    borders: {}, shadows: [],
    components: { buttons: [], inputs: [], links: [], badges: [] },
    breakpoints: [], iconSystem: [], frameworks: [],
    ...overrides,
  };
}

test('a low-confidence shadow present in one extraction but not the other is not drift', () => {
  const withShadow = fixture({
    shadows: [{ shadow: 'rgb(128, 128, 128) 0px 0px 5px 0px', count: 1, confidence: 'low' }],
  });
  const without = fixture({ shadows: [] });

  const report = computeDrift(withShadow, without);
  assert.equal(report.status, 'stable');
  assert.equal(report.summary.removed, 0);
  assert.equal(report.changes.filter((c) => c.category === 'shadow').length, 0);
});

test('a low-confidence radius present in one extraction but not the other is not drift', () => {
  const withRadius = fixture({
    borderRadius: { values: [{ value: '2px', count: 1, confidence: 'low' }] },
  });
  const without = fixture({ borderRadius: { values: [] } });

  const report = computeDrift(withRadius, without);
  assert.equal(report.status, 'stable');
  assert.equal(report.changes.filter((c) => c.category === 'radius').length, 0);
});

test('baseline and candidate extracted at different viewport widths produce a warning', () => {
  const base = fixture({ meta: { schemaVersion: '1', viewport: { width: 1920, height: 1080 } } });
  const cand = fixture({ meta: { schemaVersion: '1', viewport: { width: 390, height: 844 } } });

  const report = computeDrift(base, cand);
  assert.equal(report.warnings?.length, 1);
  assert.match(report.warnings![0], /1920x1080/);
  assert.match(report.warnings![0], /390x844/);
});

test('same viewport width produces no warning', () => {
  const base = fixture({ meta: { schemaVersion: '1', viewport: { width: 1920, height: 1080 } } });
  const cand = fixture({ meta: { schemaVersion: '1', viewport: { width: 1920, height: 900 } } });

  const report = computeDrift(base, cand);
  assert.equal(report.warnings, undefined);
});

test('malformed viewport meta produces no warning instead of garbage', () => {
  const base = fixture({ meta: { schemaVersion: '1', viewport: {} } });
  const cand = fixture({ meta: { schemaVersion: '1', viewport: { width: 390, height: 844 } } });
  assert.equal(computeDrift(base, cand).warnings, undefined);
});

test('same width as string vs number is not a mismatch', () => {
  const base = fixture({ meta: { schemaVersion: '1', viewport: { width: '1920', height: '1080' } } });
  const cand = fixture({ meta: { schemaVersion: '1', viewport: { width: 1920, height: 1080 } } });
  assert.equal(computeDrift(base, cand).warnings, undefined);
});

test('missing viewport meta on either side produces no warning (pre-viewport snapshots)', () => {
  const base = fixture(); // no meta at all
  const cand = fixture({ meta: { schemaVersion: '1', viewport: { width: 390, height: 844 } } });

  const report = computeDrift(base, cand);
  assert.equal(report.warnings, undefined);
});

interface TestStyle { context: string; family: string; size: string; weight: string }

function typoStyles(n: number, family = 'Inter'): TestStyle[] {
  return Array.from({ length: n }, (_, i) => ({
    context: `style-${i}`, family, size: '16px', weight: '400',
  }));
}

test('one removed typography style among many does not max the category', () => {
  const styles = typoStyles(10);
  const base = fixture({ typography: { styles, sources: {} } });
  const cand = fixture({ typography: { styles: styles.slice(0, 9), sources: {} } });

  const report = computeDrift(base, cand);
  const typo = report.categories.find((c) => c.category === 'typography')!;
  assert.ok(typo.score < 0.5, `one removal must not dominate the category, got ${typo.score}`);
  assert.equal(report.status, 'stable');
});

test('one font-family change among many does not max the category', () => {
  const styles = typoStyles(10);
  const changed = styles.map((s, i) => (i === 0 ? { ...s, family: 'Comic Sans MS' } : s));
  const base = fixture({ typography: { styles, sources: {} } });
  const cand = fixture({ typography: { styles: changed, sources: {} } });

  const report = computeDrift(base, cand);
  const typo = report.categories.find((c) => c.category === 'typography')!;
  assert.ok(typo.score < 0.5, `one family change must not dominate the category, got ${typo.score}`);
});

test('replacing the font family across all styles still drifts', () => {
  const base = fixture({ typography: { styles: typoStyles(10, 'Inter'), sources: {} } });
  const cand = fixture({ typography: { styles: typoStyles(10, 'Georgia'), sources: {} } });

  const report = computeDrift(base, cand);
  const typo = report.categories.find((c) => c.category === 'typography')!;
  assert.ok(typo.score >= 0.7, `full family swap must score high, got ${typo.score}`);
  assert.equal(report.status, 'drift');
});

test('a removed style scores below an in-place family change', () => {
  const styles = typoStyles(10);
  const base = fixture({ typography: { styles, sources: {} } });

  const removedReport = computeDrift(base, fixture({ typography: { styles: styles.slice(0, 9), sources: {} } }));
  const changedReport = computeDrift(base, fixture({
    typography: { styles: styles.map((s, i) => (i === 0 ? { ...s, family: 'Georgia' } : s)), sources: {} },
  }));

  const score = (r: ReturnType<typeof computeDrift>) =>
    r.categories.find((c) => c.category === 'typography')!.score;
  assert.ok(score(removedReport) < score(changedReport),
    `removal (${score(removedReport)}) must score below family change (${score(changedReport)})`);
});

test('extracts from different final URLs produce a page-mismatch warning', () => {
  const base = fixture({ url: 'https://example.com/' });
  const cand = fixture({ url: 'https://www.example.com/fi/' });

  const report = computeDrift(base, cand);
  assert.ok(report.warnings?.some((w) => w.includes('different pages')), JSON.stringify(report.warnings));
});

test('www and trailing slash are not a page mismatch', () => {
  const base = fixture({ url: 'https://example.com/pricing' });
  const cand = fixture({ url: 'https://www.example.com/pricing/' });

  assert.equal(computeDrift(base, cand).warnings, undefined);
});

test('--dark-mode on one side only produces a warning', () => {
  const base = fixture({ meta: { schemaVersion: '1', flags: { darkMode: true } } });
  const cand = fixture({ meta: { schemaVersion: '1', flags: {} } });

  const report = computeDrift(base, cand);
  assert.ok(report.warnings?.some((w) => w.includes('--dark-mode')), JSON.stringify(report.warnings));
});

test('unloaded web fonts on either side produce a warning naming the pending families', () => {
  const base = fixture({ meta: { schemaVersion: '1', fontsReady: true } });
  const cand = fixture({ meta: { schemaVersion: '1', fontsReady: false, pendingFonts: ['Inter'] } });

  const report = computeDrift(base, cand);
  const w = report.warnings?.find((x) => x.includes('web fonts'));
  assert.ok(w, JSON.stringify(report.warnings));
  assert.match(w!, /candidate/);
  assert.match(w!, /Inter/);
});

test('a degraded category is excluded from the score instead of read as removals', () => {
  const styles = typoStyles(16);
  const base = fixture({ typography: { styles, sources: {} } });
  // Candidate's typography extractor failed: empty styles + a scoped error.
  const cand = fixture({
    typography: { styles: [], sources: {} },
    meta: { schemaVersion: '1', errors: [{ stage: 'typography', reason: 'timeout' }] },
  });

  const report = computeDrift(base, cand);
  assert.equal(report.status, 'stable', `16 missing styles from a failed extractor must not read as drift, got ${report.score}`);
  assert.ok(report.warnings?.some((w) => w.includes('typography extraction was degraded')), JSON.stringify(report.warnings));
});

test('categories empty on both sides do not dilute the score', () => {
  const styles = typoStyles(2);
  const sparse = {
    typography: { styles, sources: {} },
    spacing: { scaleType: 'base-8', commonValues: [] },
    borderRadius: { values: [] },
    shadows: [],
  };
  const base = fixture(sparse);
  const cand = fixture({ ...sparse, typography: { styles: typoStyles(2, 'Georgia'), sources: {} } });

  const report = computeDrift(base, cand);
  // Comparable categories: color (w 1) + typography (w 1). A full family swap
  // (category 0.8) must average against those alone, not the empty three.
  assert.equal(report.score, 40);
});

test('a high-confidence radius change is still real drift', () => {
  const base = fixture({
    borderRadius: { values: [{ value: '4px', count: 20, confidence: 'high' }] },
  });
  const changed = fixture({
    borderRadius: { values: [{ value: '12px', count: 20, confidence: 'high' }] },
  });

  const report = computeDrift(base, changed);
  assert.ok(report.changes.some((c) => c.category === 'radius'), 'high-confidence radius change must be reported');
});
