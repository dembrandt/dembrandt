import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MENU_TRIGGER_SELECTOR, isSafeMenuTrigger } from '../lib/extractors/menu-triggers.js';

// The navigation guard is the safety-critical part of the --menus pass: an
// anchor with a real href would navigate on click and destroy the page
// execution context mid-extraction. These cover the predicate that gates it.

test('MENU_TRIGGER_SELECTOR is a non-empty, comma-separated CSS selector', () => {
  assert.equal(typeof MENU_TRIGGER_SELECTOR, 'string');
  assert.ok(MENU_TRIGGER_SELECTOR.length > 0);
  assert.ok(MENU_TRIGGER_SELECTOR.includes('aria-haspopup'));
  assert.ok(MENU_TRIGGER_SELECTOR.includes(','));
});

test('button trigger with no href is safe to click', () => {
  assert.equal(isSafeMenuTrigger('button', null), true);
  assert.equal(isSafeMenuTrigger('button', undefined), true);
  assert.equal(isSafeMenuTrigger('BUTTON', null), true);
});

test('anchor with a real href is excluded (would navigate)', () => {
  assert.equal(isSafeMenuTrigger('a', '/products'), false);
  assert.equal(isSafeMenuTrigger('a', 'https://example.com'), false);
  assert.equal(isSafeMenuTrigger('A', 'mailto:x@y.z'), false);
});

test('any element with a real href is excluded, regardless of tag', () => {
  assert.equal(isSafeMenuTrigger('div', '/somewhere'), false);
  assert.equal(isSafeMenuTrigger('span', 'https://example.com'), false);
});

test('fragment and empty hrefs are treated as safe (in-page, no navigation)', () => {
  assert.equal(isSafeMenuTrigger('a', '#'), true);
  assert.equal(isSafeMenuTrigger('a', '#section'), true);
  assert.equal(isSafeMenuTrigger('a', ''), true);
  assert.equal(isSafeMenuTrigger('a', null), true);
});
