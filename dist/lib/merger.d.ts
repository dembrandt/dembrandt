/**
 * Multi-Page Result Merger
 *
 * Merges extraction results from multiple pages into a single
 * unified result that is a superset of the single-page result: all single-page
 * fields are preserved, with additional multi-page metadata (pages array,
 * pageCount on palette entries) added.
 */
/**
 * Merge an array of per-page result objects into a single unified result.
 * @param {Object[]} results - Array of extractBranding() result objects
 * @returns {Object} Merged result with same shape as single-page result
 */
export declare function mergeResults(results: any): any;
