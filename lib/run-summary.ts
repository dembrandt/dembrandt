/**
 * Builds the "what shaped this run" lines for the closing CLI summary (DEM-99):
 * which flags were active and which paths were merged. Pure and importable so it
 * is unit-tested without spawning the CLI; index.ts wraps the returned strings
 * with chalk and prints them under the analysis summary.
 */

export interface RunOpts {
  darkMode?: boolean;
  mobile?: boolean;
  slow?: boolean;
  stealth?: boolean;
  wcag?: boolean;
  /** number of pages, or true for the bare flag, or null/undefined when unused */
  crawl?: number | boolean | null;
  sitemap?: boolean;
  browser?: string;
  /** commander sets false for --no-sandbox; true/undefined otherwise */
  sandbox?: boolean;
  rawColors?: boolean;
  dtcg?: boolean;
  saveOutput?: boolean;
  /** --html [path]: undefined when absent, string or true when present */
  html?: unknown;
  compare?: unknown;
  brandGuide?: boolean;
  designMd?: boolean;
  screenshot?: unknown;
}

/**
 * The flags that changed the run, in a stable display order. Behaviour-only
 * flags (--wcag, --dark-mode, ...) included so they leave a trace even though
 * they write no file; artifact flags included too (their paths print separately).
 */
export function activeFlags(opts: RunOpts = {}): string[] {
  const bits: string[] = [];
  if (opts.darkMode) bits.push('--dark-mode');
  if (opts.mobile) bits.push('--mobile');
  if (opts.slow) bits.push('--slow');
  if (opts.stealth) bits.push('--stealth');
  if (opts.wcag) bits.push('--wcag');
  if (opts.crawl != null && opts.crawl !== false) {
    bits.push(opts.crawl === true ? '--crawl' : `--crawl ${opts.crawl}`);
  }
  if (opts.sitemap) bits.push('--sitemap');
  if (opts.browser && opts.browser !== 'chromium') bits.push(`--browser ${opts.browser}`);
  if (opts.sandbox === false) bits.push('--no-sandbox');
  if (opts.rawColors) bits.push('--raw-colors');
  if (opts.dtcg) bits.push('--dtcg');
  if (opts.saveOutput) bits.push('--save-output');
  if (opts.html !== undefined) bits.push('--html');
  if (opts.compare) bits.push('--compare');
  if (opts.brandGuide) bits.push('--brand-guide');
  if (opts.designMd) bits.push('--design-md');
  if (opts.screenshot) bits.push('--screenshot');
  return bits;
}

/**
 * Explicit paths and/or the merged-page count. Explicit paths are positional
 * (not flags) so they would otherwise be invisible; --crawl/--sitemap have no
 * explicit paths but still merge pages, reported by the count alone.
 */
export function pathSummary(paths: string[] | undefined, mergedPages = 0): string[] {
  const bits: string[] = [];
  if (paths && paths.length) bits.push(...paths);
  if (mergedPages > 1) bits.push(`(${mergedPages} pages merged)`);
  return bits;
}
