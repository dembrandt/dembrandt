import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT, classifyError } from '../lib/exit-codes.js';

/**
 * The CI exit-code contract. dembrandt-next's drift.yml branches on these exact
 * numbers (1 = drift, anything else nonzero = extraction failure) and the README
 * documents 67 as the retryable timeout. These tests pin the contract so a
 * refactor cannot silently renumber it.
 */

test('EXIT codes hold their documented values', () => {
  assert.deepEqual(EXIT, { OK: 0, DRIFT: 1, RUNTIME: 2, TIMEOUT: 67 });
});

test('drift exit is distinct from every failure exit', () => {
  // The whole point of the contract: a pipeline must tell "design drifted"
  // apart from "extraction broke". DRIFT must never collide with a failure code.
  assert.notEqual(EXIT.DRIFT, EXIT.RUNTIME);
  assert.notEqual(EXIT.DRIFT, EXIT.TIMEOUT);
  assert.notEqual(EXIT.DRIFT, EXIT.OK);
});

const TIMEOUT_CASES: Array<[string, string]> = [
  ['Playwright timeout', 'Timeout 30000ms exceeded'],
  ['Chromium net error', 'page.goto: net::ERR_CONNECTION_REFUSED at https://x'],
  ['connection refused', 'connect ECONNREFUSED 127.0.0.1:443'],
  ['socket timeout', 'request failed, reason: ETIMEDOUT'],
  ['DNS not found', 'getaddrinfo ENOTFOUND nope.invalid'],
  ['name not resolved', 'net::ERR_NAME_NOT_RESOLVED'],
];

for (const [label, message] of TIMEOUT_CASES) {
  test(`classifyError → retryable timeout: ${label}`, () => {
    const r = classifyError(new Error(message));
    assert.equal(r.exit, EXIT.TIMEOUT);
    assert.equal(r.code, 'NAVIGATION_TIMEOUT');
  });
}

test('classifyError → timeout matching is case-insensitive', () => {
  const r = classifyError(new Error('TIMEOUT while loading'));
  assert.equal(r.exit, EXIT.TIMEOUT);
});

test('classifyError → generic runtime failure for non-network errors', () => {
  const r = classifyError(new Error('Cannot read properties of undefined'));
  assert.equal(r.exit, EXIT.RUNTIME);
  assert.equal(r.code, 'EXTRACTION_FAILED');
});

test('classifyError never throws on malformed input', () => {
  // index.ts catch blocks pass `err` straight in; a bare string, null, or an
  // object without a message must degrade to a runtime failure, not crash.
  for (const bad of [null, undefined, 'a string', 42, {}, { message: null }]) {
    const r = classifyError(bad as any);
    assert.equal(r.exit, EXIT.RUNTIME);
    assert.equal(r.code, 'EXTRACTION_FAILED');
  }
});
