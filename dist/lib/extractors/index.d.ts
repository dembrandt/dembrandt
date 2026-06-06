import type { ExtractOptions, BrandingResult, Spinner } from '../types.js';
/**
 * @param {string} url
 * @param {import('ora').Ora} spinner
 * @param {import('playwright-core').Browser} browser
 * @param {{ slow?: boolean, darkMode?: boolean, mobile?: boolean, wcag?: boolean, screenshotPath?: string, discoverLinks?: number|null, navigationTimeout?: number, stealth?: boolean, userAgent?: string, locale?: string, timezoneId?: string, acceptLanguage?: string, screenSize?: string }} [options]
 * @returns {Promise<BrandingResult>}
 */
export declare function extractBranding(url: string, spinner: Spinner, browser: any, options?: ExtractOptions): Promise<BrandingResult>;
