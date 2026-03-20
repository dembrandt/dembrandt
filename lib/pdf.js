/**
 * PDF Brand Guide Generator
 *
 * Renders extraction results as a minimal, professional brand guide PDF
 * using Playwright's page.pdf() — no extra dependencies.
 */

import { chromium } from 'playwright-core';
import { convertColor, hexToRgb } from './colors.js';

/**
 * Generate a brand guide PDF from extraction data
 * @param {Object} data - Extraction results from extractBranding()
 * @param {string} outputPath - Path to write the PDF
 */
export async function generatePDF(data, outputPath, existingBrowser) {
  const html = buildHTML(data);
  const ownBrowser = !existingBrowser;
  const browser = existingBrowser || await chromium.launch({ headless: true });
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

function hex(colorString) {
  if (!colorString) return null;
  try {
    const c = convertColor(colorString);
    return c ? c.hex : null;
  } catch {
    return null;
  }
}

function textColor(bgHex) {
  if (!bgHex) return '#000';
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#1a1a1a' : '#fff';
}

/** Sort colors by hue for visual grouping */
function sortByHue(colors) {
  return [...colors].sort((a, b) => {
    const aRgb = hexToRgb(a.hex);
    const bRgb = hexToRgb(b.hex);
    if (!aRgb || !bRgb) return 0;

    const hue = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (max + min) / 2;

      // Grays/whites/blacks: sort by lightness at the end
      if (sat < 0.08) return 720 + lum * 360;

      let h;
      const d = max - min;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      return h * 360;
    };

    return hue(aRgb.r, aRgb.g, aRgb.b) - hue(bRgb.r, bRgb.g, bRgb.b);
  });
}

function pickCoverBg(colors) {
  const gathered = gatherColors(colors);
  if (!gathered.length) return '#0a0a0a';
  // Check if brand colors are mostly light — if so, use white bg so they pop
  let lightCount = 0;
  for (const c of gathered.slice(0, 6)) {
    const rgb = hexToRgb(c.hex);
    if (!rgb) continue;
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    if (lum > 0.55) lightCount++;
  }
  return lightCount > gathered.slice(0, 6).length / 2 ? '#0a0a0a' : '#ffffff';
}

