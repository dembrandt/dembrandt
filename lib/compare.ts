/**
 * --compare dispatch. The argument is either:
 *   - a local file  → diff against it here (free, offline, deterministic)
 *   - a baseline id → POST the candidate to the Dembrandt App, which stores
 *                     baselines and runs the same engine server-side
 *
 * Same flag, two backends — the local path is the free wedge; the id path is the
 * App platform (dembrandt-next/app). Both call the one canonical drift engine.
 *
 * Dependencies are injectable so the dispatch is unit-testable without a real
 * filesystem or network.
 */

import { existsSync, readFileSync } from "fs";
import { computeDrift } from "./drift.js";
import type { BrandingResult } from "./types.js";
import type { DriftReport } from "./drift.js";

export interface CompareResult {
  report: DriftReport;
  /** Human label for where the baseline came from (file path or "<api> #<id>"). */
  source: string;
  /** "local" file diff or "platform" App diff. */
  mode: "local" | "platform";
}

export interface CompareDeps {
  isFile?: (p: string) => boolean;
  readFile?: (p: string, enc: "utf-8") => string;
  fetchFn?: typeof fetch;
  /** App base URL. Caller passes the `.dembrandtrc` `endpoint`; default is the
   *  production App at https://dembrandt.com. */
  api?: string;
}

/** Resolve a `--compare <arg>` into a drift report, dispatching on file vs id. */
export async function resolveCompare(
  arg: string,
  candidate: BrandingResult,
  deps: CompareDeps = {},
): Promise<CompareResult> {
  const isFile = deps.isFile ?? existsSync;
  const readFile = deps.readFile ?? (readFileSync as (p: string, enc: "utf-8") => string);

  if (isFile(arg)) {
    let baseline: BrandingResult;
    try {
      baseline = JSON.parse(readFile(arg, "utf-8")) as BrandingResult;
    } catch (err) {
      throw new Error(
        `baseline ${arg} is not a dembrandt JSON extraction ` +
        `(${(err as Error).message}) — create one with --save-output or --json-only`,
        { cause: err }
      );
    }
    return { report: computeDrift(baseline, candidate), source: arg, mode: "local" };
  }

  // A path-looking argument that is not a file is a typo, not a baseline id —
  // shipping it to the App would surface a confusing platform error instead.
  if (arg.includes("/") || arg.includes("\\") || /\.(json|md)$/i.test(arg)) {
    throw new Error(`baseline file not found: ${arg}`);
  }

  // Not a local file → treat as a platform baseline id.
  const fetchFn = deps.fetchFn ?? fetch;
  const api = (deps.api ?? "https://dembrandt.com").replace(/\/$/, "");
  const res = await fetchFn(`${api}/api/app/drift`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baselineId: arg, candidate }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const e = (await res.json()) as { error?: string };
      if (e?.error) detail = e.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`platform compare failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { drift: DriftReport };
  return { report: data.drift, source: `${api} #${arg}`, mode: "platform" };
}
