/**
 * Run a single or multi-page extraction and return a (possibly merged) result.
 * Shared between the main extract command and `dembrandt init`.
 */
export declare function extractWithCrawl(url: string, spinner: any, browser: any, opts?: any): Promise<any>;
