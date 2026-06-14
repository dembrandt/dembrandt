/**
 * CI exit-code contract. A pipeline branches on these to tell apart "design
 * drifted" (review the diff) from "extraction broke" (retry / investigate):
 *   0  success / stable      1  drift detected (--compare)
 *   2  extraction failure    67 navigation/connection timeout (retryable, try --slow)
 *
 * Kept in its own module (not index.ts, which runs the CLI on import) so the
 * classifier is importable and unit-testable without spawning a subprocess.
 * Consumers (dembrandt-next/.github/workflows/drift.yml) depend on these values;
 * changing one is a breaking change to the gate.
 */

export const EXIT = { OK: 0, DRIFT: 1, RUNTIME: 2, TIMEOUT: 67 } as const;

/** Stable failure code surfaced to CI alongside the numeric exit. */
export type ErrorCode = "NAVIGATION_TIMEOUT" | "EXTRACTION_FAILED";

/**
 * Classify an extraction failure into a stable {code, exit} for CI consumers.
 * Network/DNS/timeout errors map to the retryable TIMEOUT exit; everything else
 * is a generic RUNTIME failure. Reads only `err.message`, so a bare string or a
 * malformed error never throws.
 */
export function classifyError(err: any): { code: ErrorCode; exit: number } {
  const m = String(err?.message ?? "");
  if (/Timeout|net::ERR_|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(m)) {
    return { code: "NAVIGATION_TIMEOUT", exit: EXIT.TIMEOUT };
  }
  return { code: "EXTRACTION_FAILED", exit: EXIT.RUNTIME };
}
