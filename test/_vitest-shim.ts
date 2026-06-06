/**
 * Minimal vitest-compatible shim over node:test + node:assert, so the DTCG
 * validator's upstream test suite (written for vitest) runs verbatim under the
 * project's node:test runner. Only the three matchers that suite actually uses
 * are implemented (toBe, toContain, toHaveLength); no .not.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export { describe, it };

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
    toContain(expected: any) {
      assert.ok(
        actual != null && typeof actual.includes === 'function' && actual.includes(expected),
        `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
      );
    },
    toHaveLength(length: number) {
      assert.strictEqual(actual?.length, length);
    },
  };
}
