/**
 * Fault isolation for the parallel extractors. Each extractor runs inside
 * guardExtractor so a single throw degrades only its own category — recording
 * { stage, reason } and returning a fallback — instead of rejecting Promise.all
 * and aborting the entire run. Kept in its own module so the isolation contract
 * is unit-testable without a browser.
 */
import type { ExtractorError } from '../types.js';

export async function guardExtractor<T>(
  stage: string,
  run: Promise<T>,
  fallback: T,
  sink: ExtractorError[],
): Promise<T> {
  try {
    return await run;
  } catch (err) {
    sink.push({ stage, reason: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}