function formatRgb(hexStr) {
  const rgb = hexToRgb(hexStr);
  if (!rgb) return '';
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function formatCmyk(hexStr) {
  const rgb = hexToRgb(hexStr);
  if (!rgb) return '';
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return '0, 0, 0, 100';
  const c = Math.round(((1 - r - k) / (1 - k)) * 100);
  const m = Math.round(((1 - g - k) / (1 - k)) * 100);
  const y = Math.round(((1 - b - k) / (1 - k)) * 100);
  return `${c}, ${m}, ${y}, ${Math.round(k * 100)}`;
}

function weightName(w) {
  const map = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
  return map[w] || `Weight ${w}`;
}

function buildHTML(data) {
  let domain;
  try { domain = new URL(data.url).hostname.replace('www.', ''); }
  catch { domain = 'unknown'; }
  const date = new Date(data.extractedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // Derive company name: extracted siteName, or capitalize domain
  const companyName = data.siteName || domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const allColors = gatherColors(data.colors);
  const semanticColors = allColors.filter(c => c.label && c.source === 'semantic');
  const paletteColors = allColors.filter(c => c.source !== 'semantic');
  const colors = sortByHue([...semanticColors, ...paletteColors]);
  const fonts = gatherFonts(data.typography);
  const googleFonts = data.typography?.sources?.googleFonts || [];
  const shadows = (data.shadows || [])
    .filter(s => s.confidence === 'high')
    .slice(0, 6);
  const showShadows = shadows.length >= 3;

  // Build Google Fonts import URL for available fonts
  const googleFontImport = (() => {
    if (!googleFonts.length || !fonts.length) return '';
    const available = fonts.filter(f =>
      googleFonts.some(gf => gf.toLowerCase() === f.family.toLowerCase())
    );
    if (!available.length) return '';
    const params = available.map(f => {
      const weights = f.weights.length ? f.weights.join(';') : '400';
      return `family=${encodeURIComponent(f.family)}:wght@${weights}`;
    }).join('&');
    return `@import url('https://fonts.googleapis.com/css2?${params}&display=swap');`;
  })();

  // Detect if the logo is light (white on transparent) — needs dark background
  const logoUrl = getLogoImageUrl(data);
  const logoIsLight = (() => {
    if (!data.logo) return false;
    const url = (data.logo.url || '').toLowerCase();
    // Filename hints: "white", "valkoinen", "light", "neg", "inverse"
    if (/white|valkoinen|light|negat|inver|\_w\.|\_w\-|[\-_]neg/i.test(url)) return true;
    // If the logo's actual background is dark, the logo itself is likely light
    if (data.logo.background) {
      const bgH = hex(data.logo.background);
      if (bgH) {
        const rgb = hexToRgb(bgH);
        if (rgb) {
          const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
          if (lum < 0.3) return true;
        }
      }
    }
    return false;
  })();

  // Use logo's background, or force dark if logo is light, else pick from colors
  const logoBgHex = data.logo?.background ? hex(data.logo.background) : null;
  const primaryColor = logoIsLight ? (logoBgHex || '#0a0a0a') : (logoBgHex || pickCoverBg(data.colors));
  const coverTextColor = textColor(primaryColor);
  const coverSubtitleColor = coverTextColor === '#fff' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  const coverDateColor = coverTextColor === '#fff' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';

  let pageNum = 1;
  const footer = (num) => `
  <div class="page-footer">
    <span class="footer-domain">${escapeHtml(domain)}</span>
    <span>Brand Guide</span>
    <span>${num}</span>
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(domain)} - Brand Guide - Made with Dembrandt</title>
<meta name="author" content="Dembrandt">
<meta name="keywords" content="dembrandt, brand guide, ${escapeHtml(domain)}">
<meta name="description" content="Brand guide for ${escapeHtml(domain)}, generated by Dembrandt">
<style>
  ${googleFontImport}
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a;
    background: #fff;
    font-size: 14px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 210mm;
    height: 297mm;
    padding: 56px 64px 64px;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  .page:last-child { page-break-after: auto; }

  /* Cover */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 80px;
    background: ${primaryColor};
    color: ${coverTextColor};
  }

  .cover .logo-img {
    max-width: 360px;
    max-height: 220px;
    margin-bottom: 48px;
    object-fit: contain;
  }

  .cover .domain {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1.1;
    margin-bottom: 12px;
  }

  .cover .subtitle {
    font-size: 16px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: ${coverSubtitleColor};
    margin-bottom: 8px;
  }

  .cover .date {
    font-size: 14px;
    color: ${coverDateColor};
  }


  /* Section header */
  .section-title {
    font-size: 24px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 40px;
    padding-bottom: 12px;
    border-bottom: 2px solid #1a1a1a;
  }

  .color-group-label {
    font-size: 13px;
    font-weight: 600;
    color: #4a4a4a;
    margin-bottom: 12px;
    margin-top: 24px;
  }

  .color-group-label:first-of-type { margin-top: 0; }

  /* Colors — table layout */
  .color-table {
    width: 100%;
    border-collapse: collapse;
  }

  .color-table thead th {
    font-size: 11px;
    font-weight: 700;
    color: #4a4a4a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 12px 10px;
    text-align: left;
    border-bottom: 2px solid #1a1a1a;
  }

  .color-table thead th:first-child {
    padding-left: 0;
    width: 52px;
  }

  .color-table tbody td {
    padding: 8px 12px;
    font-size: 12px;
    font-family: 'SF Mono', 'Menlo', monospace;
    color: #1a1a1a;
    vertical-align: middle;
    border-bottom: 1px solid #d0d0d0;
  }

  .color-table tbody td:first-child {
    padding-left: 0;
    padding-right: 12px;
  }

  .color-swatch {
    width: 44px;
    height: 28px;
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.12);
    display: inline-block;
  }

  .color-table .color-label-cell {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    color: #555;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .color-table .hex-cell {
    font-weight: 600;
  }

  /* Typography — full page specimens */
  .type-specimen {
    margin-bottom: 48px;
    break-inside: avoid;
  }

  .type-family-name {
    font-size: 14px;
    font-weight: 600;
    color: #4a4a4a;
    margin-bottom: 20px;
  }

  .type-alphabet {
    font-weight: 400;
    color: #1a1a1a;
    line-height: 1.2;
    margin-bottom: 12px;
    letter-spacing: -0.5px;
  }

  .type-paragraph {
    font-size: 18px;
    line-height: 1.6;
    color: #333;
    margin-top: 32px;
    max-width: 520px;
  }

  .type-meta {
    font-size: 13px;
    font-family: 'SF Mono', 'Menlo', monospace;
    color: #555;
    margin-bottom: 24px;
  }

  .type-weights {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 28px;
  }

  .type-weight-item {
    display: flex;
    align-items: baseline;
    gap: 24px;
  }

  .type-weight-label {
    font-size: 12px;
    font-family: 'SF Mono', 'Menlo', monospace;
    color: #767676;
    min-width: 100px;
    text-align: right;
    flex-shrink: 0;
  }

  .type-weight-preview {
    font-size: 28px;
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Shadows */
  .shadow-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .shadow-card {
    width: 100%;
    aspect-ratio: 1.4;
    background: #fff;
    border-radius: 12px;
    display: flex;
    align-items: flex-end;
    padding: 14px;
  }

  .shadow-label {
    font-size: 10px;
    font-family: 'SF Mono', 'Menlo', monospace;
    color: #555;
    word-break: break-all;
    line-height: 1.3;
  }

  /* Footer */
  .page-footer {
    position: absolute;
    bottom: 36px;
    left: 64px;
    right: 64px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #767676;
  }

  .page-footer .footer-domain { font-weight: 600; }

  /* Table of Contents */
  .toc {
    margin-top: 80px;
  }

  .toc-list {
    list-style: none;
  }

  .toc-list li {
    display: flex;
    align-items: baseline;
    padding: 18px 0;
    font-size: 18px;
    font-weight: 500;
    color: #1a1a1a;
  }

  .toc-list li .toc-title {
    flex-shrink: 0;
  }

  .toc-list li .toc-dots {
    flex: 1;
    border-bottom: 1px dotted #aaa;
    margin: 0 12px;
    position: relative;
    top: -4px;
  }

  .toc-list li .toc-page {
    font-size: 18px;
    font-family: 'SF Mono', 'Menlo', monospace;
    font-weight: 400;
    color: #555;
    flex-shrink: 0;
  }

  .toc-section-group {
    margin-top: 8px;
    padding-top: 8px;
  }

  .toc-section-group:first-child {
    margin-top: 0;
    padding-top: 0;
  }


  /* Logo usage page */
  .logo-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 16px;
  }

  .logo-box {
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    min-height: 140px;
    position: relative;
  }

  .logo-box img {
    max-width: 200px;
    max-height: 80px;
    object-fit: contain;
  }

  .logo-box-label {
    position: absolute;
    bottom: 10px;
    left: 14px;
    font-size: 10px;
    font-family: 'SF Mono', 'Menlo', monospace;
    opacity: 0.5;
  }

  .logo-box-full {
    grid-column: 1 / -1;
    min-height: 120px;
  }

  .logo-box-full img {
    max-width: 280px;
    max-height: 100px;
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="page cover">
  ${logoUrl ? `<img class="logo-img" src="${escapeAttr(logoUrl)}" />` : ''}
  <div class="domain">${escapeHtml(companyName)}</div>
  <div class="subtitle">Brand Guide</div>
  <div class="date">${escapeHtml(domain)}  /  ${date}</div>
</div>

<!-- TABLE OF CONTENTS -->
${(() => {
  pageNum++;
  const tocEntries = [];
  let tocPage = pageNum + 1;
  if (logoUrl) {
    tocEntries.push({ title: 'Logo', page: tocPage });
    tocPage++;
  }
  if (colors.length > 0) {
    tocEntries.push({ title: 'Color Palette', page: tocPage });
    tocPage++;
  }
  if (fonts.length > 0) {
    tocEntries.push({ title: 'Typography - Primary', page: tocPage });
    tocPage++;
    if (fonts.length > 1) {
      tocEntries.push({ title: 'Typography - Secondary', page: tocPage });
      tocPage++;
    }
  }
  if (showShadows) {
    tocEntries.push({ title: 'Elevation', page: tocPage });
    tocPage++;
  }
  // Group entries: Logo | Colors | Typography... | Elevation
  const groups = [];
  let currentGroup = [];
  for (const e of tocEntries) {
    const isTypo = e.title.startsWith('Typography');
    const prevIsTypo = currentGroup.length > 0 && currentGroup[0].title.startsWith('Typography');
    if (currentGroup.length > 0 && isTypo !== prevIsTypo) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(e);
  }
  if (currentGroup.length) groups.push(currentGroup);

  return `
<div class="page">
  <div class="section-title">Contents</div>
  <div class="toc">
    <ul class="toc-list">
      ${groups.map(group => group.map((e, i) =>
        `${i === 0 && groups.indexOf(group) > 0 ? '<li class="toc-section-group"></li>' : ''}<li><span class="toc-title">${escapeHtml(e.title)}</span><span class="toc-dots"></span><span class="toc-page">${e.page}</span></li>`
      ).join('')).join('')}
    </ul>
  </div>
  ${footer(pageNum)}
</div>`;
})()}

<!-- LOGO USAGE -->
${logoUrl ? (() => {
  pageNum++;
  const brandColorHex = allColors.find(c => {
    const rgb = hexToRgb(c.hex);
    if (!rgb) return false;
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    const max = Math.max(rgb.r, rgb.g, rgb.b), min = Math.min(rgb.r, rgb.g, rgb.b);
    return (max - min) > 30 && lum > 0.15 && lum < 0.85;
  })?.hex || '#336699';

  const brandFg = textColor(brandColorHex);

  const logoW = data.logo?.width || 200;
  const logoH = data.logo?.height || 60;
  // A = logo height. Safe zone = A on all sides.
  // Scale for the diagram: fit logo to ~160px wide
  // Scale diagram to fit: max 160px wide, max 80px tall
  const scale = Math.min(160 / logoW, 80 / logoH);
  const dW = Math.round(logoW * scale);
  const dH = Math.round(logoH * scale);
  const dA = dH; // A in diagram pixels = scaled logo height

  // Logo contrast boxes: pick label color that works on each bg
  const boxes = [
    { bg: '#ffffff', border: true, label: 'White' },
    { bg: '#0a0a0a', border: false, label: 'Dark' },
    { bg: brandColorHex, border: false, label: brandColorHex.toUpperCase() },
    { bg: '#f5f5f5', border: true, label: 'Light gray' },
  ];

  return `
<div class="page">
  <div class="section-title">Logo</div>
  <div class="logo-grid">
    ${boxes.map(b => {
      const labelColor = textColor(b.bg);
      // Ensure label has enough contrast: if label would be invisible, override
      const labelStyle = `color:${labelColor === '#fff' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)'}`;
      return `<div class="logo-box${boxes.indexOf(b) < 2 ? ' logo-box-full' : ''}" style="background:${b.bg}${b.border ? ';border:1px solid #d0d0d0' : ''}">
      <img src="${escapeAttr(logoUrl)}" />
      <span class="logo-box-label" style="${labelStyle}">${b.label}</span>
    </div>`;
    }).join('')}
  </div>

  <div style="margin-top:32px;display:flex;align-items:flex-start;gap:48px">
    <div style="flex-shrink:0">
      <div style="position:relative;width:${dW + dA * 2}px;height:${dH + dA * 2}px;background:#f5f5f5;border-radius:4px">
        <div style="position:absolute;inset:0;border:1px dashed #aaa;border-radius:4px"></div>
        <div style="position:absolute;top:${dA}px;left:${dA}px;width:${dW}px;height:${dH}px;background:#fff;border:1px solid #ccc;border-radius:2px;display:flex;align-items:center;justify-content:center">
          <img src="${escapeAttr(logoUrl)}" style="max-width:${dW - 8}px;max-height:${dH - 8}px;object-fit:contain" />
        </div>
        <div style="position:absolute;top:${Math.round(dA / 2 - 7)}px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;font-style:italic;font-family:Georgia,serif;color:#555">A</div>
        <div style="position:absolute;bottom:${Math.round(dA / 2 - 7)}px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;font-style:italic;font-family:Georgia,serif;color:#555">A</div>
        <div style="position:absolute;left:${Math.round(dA / 2 - 5)}px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;font-style:italic;font-family:Georgia,serif;color:#555">A</div>
        <div style="position:absolute;right:${Math.round(dA / 2 - 5)}px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;font-style:italic;font-family:Georgia,serif;color:#555">A</div>
      </div>
      <div style="margin-top:10px;font-size:10px;font-family:'SF Mono','Menlo',monospace;color:#767676;text-align:center">A = ${logoH}px (logo height)</div>
    </div>
    <div style="padding-top:4px">
      <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:10px">Clear Space</div>
      <p style="font-size:12px;color:#555;line-height:1.7;max-width:260px">
        <strong style="font-style:italic;font-family:Georgia,serif">A</strong> = logo height.
        Minimum clear space on all sides equals
        <strong style="font-style:italic;font-family:Georgia,serif">A</strong>.
        No text, graphics, or other elements should intrude this zone.
      </p>
      <div style="margin-top:16px;font-size:11px;font-family:'SF Mono','Menlo',monospace;color:#555">
        ${logoW} \u00d7 ${logoH}px
      </div>
    </div>
  </div>
  ${footer(pageNum)}
</div>`;
})() : ''}

<!-- COLORS -->
${colors.length > 0 ? (() => {
  const sortedSemantic = sortByHue(semanticColors);
  const sortedPalette = sortByHue(paletteColors);
  const allSorted = [...sortedSemantic, ...sortedPalette];
  const n = allSorted.length;
  if (n === 0) return '';
  // A4 usable height ~920px, minus title ~70px, thead ~30px, footer ~40px = ~780px for rows
  const availH = 780;
  const rowTotal = Math.floor(availH / n);
  const swatchH = rowTotal >= 40 ? 28 : rowTotal >= 32 ? 20 : rowTotal >= 26 ? 16 : 12;
  const rowPad = Math.max(1, Math.floor((rowTotal - swatchH) / 2));
  const fontSize = rowTotal < 30 ? 10 : 12;

  const colorRow = (c) => `
      <tr>
        <td style="padding:${rowPad}px 12px ${rowPad}px 0"><div class="color-swatch" style="background:${c.hex};height:${swatchH}px"></div></td>
        ${c.label ? `<td class="color-label-cell" style="padding:${rowPad}px 12px;font-size:${fontSize}px">${escapeHtml(c.label)}</td>` : `<td style="padding:${rowPad}px 12px"></td>`}
        <td class="hex-cell" style="padding:${rowPad}px 12px;font-size:${fontSize}px">${c.hex.toUpperCase()}</td>
        <td style="padding:${rowPad}px 12px;font-size:${fontSize}px">${formatRgb(c.hex)}</td>
        <td style="padding:${rowPad}px 12px;font-size:${fontSize}px">${formatCmyk(c.hex)}</td>
      </tr>`;

  pageNum++;
  return `
<div class="page">
  <div class="section-title">Color Palette</div>
  <table class="color-table">
    <thead>
      <tr>
        <th></th>
        <th></th>
        <th>hex</th>
        <th>rgb</th>
        <th>cmyk</th>
      </tr>
    </thead>
    <tbody>
      ${allSorted.map(c => colorRow(c)).join('')}
    </tbody>
  </table>
  ${footer(pageNum)}
</div>`;
})() : ''}

<!-- TYPOGRAPHY -->
${fonts.length > 0 ? (() => {
  const pages = [];
  const primaryFont = fonts[0];
  const primaryAvailable = googleFonts.some(gf => gf.toLowerCase() === primaryFont.family.toLowerCase());
  pageNum++;
  pages.push(`
<div class="page">
  <div class="section-title">Typography - Primary</div>
  <div class="type-specimen"${primaryAvailable ? ` style="font-family:'${escapeAttr(primaryFont.family)}',${escapeAttr(primaryFont.fallbacks || 'sans-serif')}"` : ''}>
    <div class="type-family-name">${escapeHtml(primaryFont.family)}${!primaryAvailable ? ' <span style="background:#f5a623;color:#1a1a1a;font-size:9px;font-weight:700;padding:3px 10px;border-radius:3px;margin-left:10px;letter-spacing:0.3px">INSTALL FONT TO COMPLETE</span>' : ''}</div>
    <div class="type-alphabet" style="font-size:72px;font-weight:${primaryFont.weights[0] || 400}">
      ABCDEFGHIJKLM<br>NOPQRSTUVWXYZ
    </div>
    <div class="type-alphabet" style="font-size:48px;font-weight:${primaryFont.weights[0] || 400};margin-top:8px">
      abcdefghijklmnopqrstuvwxyz
    </div>
    <div class="type-alphabet" style="font-size:36px;font-weight:${primaryFont.weights[0] || 400};margin-top:8px;color:#4a4a4a">
      0123456789  !@#$%&amp;*()
    </div>
    <div class="type-meta" style="margin-top:16px">
      ${primaryFont.weights.map(w => weightName(w)).join(', ')}${primaryFont.fallbacks ? `  /  ${escapeHtml(primaryFont.fallbacks)}` : ''}
    </div>
    ${primaryFont.weights.length > 1 ? `
    <div class="type-weights">
      ${primaryFont.weights.slice(0, 5).map(w => `
      <div class="type-weight-item">
        <span class="type-weight-label">${weightName(w)}</span>
        <span class="type-weight-preview" style="font-weight:${w}">
          Hamburgevons
        </span>
      </div>`).join('')}
    </div>` : ''}
    <div class="type-paragraph" style="font-weight:${primaryFont.weights.includes(400) ? 400 : primaryFont.weights[0] || 400}">
      Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed.
    </div>
    ${!primaryAvailable ? `<p style="font-size:11px;color:#555;margin-top:24px;border-top:1px solid #d0d0d0;padding-top:12px">Specimen shown in system fallback font. Actual rendering requires installing <strong>${escapeHtml(primaryFont.family)}</strong>.</p>` : ''}
  </div>
  ${footer(pageNum)}
</div>`);

  if (fonts.length > 1) {
    const secondaryFont = fonts[1];
    const secondaryAvailable = googleFonts.some(gf => gf.toLowerCase() === secondaryFont.family.toLowerCase());
    pageNum++;
    pages.push(`
<div class="page">
  <div class="section-title">Typography - Secondary</div>
  <div class="type-specimen"${secondaryAvailable ? ` style="font-family:'${escapeAttr(secondaryFont.family)}',${escapeAttr(secondaryFont.fallbacks || 'sans-serif')}"` : ''}>
    <div class="type-family-name">${escapeHtml(secondaryFont.family)}${!secondaryAvailable ? ' <span style="background:#f5a623;color:#1a1a1a;font-size:9px;font-weight:700;padding:3px 10px;border-radius:3px;margin-left:10px;letter-spacing:0.3px">INSTALL FONT TO COMPLETE</span>' : ''}</div>
    <div class="type-alphabet" style="font-size:56px;font-weight:${secondaryFont.weights[0] || 400}">
      ABCDEFGHIJKLM<br>NOPQRSTUVWXYZ
    </div>
    <div class="type-alphabet" style="font-size:40px;font-weight:${secondaryFont.weights[0] || 400};margin-top:8px">
      abcdefghijklmnopqrstuvwxyz
    </div>
    <div class="type-alphabet" style="font-size:28px;font-weight:${secondaryFont.weights[0] || 400};margin-top:8px;color:#4a4a4a">
      0123456789  !@#$%&amp;*()
    </div>
    <div class="type-meta" style="margin-top:16px">
      ${secondaryFont.weights.map(w => weightName(w)).join(', ')}${secondaryFont.fallbacks ? `  /  ${escapeHtml(secondaryFont.fallbacks)}` : ''}
    </div>
    ${secondaryFont.weights.length > 1 ? `
    <div class="type-weights">
      ${secondaryFont.weights.slice(0, 5).map(w => `
      <div class="type-weight-item">
        <span class="type-weight-label">${weightName(w)}</span>
        <span class="type-weight-preview" style="font-weight:${w}">
          Hamburgevons
        </span>
      </div>`).join('')}
    </div>` : ''}
    <div class="type-paragraph" style="font-weight:${secondaryFont.weights.includes(400) ? 400 : secondaryFont.weights[0] || 400}">
      Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed.
    </div>
    ${!secondaryAvailable ? `<p style="font-size:11px;color:#555;margin-top:24px;border-top:1px solid #d0d0d0;padding-top:12px">Specimen shown in system fallback font. Actual rendering requires installing <strong>${escapeHtml(secondaryFont.family)}</strong>.</p>` : ''}
  </div>
  ${footer(pageNum)}
</div>`);
  }
  return pages.join('\n');
})() : ''}

<!-- SHADOWS -->
${showShadows ? (() => {
  pageNum++;
  return `
<div class="page">
  <div class="section-title">Elevation</div>
  <div class="shadow-grid">
    ${shadows.map(s => `
    <div class="shadow-card" style="box-shadow:${escapeAttr(s.shadow)}">
      <div class="shadow-label">${escapeHtml(truncate(s.shadow, 70))}</div>
    </div>`).join('')}
  </div>
  ${footer(pageNum)}
</div>`;
})() : ''}

<!-- CLOSING PAGE -->
${(() => {
  const closeBg = primaryColor;
  const closeFg = coverTextColor;
  const subtleFg = closeFg === '#fff' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  const dembrandtFg = closeFg === '#fff' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  return `
<div class="page" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:${closeBg}">
  ${logoUrl ? `<img src="${escapeAttr(logoUrl)}" style="max-width:240px;max-height:120px;object-fit:contain;margin-bottom:64px" />` : ''}
  <div style="margin-top:auto"></div>
  <div style="margin-bottom:48px;text-align:center">
    <div style="font-size:10px;color:${subtleFg};letter-spacing:1px;margin-bottom:8px">Extracted with</div>
    <div style="font-size:16px;font-weight:700;color:${dembrandtFg};letter-spacing:2px">DEMBRANDT</div>
    <div style="font-size:9px;color:${subtleFg};margin-top:4px">dembrandt.com</div>
  </div>
</div>`;
})()}

</body>
</html>`;
}

function getLogoImageUrl(data) {
  const isImageUrl = (url) => /\.(svg|png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url);

  if (data.logo?.url && isImageUrl(data.logo.url)) {
    return data.logo.url;
  }

  if (!data.favicons?.length) return null;

  const appleTouch = data.favicons.find(f => f.type === 'apple-touch-icon');
  if (appleTouch) return appleTouch.url;

  const svg = data.favicons.find(f => f.url?.endsWith('.svg'));
  if (svg) return svg.url;

  const sized = data.favicons
    .filter(f => f.sizes && f.type !== 'og:image' && f.type !== 'twitter:image')
    .sort((a, b) => {
      const aSize = parseInt(a.sizes) || 0;
      const bSize = parseInt(b.sizes) || 0;
      return bSize - aSize;
    });
  if (sized.length) return sized[0].url;

  const icon = data.favicons.find(f => f.type !== 'og:image' && f.type !== 'twitter:image');
  return icon?.url || null;
}

function gatherColors(colors) {
  if (!colors) return [];
  const result = [];
  const seen = new Set();

  const add = (colorStr, label, confidence, source) => {
    const h = hex(colorStr);
    if (!h || seen.has(h.toLowerCase())) return false;
    seen.add(h.toLowerCase());
    const c = convertColor(colorStr);
    result.push({
      hex: h,
      rgb: c ? c.rgb : colorStr,
      label,
      confidence,
      source
    });
    return true;
  };

  // 1. Semantic colors are the most reliable brand signals
  if (colors.semantic) {
    for (const [role, color] of Object.entries(colors.semantic)) {
      if (color) add(color, role, 'high', 'semantic');
    }
  }

  // 2. All palette colors
  if (colors.palette) {
    for (const c of colors.palette) {
      add(c.color, '', c.confidence, 'palette');
    }
  }

  // 3. CSS variable colors
  if (colors.cssVariables) {
    for (const [varName, varData] of Object.entries(colors.cssVariables)) {
      const val = typeof varData === 'string' ? varData : varData.value;
      if (val) add(val, '', 'high', 'css-var');
    }
  }

  return result;
}

function gatherFonts(typography) {
  if (!typography?.styles?.length) return [];

  const families = new Map();

  for (const style of typography.styles) {
    if (!style.family) continue;
    if (!families.has(style.family)) {
      families.set(style.family, {
        family: style.family,
        fallbacks: style.fallbacks || '',
        weights: new Set(),
        sizes: []
      });
    }
    const f = families.get(style.family);
    if (style.weight) f.weights.add(Number(style.weight));
    if (style.size) {
      f.sizes.push({ size: style.size, weight: style.weight, context: style.context });
    }
  }

  return Array.from(families.values()).map(f => ({
    ...f,
    weights: Array.from(f.weights).sort((a, b) => a - b)
  }));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}
