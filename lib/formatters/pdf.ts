/**
 * PDF Brand Guide Generator
 *
 * Renders extraction results as a minimal, professional brand guide PDF
 * using Playwright's page.pdf() — no extra dependencies.
 */

import { chromium } from 'playwright-core';
import { convertColor, hexToRgb } from '../colors.js';

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
  return [...colors].sort((a: any, b: any) => {
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

/** Chroma proxy: max-min of RGB channels (0–255). Higher = more saturated. */
function chroma(hexStr) {
  const rgb = hexToRgb(hexStr);
  if (!rgb) return 0;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
}

function titleCase(s) {
  return String(s).replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}

/** Descriptive name from hue/lightness for unlabeled palette colors. */
function hueName(hexStr) {
  const rgb = hexToRgb(hexStr);
  if (!rgb) return 'Color';
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = max === 0 ? 0 : d / max;
  if (s < 0.10) {
    if (l > 0.92) return 'White';
    if (l > 0.6) return 'Light Gray';
    if (l > 0.32) return 'Gray';
    if (l > 0.1) return 'Dark Gray';
    return 'Black';
  }
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  h *= 360;
  if (h < 15 || h >= 345) return 'Red';
  if (h < 45) return 'Orange';
  if (h < 70) return 'Yellow';
  if (h < 160) return 'Green';
  if (h < 200) return 'Teal';
  if (h < 255) return 'Blue';
  if (h < 290) return 'Purple';
  return 'Pink';
}

/** Display name: semantic role if labelled, else a descriptive hue name. */
function colorName(c) {
  return c.label ? titleCase(c.label) : hueName(c.hex);
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
    if (/white|valkoinen|light|negat|inver|_w\.|_w-|[-_]neg/i.test(url)) return true;
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
    padding: 96px 80px;
    background: ${primaryColor};
    color: ${coverTextColor};
  }

  .cover .logo-img {
    max-width: 340px;
    max-height: 180px;
    margin-bottom: 64px;
    object-fit: contain;
  }

  .cover .domain {
    font-size: 56px;
    font-weight: 700;
    line-height: 1.04;
    margin-bottom: 28px;
  }

  .cover .rule {
    width: 48px;
    height: 2px;
    background: ${coverTextColor};
    opacity: 0.5;
    margin: 0 auto 28px;
  }

  .cover .subtitle {
    font-size: 15px;
    font-weight: 600;
    color: ${coverSubtitleColor};
  }

  .cover .cover-meta {
    position: absolute;
    bottom: 64px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 13px;
    color: ${coverDateColor};
  }

  /* Back cover */
  .back-cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    background: ${primaryColor};
    color: ${coverTextColor};
  }

  .back-cover .logo-img {
    max-width: 220px;
    max-height: 110px;
    object-fit: contain;
    margin-bottom: 28px;
  }

  .back-cover .rule {
    width: 40px;
    height: 2px;
    background: ${coverTextColor};
    opacity: 0.45;
    margin: 0 auto 24px;
  }

  .back-cover .back-doc {
    font-size: 14px;
    font-weight: 600;
    color: ${coverSubtitleColor};
    margin-bottom: 14px;
  }

  .back-cover .back-copyright {
    font-size: 12px;
    line-height: 1.7;
    color: ${coverDateColor};
  }

  .back-cover .back-attrib {
    position: absolute;
    bottom: 56px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11px;
    color: ${coverDateColor};
  }

  .back-cover .back-attrib strong {
    font-weight: 700;
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

  /* Colors — block layout */
  .color-hero {
    border-radius: 10px;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 150px;
    margin-bottom: 24px;
  }

  .color-hero .ch-name {
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .color-hero .ch-values {
    font-size: 12px;
    font-family: 'SF Mono', 'Menlo', monospace;
    line-height: 1.7;
    opacity: 0.85;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  .color-card .chip {
    border-radius: 8px;
    min-height: 96px;
    display: flex;
    align-items: flex-end;
    padding: 12px 14px;
  }

  .color-card .chip-name {
    font-size: 13px;
    font-weight: 600;
  }

  .color-card .card-meta {
    padding: 10px 2px 0;
    font-size: 10px;
    font-family: 'SF Mono', 'Menlo', monospace;
    color: #555;
    line-height: 1.7;
  }

  .color-card .card-meta .cm-hex {
    color: #1a1a1a;
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

  /* Logo misuse — "don't" grid */
  .misuse-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 16px;
  }

  .misuse-box {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 24px 16px 38px;
    min-height: 124px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .misuse-box img {
    max-width: 150px;
    max-height: 56px;
    object-fit: contain;
  }

  .misuse-mark {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #d92d20;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .misuse-label {
    position: absolute;
    bottom: 12px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11px;
    color: #555;
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="page cover">
  ${logoUrl ? `<img class="logo-img" src="${escapeAttr(logoUrl)}" />` : ''}
  <div class="domain">${escapeHtml(companyName)}</div>
  <div class="rule"></div>
  <div class="subtitle">Brand Guidelines</div>
  <div class="cover-meta">${escapeHtml(domain)}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${date}${data.meta?.dembrandtVersion ? `&nbsp;&nbsp;&middot;&nbsp;&nbsp;v${escapeHtml(data.meta.dembrandtVersion)}` : ''}</div>
</div>

<!-- TABLE OF CONTENTS -->
${(() => {
  pageNum++;
  const tocEntries = [];
  let tocPage = pageNum + 1;
  if (logoUrl) {
    tocEntries.push({ title: 'Logo', page: tocPage });
    tocPage++;
    tocEntries.push({ title: 'Logo Misuse', page: tocPage });
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
  // Group entries: Logo | Colors | Typography...
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

<!-- LOGO MISUSE -->
${logoUrl ? (() => {
  pageNum++;
  const boxBg = logoIsLight ? '#0a0a0a' : '#ffffff';
  const violations = [
    { label: "Don't stretch", style: 'transform:scaleX(1.55)' },
    { label: "Don't condense", style: 'transform:scaleY(0.55)' },
    { label: "Don't rotate", style: 'transform:rotate(-12deg)' },
    { label: "Don't recolor", style: 'filter:hue-rotate(150deg) saturate(2.2)' },
    { label: "Don't add effects", style: 'filter:drop-shadow(3px 4px 2px rgba(0,0,0,0.45))' },
    { label: "Don't reduce contrast", style: 'opacity:0.32', boxBg: 'linear-gradient(135deg,#9aa0a6,#cdd1d6)' },
  ];
  return `
<div class="page">
  <div class="section-title">Logo Misuse</div>
  <p style="font-size:12px;color:#555;line-height:1.7;max-width:520px;margin-bottom:8px">
    Keep the logo consistent. Do not alter its proportions, colors, orientation, or apply effects.
    The examples below are incorrect.
  </p>
  <div class="misuse-grid">
    ${violations.map(v => `
    <div class="misuse-box" style="background:${escapeAttr(v.boxBg || boxBg)}">
      <img src="${escapeAttr(logoUrl)}" style="${v.style}" />
      <span class="misuse-mark">&#10005;</span>
      <span class="misuse-label">${escapeHtml(v.label)}</span>
    </div>`).join('')}
  </div>
  ${footer(pageNum)}
</div>`;
})() : ''}

<!-- COLORS -->
${colors.length > 0 ? (() => {
  const ordered = [...sortByHue(semanticColors), ...sortByHue(paletteColors)];
  if (!ordered.length) return '';

  // Primary = the explicit 'primary' role, else first semantic, else most chromatic
  const primary = semanticColors.find(c => /primary/i.test(c.label || ''))
    || semanticColors[0]
    || ordered.reduce((best, c) => chroma(c.hex) > chroma(best.hex) ? c : best, ordered[0]);

  const rest = ordered.filter(c => c.hex !== primary.hex).slice(0, 9);

  const heroFg = textColor(primary.hex);
  const heroValues = heroFg === '#fff' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)';

  const card = (c) => {
    const fg = textColor(c.hex);
    return `
    <div class="color-card">
      <div class="chip" style="background:${c.hex};color:${fg}">
        <span class="chip-name">${escapeHtml(colorName(c))}</span>
      </div>
      <div class="card-meta">
        <span class="cm-hex">${c.hex.toUpperCase()}</span><br>
        RGB ${formatRgb(c.hex)}<br>
        CMYK ${formatCmyk(c.hex)}
      </div>
    </div>`;
  };

  pageNum++;
  return `
<div class="page">
  <div class="section-title">Color Palette</div>
  <div class="color-hero" style="background:${primary.hex};color:${heroFg}">
    <div class="ch-name">${escapeHtml(colorName(primary))}</div>
    <div class="ch-values" style="color:${heroValues}">
      ${primary.hex.toUpperCase()}&nbsp;&nbsp;&middot;&nbsp;&nbsp;RGB ${formatRgb(primary.hex)}&nbsp;&nbsp;&middot;&nbsp;&nbsp;CMYK ${formatCmyk(primary.hex)}
    </div>
  </div>
  <div class="color-grid">
    ${rest.map(card).join('')}
  </div>
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

<!-- BACK COVER -->
${(() => {
  const year = (() => { const y = new Date(data.extractedAt).getFullYear(); return Number.isFinite(y) ? y : new Date().getFullYear(); })();
  const version = data.meta?.dembrandtVersion;
  return `
<div class="page back-cover">
  ${logoUrl ? `<img class="logo-img" src="${escapeAttr(logoUrl)}" />` : ''}
  <div class="rule"></div>
  <div class="back-doc">Brand Guidelines</div>
  <div class="back-copyright">
    &copy; ${year} ${escapeHtml(companyName)}. All rights reserved.<br>
    These guidelines and the assets within remain the property of ${escapeHtml(companyName)}.
  </div>
  <div class="back-attrib">
    Created with <strong>DEMBRANDT</strong>&nbsp;&nbsp;&middot;&nbsp;&nbsp;dembrandt.com${version ? `&nbsp;&nbsp;&middot;&nbsp;&nbsp;v${escapeHtml(version)}` : ''}
  </div>
</div>`;
})()}

</body>
</html>`;
}

function getLogoImageUrl(data) {
  const isImageUrl = (url) => {
    if (/\.(svg|png|jpg|jpeg|webp|gif|avif)(\?.*)?$/i.test(url)) return true;
    // Image optimizers (Next.js /_next/image, Cloudflare /cdn-cgi/image, etc.)
    // embed the real file in a query param and serve an image. The extension
    // lands mid-URL, so check the decoded form too.
    try {
      const decoded = decodeURIComponent(url);
      if (/\.(svg|png|jpg|jpeg|webp|gif|avif)(?=[?&]|$)/i.test(decoded)) return true;
    } catch { /* malformed encoding — fall through */ }
    return false;
  };

  // Inline SVG logos carry their own self-contained data URI.
  if (data.logo?.inline && data.logo.dataUri) {
    return data.logo.dataUri;
  }

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
    .sort((a: any, b: any) => {
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
    for (const [role, color] of (Object.entries(colors.semantic) as any[])) {
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
    for (const [_varName, varData] of (Object.entries(colors.cssVariables) as any[])) {
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
    weights: Array.from(f.weights).sort((a: any, b: any) => a - b)
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
