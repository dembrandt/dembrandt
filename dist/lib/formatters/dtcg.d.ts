/**
 * DTCG (W3C Design Tokens CG) format exporter
 * Converts dembrandt extraction output to W3C DTCG format
 * Spec: https://www.designtokens.org/TR/2025.10/format/
 */
import type { BrandingResult } from '../types.js';
/**
 * Main export function - converts dembrandt output to W3C Design Tokens format
 */
export declare function toDtcgTokens(extractionResult: BrandingResult): Record<string, any>;
