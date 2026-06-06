/**
 * Drift engine — ported from dembrandt-next/lib/app/drift.ts
 *
 * Compares two Dembrandt extracts (baseline and candidate) and returns a
 * drift report: 0-100 score (0 = identical), pass/fail verdict, and a list
 * of what changed. Pure functions, no infra.
 */
export declare const DEFAULT_DRIFT_CONFIG: {
    colorSame: number;
    colorShift: number;
    dimPct: number;
    dimShiftPct: number;
    weights: {
        color: number;
        typography: number;
        spacing: number;
        radius: number;
        shadow: number;
    };
    failThreshold: number;
};
export declare function computeDrift(baseline: any, candidate: any, config?: any): {
    score: number;
    status: string;
    threshold: any;
    summary: any;
    categories: any[];
    changes: any[];
};
