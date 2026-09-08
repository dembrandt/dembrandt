/**
 * PDF Brand Guide Generator
 *
 * Renders extraction results as a minimal, professional brand guide PDF
 * using Playwright's page.pdf() — no extra dependencies.
 *
 * The HTML itself is built by buildHTML() in brand-guide.ts, which has no
 * browser dependency. Import that module directly if you only need the HTML.
 */

import { loadBrowserEngines } from '../browser.js';
import { buildHTML, getLogoImageUrl } from './brand-guide.js';

export { buildHTML };

const EXT_CONTENT_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  ico: 'image/x-icon',
};

function contentTypeFromUrl(url: string): string | null {
  const m = /\.([a-z0-9]+)(?:[?&#]|$)/i.exec(url);
  return m ? EXT_CONTENT_TYPES[m[1].toLowerCase()] ?? null : null;
}

/**
 * The PDF renders via page.setContent() in an about:blank context with no base
 * URL, so a remote <img src> never loads and every logo slot shows a
 * broken-image glyph. Resolve the logo to a self-contained data URI up front;
 * if the bytes cannot be fetched, drop the logo entirely — a guide without a
 * logo beats one with broken-image placeholders on every page.
 */
export async function inlineLogoForPdf(data, fetchImpl = fetch) {
  const url = getLogoImageUrl(data);
  if (!url) return data;
  if (url.startsWith('data:')) return data;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const headerType = (res.headers.get('content-type') || '').split(';')[0].trim();
    const contentType = headerType.startsWith('image/')
      ? headerType
      : contentTypeFromUrl(url) ?? 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('empty body');
    const dataUri = `data:${contentType};base64,${buf.toString('base64')}`;
    return { ...data, logo: { ...(data.logo || {}), inline: true, dataUri } };
  } catch {
    return { ...data, logo: undefined, favicons: [] };
  }
}

/**
 * Generate a brand guide PDF from extraction data
 * @param {Object} data - Extraction results from extractBranding()
 * @param {string} outputPath - Path to write the PDF
 */
export async function generatePDF(data, outputPath, existingBrowser, options: { version?: string } = {}) {
  const html = buildHTML(await inlineLogoForPdf(data), options);
  const ownBrowser = !existingBrowser;
  let browser = existingBrowser;
  if (!browser) {
    const { chromium } = await loadBrowserEngines();
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    printBackground: true,
  });
  await page.close();
  if (ownBrowser) await browser.close();
}
