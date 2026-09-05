import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approveWarning,
  colorFormatWarning,
  guardWarnings,
  ignoredDiscoveryWarning,
  voiceNeedsOutputFile,
} from '../lib/cli-guards.js';

/**
 * Guards exist so a flag never silently does nothing. Each test pins a flag
 * combination a user can actually type, not the shape of the predicate.
 */

test('--approve is only meaningful against a baseline', () => {
  assert.match(approveWarning({ approve: true }) ?? '', /--approve has no effect/);
  assert.equal(approveWarning({ approve: true, compare: 'base.json' }), null);
  assert.equal(approveWarning({}), null);
});

test('discovery flags are called out whenever explicit paths win', () => {
  assert.match(ignoredDiscoveryWarning({ crawl: 5 }, ['/pricing']) ?? '', /--crawl is ignored/);
  assert.match(ignoredDiscoveryWarning({ sitemap: true }, ['/pricing']) ?? '', /--sitemap is ignored/);
  // --crawl --sitemap together: both lose to the path list, so both are named.
  assert.match(
    ignoredDiscoveryWarning({ crawl: 5, sitemap: true }, ['/pricing']) ?? '',
    /--crawl and --sitemap are ignored/,
  );
});

test('the discovery warning counts the paths it is actually extracting', () => {
  assert.match(ignoredDiscoveryWarning({ crawl: 5 }, ['/a']) ?? '', /the 1 given path\./);
  assert.match(ignoredDiscoveryWarning({ crawl: 5 }, ['/a', '/b']) ?? '', /the 2 given paths\./);
});

test('no discovery warning without both a path list and a discovery flag', () => {
  assert.equal(ignoredDiscoveryWarning({ crawl: 5 }, []), null);
  assert.equal(ignoredDiscoveryWarning({ crawl: 5 }, undefined), null);
  assert.equal(ignoredDiscoveryWarning({}, ['/pricing']), null);
});

test('--color-format names only the export paths present in the run', () => {
  assert.equal(colorFormatWarning({ colorFormat: 'oklch' }), null);
  assert.equal(colorFormatWarning({ colorFormat: 'hex', dtcg: true }), null);
  const one = colorFormatWarning({ colorFormat: 'oklch', dtcg: true }) ?? '';
  assert.match(one, /--dtcg is unaffected/);
  assert.doesNotMatch(one, /--html/);
  assert.match(colorFormatWarning({ colorFormat: 'rgb', dtcg: true, html: true }) ?? '', /--dtcg, --html are unaffected/);
});

test('--voice needs a sink of its own because no formatter prints it', () => {
  assert.equal(voiceNeedsOutputFile({ voice: true }, false), true);
  for (const sink of [{ saveOutput: true }, { dtcg: true }, { jsonOnly: true }]) {
    assert.equal(voiceNeedsOutputFile({ voice: true, ...sink }, false), false);
  }
  // An API key means the extraction is synced, so the copy already has a home.
  assert.equal(voiceNeedsOutputFile({ voice: true }, true), false);
  assert.equal(voiceNeedsOutputFile({}, false), false);
});

test('--html and --tailwind do not count as voice sinks: neither renders voice', () => {
  assert.equal(voiceNeedsOutputFile({ voice: true, html: true, tailwind: true }, false), true);
});

test('guardWarnings emits every applicable warning in emit order', () => {
  const warnings = guardWarnings({ approve: true, crawl: 3, colorFormat: 'oklch', dtcg: true }, ['/pricing']);
  assert.deepEqual(warnings.map((w) => w.slice(2, 11)), ['--approve', '--crawl i', '--color-f']);
  assert.deepEqual(guardWarnings({}, undefined), []);
});
