/**
 * --compare dispatch. A local file is diffed here, offline and deterministic.
 *
 * A bare id still posts to the App, but that route's baselineId branch is gone
 * and this is its only caller, so the path is retained rather than supported.
 * Bringing it back needs a per-account baseline store and auth on the endpoint.
 *
 * Dependencies are injectable so the dispatch is unit-testable without a real
 * filesystem or network.
 */

import { existsSync, readFileSync } from "fs";
import { computeDrift } from "./drift.js";
import { isExtraction } from "./normalize.js";
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
   *  production App at https://www.dembrandt.com. */
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
        `(${(err as Error).message}). Create one with --save-output or --json-only`,
        { cause: err }
      );
    }
    // Valid JSON is not the same as an extraction. Without this, a truncated
    // download or a wrong path that happens to hit another JSON file reads as
    // an empty baseline: every token counts as added, the run reports total
    // drift and exits 1, and the reader goes looking for a design change that
    // never happened. A broken baseline is an extraction failure, not drift.
    if (!isExtraction(baseline)) {
      throw new Error(
        `baseline ${arg} is not a dembrandt JSON extraction (no "colors" block). ` +
        `Create one with --save-output or --json-only`
      );
    }

    return { report: computeDrift(baseline, candidate), source: arg, mode: "local" };
  }

  // A path-looking argument that is not a file is a typo, not a baseline id.
  // Shipping it to the App would surface a confusing platform error instead.
  if (arg.includes("/") || arg.includes("\\") || /\.(json|md)$/i.test(arg)) {
    throw new Error(`baseline file not found: ${arg}`);
  }

  // Not a local file → treat as a platform baseline id.
  const fetchFn = deps.fetchFn ?? fetch;
  // www, matching the sync upload in index.ts. The apex answers 308 to www and
  // a cross-origin redirect is where an Authorization header goes missing. This
  // call carries none today, so the only cost is a round trip, but two paths
  // disagreeing about the host is how that stops being true quietly.
  const api = (deps.api ?? "https://www.dembrandt.com").replace(/\/$/, "");
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
