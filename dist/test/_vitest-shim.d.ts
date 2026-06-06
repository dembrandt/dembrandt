/**
 * Minimal vitest-compatible shim over node:test + node:assert, so the DTCG
 * validator's upstream test suite (written for vitest) runs verbatim under the
 * project's node:test runner. Only the three matchers that suite actually uses
 * are implemented (toBe, toContain, toHaveLength); no .not.
 */
import { describe, it } from 'node:test';
export { describe, it };
export declare function expect(actual: any): {
    toBe(expected: any): void;
    toContain(expected: any): void;
    toHaveLength(length: number): void;
};
