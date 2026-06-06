/**
 * Conformance engine — checks whether a live extraction honors a declared
 * token contract (.dembrandt/tokens.json shape).
 *
 * Distinct from drift:
 *   - drift is symmetric: any difference from a snapshot counts.
 *   - conformance is one-directional: every token the contract DECLARES must be
 *     present in the live site. Extra tokens in live are not violations — the
 *     contract documents a minimum, not an exhaustive set.
 *
 * The contract (tokens.json) is structurally lossy: it carries flat sets of
 * families and sizes with no per-context structure, and no usage counts or
 * roles. Conformance is therefore UNWEIGHTED — every declared token counts
 * equally. Callers must surface this; the score is not comparable to a drift
 * score.
 *
 * Pure functions, no I/O.
 */
export declare const DEFAULT_CONFORMANCE_CONFIG: {
    colorSame: number;
    dimPct: number;
    failThreshold: number;
};
/**
 * Convert a parsed DESIGN.md front matter object into the flat contract shape
 * that computeConformance consumes. DESIGN.md nests tokens differently than
 * tokens.json (named typography/spacing/rounded objects), so map them across.
 * @param {object} fm — parsed YAML front matter
 */
export declare function designTokensToContract(fm: any): Record<string, any>;
/**
 * @param {object} contract — tokens.json-shaped declared contract
 * @param {object} candidate — live ExtractionResult
 * @param {object} [config]
 */
export declare function computeConformance(contract: any, candidate: any, config?: any): {
    mode: string;
    weighted: boolean;
    score: number;
    status: string;
    threshold: any;
    summary: {
        total: any;
        satisfied: number;
        violated: number;
    };
    categories: {
        category: any;
        total: any;
        violated: number;
    }[];
    violations: any[];
};
