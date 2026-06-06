/**
 * Design lint rules — expert knowledge encoded as validators.
 *
 * Each rule takes an ExtractionResult plus its resolved config and returns an
 * array of LintResult. Pure functions, no side effects, no I/O.
 *
 * Rules are configurable via the ESLint `[level, options]` model. See
 * DEFAULT_LINT_CONFIG for per-rule levels and options.
 */
/**
 * Per-rule defaults. `level` is the severity a violation is reported at;
 * the remaining keys are rule options. Setting a rule's level to "off"
 * disables it entirely (no violations, no info).
 */
export declare const DEFAULT_LINT_CONFIG: {
    "primary-contrast": {
        level: string;
        min: number;
    };
    "button-contrast": {
        level: string;
        min: number;
    };
    "body-text-size": {
        level: string;
        min: number;
    };
    "palette-size": {
        level: string;
        max: number;
    };
    "typography-scale": {
        level: string;
        tolerance: number;
        maxDeviations: number;
    };
    "radius-consistency": {
        level: string;
        max: number;
    };
    "shadow-scale": {
        level: string;
        max: number;
    };
    "button-variants": {
        level: string;
        max: number;
    };
    "focus-visible": {
        level: string;
    };
    "logo-format": {
        level: string;
    };
};
/**
 * Run all lint rules against an extraction result.
 * @param {object} result — ExtractionResult from extractBranding()
 * @param {{ rules?: Record<string, any> }} [config] — lint config (ESLint [level, options] model)
 * @returns {{ errors: LintResult[], warnings: LintResult[], info: LintResult[] }}
 */
export declare function lint(result: any, config?: any): {
    errors: any[];
    warnings: any[];
    info: any[];
    all: any[];
};
