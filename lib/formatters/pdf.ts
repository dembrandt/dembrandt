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
import { buildHTML } from './brand-guide.js';

export { buildHTML };

/**
 * Generate a brand guide PDF from extraction data
 * @param {Object} data - Extraction results from extractBranding()
 * @param {string} outputPath - Path to write the PDF
 */
export async function generatePDF(data, outputPath, existingBrowser) {
  const html = buildHTML(data);
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
