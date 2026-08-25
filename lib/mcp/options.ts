import { parseSitemap } from '../discovery.js';
import type { BrandingResult } from '../types.js';

/**
 * The slice of an extraction the crawl logic reads. Every field beyond the URL
 * is optional so a test can state only what it exercises.
 */
export interface Extraction extends Partial<BrandingResult> {
  url: string;
}

/** The navigation, auth and crawl surface every MCP extraction tool accepts. */
export interface ExtractionRequest {
  slow?: boolean;
  darkMode?: boolean;
  mobile?: boolean;
  wcag?: boolean;
  cookie?: string;
  header?: string;
  userAgent?: string;
  noSandbox?: boolean;
  pages?: number;
  paths?: string[];
  sitemap?: boolean;
}

/** Extra pages a bare `sitemap: true` takes when no budget is given, matching the CLI. */
export const SITEMAP_DEFAULT_PAGES = 20;

export function launchArgs(noSandbox?: boolean, env: NodeJS.ProcessEnv = process.env): string[] {
  const args = ['--disable-blink-features=AutomationControlled'];
  if (noSandbox || env.DEMBRANDT_NO_SANDBOX) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

/**
 * Translate one MCP request into extractBranding() options. Shared by the first
 * page and every crawled page so a merged run cannot drift from the first hit.
 */
export function extractOptions(req: ExtractionRequest, version: string) {
  return {
    navigationTimeout: 90000,
    slow: req.slow || false,
    darkMode: req.darkMode || false,
    mobile: req.mobile || false,
    wcag: req.wcag || false,
    _version: version,
    ...(req.cookie ? { cookie: req.cookie } : {}),
    ...(req.header ? { header: req.header } : {}),
    ...(req.userAgent ? { userAgent: req.userAgent } : {}),
  };
}

/** How many pages beyond the first the request asks for. 0 means a single page. */
export function pageBudget(req: ExtractionRequest): number {
  if (req.paths?.length) return req.paths.length;
  const requested = req.pages ?? 1;
  if (requested > 1) return requested - 1;
  return req.sitemap ? SITEMAP_DEFAULT_PAGES : 0;
}

export function isMultiPage(req: ExtractionRequest): boolean {
  return pageBudget(req) > 0;
}

/**
 * How many links the first extraction should discover. Null unless the request
 * needs DOM discovery: explicit paths and sitemap crawls resolve their own URLs.
 */
export function discoveryBudget(req: ExtractionRequest): number | null {
  if (req.paths?.length || req.sitemap) return null;
  const budget = pageBudget(req);
  return budget > 0 ? budget : null;
}

/** Resolve caller-supplied paths against the page actually landed on. */
export function resolvePaths(baseUrl: string, paths: string[]): string[] {
  const base = new URL(baseUrl);
  return paths.map((path) =>
    path.startsWith('http') ? path : `${base.protocol}//${base.host}${path.startsWith('/') ? path : '/' + path}`,
  );
}

/**
 * The extra page URLs to merge into the first result: explicit paths, sitemap
 * entries, or the links discovered while extracting the first page.
 *
 * `requestedUrl` is the URL the caller asked for. It differs from the result URL
 * whenever the site redirected, and a sitemap can live under either.
 */
export async function additionalPages(
  first: Extraction,
  requestedUrl: string,
  req: ExtractionRequest,
  fetchSitemap: (url: string, max: number) => Promise<string[]> = parseSitemap,
): Promise<string[]> {
  if (req.paths?.length) return resolvePaths(first.url, req.paths);

  const max = pageBudget(req);
  if (max < 1) return [];

  if (req.sitemap) {
    const fromResult = await fetchSitemap(first.url, max);
    if (fromResult.length > 0) return fromResult;
    return first.url !== requestedUrl ? await fetchSitemap(requestedUrl, max) : [];
  }

  return (first._discoveredLinks ?? []).slice(0, max);
}
