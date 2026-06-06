/**
 * Page Discovery
 *
 * Discovers internal pages from a starting URL via DOM link extraction
 * or sitemap.xml parsing.
 */
/**
 * Score a URL path for importance (higher = more important).
 * Prioritizes shallow, navigational paths over blog posts / legal pages.
 */
export declare function scoreUrl(pathname: any): number;
/**
 * Discover internal links from an already-loaded Playwright page.
 * Call after extractBranding() has loaded and scrolled the page.
 *
 * @param {import('playwright-core').Page} page
 * @param {string} baseUrl - The starting URL (used to determine same-origin)
 * @param {number} maxPages - Maximum number of URLs to return
 * @returns {Promise<string[]>} Ordered list of URLs to crawl (excluding homepage)
 */
export declare function discoverLinks(page: any, baseUrl: any, maxPages: any): Promise<any>;
/**
 * Discover pages from a site's sitemap.xml.
 * Checks robots.txt for Sitemap directives, then tries common paths.
 * Follows sitemapindex references one level deep.
 *
 * @param {string} baseUrl - The starting URL (should be post-redirect)
 * @param {number} maxPages - Maximum number of URLs to return
 * @returns {Promise<string[]>} List of URLs from sitemap (excluding homepage)
 */
export declare function parseSitemap(baseUrl: any, maxPages: any): Promise<any[]>;
