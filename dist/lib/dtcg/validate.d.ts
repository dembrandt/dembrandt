/**
 * W3C Design Tokens Community Group (DTCG) Validator
 * Validates design tokens against the W3C DTCG specification
 * @see https://www.designtokens.org/TR/2025.10/format/
 */
/**
 * Validates a design tokens JSON string against the W3C DTCG specification
 */
export declare function validateTokens(jsonString: any): {
    valid: boolean;
    errors: any[];
    warnings: any[];
    documentType: string;
    tokenCount: number;
    resolutionCount: any;
} | {
    valid: boolean;
    errors: string[];
    warnings?: undefined;
    tokenCount?: undefined;
} | {
    valid: boolean;
    errors: any[];
    warnings: any[];
    tokenCount: number;
};
/**
 * Validates a design tokens object (already parsed) against the W3C DTCG specification
 */
export declare function validateTokensObject(tokens: any): {
    valid: boolean;
    errors: any[];
    warnings: any[];
    documentType: string;
    tokenCount: number;
    resolutionCount: any;
} | {
    valid: boolean;
    errors: string[];
    warnings?: undefined;
    tokenCount?: undefined;
} | {
    valid: boolean;
    errors: any[];
    warnings: any[];
    tokenCount: number;
};
/**
 * Analyzes validation errors and provides detailed insights with suggestions
 */
export declare function analyzeErrors(validationResult: any): any;
