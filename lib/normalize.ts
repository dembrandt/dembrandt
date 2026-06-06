/**
 * Ingest helpers for consumers that STORE or DIFF extractions (drift engine,
 * dembrandt-next). The CLI output type is deliberately loose where it has to be
 * (a flag-driven producer), but that looseness is toxic downstream: a weight
 * that is sometimes a string and sometimes a number breaks diff math.
 *
 * Rule of thumb: keep the loose type at the input boundary, run it through here
 * once at ingest, and store the tight, canonical form. The CLI itself does not
 * need these — they live in core so every consumer shares one implementation
 * instead of each repo re-deriving it.
 */
import type { BrandingResult } from './types.js';

const TRANSIENT_KEYS = ['_discoveredLinks', '_extractedUrls', '_pageResults'] as const;

/**
 * Remove internal crawl/merge fields that must never be persisted, even if a raw
 * crawl object is fed in. Returns a shallow copy; the input is untouched.
 */
export function stripTransient<T extends BrandingResult>(result: T): T {
  const clean: any = { ...result };
  for (const key of TRANSIENT_KEYS) delete clean[key];
  return clean;
}

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * Canonicalize the loose unions to a single shape so the engine and UI never see
 * variants. Conservative: only touches the documented offenders, leaves the rest
 * untouched, and never throws. Run after stripTransient() at ingest.
 *
 *  - typography weight       : string | number  -> number
 *  - spacing px              : number | string  -> number
 *  - typography adobeFonts   : string[] | bool  -> string[]
 *  - components inputs/badges : array | object  -> array
 */
export function normalizeExtraction<T extends BrandingResult>(result: T): T {
  const out: any = stripTransient(result);

  for (const s of out.typography?.styles ?? []) {
    const w = toNumber(s.weight);
    if (w !== undefined) s.weight = w;
  }
  for (const v of out.spacing?.commonValues ?? []) {
    const px = toNumber(v.px);
    if (px !== undefined) v.px = px;
  }
  if (out.typography?.sources && typeof out.typography.sources.adobeFonts === 'boolean') {
    out.typography.sources.adobeFonts = [];
  }
  if (out.components) {
    const c = out.components;
    if (c.inputs && !Array.isArray(c.inputs)) c.inputs = c.inputs.text ?? [];
    if (c.badges && !Array.isArray(c.badges)) c.badges = c.badges.all ?? [];
  }

  return out;
}
