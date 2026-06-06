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
/**
 * Remove internal crawl/merge fields that must never be persisted, even if a raw
 * crawl object is fed in. Returns a shallow copy; the input is untouched.
 */
export declare function stripTransient<T extends BrandingResult>(result: T): T;
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
export declare function normalizeExtraction<T extends BrandingResult>(result: T): T;
