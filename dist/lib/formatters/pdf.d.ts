/**
 * PDF Brand Guide Generator
 *
 * Renders extraction results as a minimal, professional brand guide PDF
 * using Playwright's page.pdf() — no extra dependencies.
 */
/**
 * Generate a brand guide PDF from extraction data
 * @param {Object} data - Extraction results from extractBranding()
 * @param {string} outputPath - Path to write the PDF
 */
export declare function generatePDF(data: any, outputPath: any, existingBrowser: any): Promise<void>;
