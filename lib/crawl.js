import chalk from "chalk";
import { parseSitemap } from "./discovery.js";
import { mergeResults } from "./merger.js";
import { extractBranding } from "./extractors/index.js";

/**
 * Run a single or multi-page extraction and return a (possibly merged) result.
 * Shared between the main extract command and `dembrandt init`.
 */
export async function extractWithCrawl(url, spinner, browser, opts = {}) {
  const {
    crawl = null,
    sitemap = false,
    paths = [],
    silent = false,
    discoverLinks: _ignored,
    ...extractOpts
  } = opts;

  const crawlN = crawl ?? null;
  const isAutoCrawl = crawlN && !sitemap && paths.length === 0;
  const hasExplicitPaths = paths.length > 0;

  let result = await extractBranding(url, spinner, browser, {
    navigationTimeout: 90000,
    ...extractOpts,
    discoverLinks: isAutoCrawl ? Math.max(1, crawlN - 1) : null,
  });

  let additionalUrls = [];

  if (hasExplicitPaths) {
    const base = new URL(result.url);
    additionalUrls = paths.map((p) => {
      if (p.startsWith("http")) return p;
      return `${base.protocol}//${base.host}${p.startsWith("/") ? p : "/" + p}`;
    });
  } else if (sitemap) {
    if (!silent) spinner.start("Fetching sitemap...");
    const max = crawlN ? crawlN - 1 : 20;
    additionalUrls = await parseSitemap(result.url, max);
    if (additionalUrls.length === 0 && result.url !== url) {
      additionalUrls = await parseSitemap(url, max);
    }
  } else if (isAutoCrawl) {
    additionalUrls = result._discoveredLinks || [];
  }

  delete result._discoveredLinks;

  if (additionalUrls.length === 0) {
    if ((hasExplicitPaths || sitemap || isAutoCrawl) && !silent) {
      spinner.warn("No additional pages discovered");
    }
    result._extractedUrls = [url];
    return result;
  }

  spinner.stop();
  if (!silent) console.log(chalk.dim(`  Found ${additionalUrls.length} page(s) to analyze`));

  const allResults = [result];
  for (let i = 0; i < additionalUrls.length; i++) {
    const pageUrl = additionalUrls[i];
    const pageNum = i + 2;
    const total = additionalUrls.length + 1;
    const pagePath = (() => { try { return new URL(pageUrl).pathname; } catch { return pageUrl; } })();
    if (!silent) spinner.start(`Extracting page ${pageNum}/${total}: ${pagePath}`);

    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));

    try {
      const pageResult = await extractBranding(pageUrl, spinner, browser, {
        ...extractOpts,
      });
      delete pageResult._discoveredLinks;
      allResults.push(pageResult);
    } catch (err) {
      if (!silent) spinner.warn(`Skipping ${pageUrl}: ${String(err?.message || err).slice(0, 80)}`);
    }
  }

  spinner.stop();
  const merged = mergeResults(allResults);
  merged._extractedUrls = [url, ...additionalUrls.slice(0, allResults.length - 1)];
  return merged;
}
