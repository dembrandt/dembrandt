/**
 * DESIGN.md generator
 *
 * Converts dembrandt extraction results into the DESIGN.md format
 * as defined by Google Stitch — prose-first, human + AI readable.
 */
import { convertColor, deltaE } from './colors.js';

/**
 * @param {object} result - dembrandt extraction result
 * @returns {string} DESIGN.md content
 */
export function generateDesignMd(result) {
  const sections = [];

  const domain = (() => {
    try { return new URL(result.url).hostname.replace('www.', ''); } catch { return result.url ?? 'unknown'; }
  })();

  // --- Overview ---
  sections.push(`# Design System\n\n## Overview\nDesign tokens extracted from ${domain}.`);

  // --- Colors ---
  {
    const semantic = result.colors?.semantic;
    const palette = result.colors?.palette;

    // Collect all candidate colors from palette + buttons + links, normalised to hex
    const allCandidates = new Map();
    const addCandidate = (raw, source) => {
      if (raw == null) return;
      const parsed = convertColor(String(raw));
      if (!parsed) return;
      const hex = parsed.hex; // canonical 6-digit lowercase hex
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (!allCandidates.has(hex)) allCandidates.set(hex, { hex, lum, sat, source });
    };

    const highConf = palette?.filter(c => c.confidence === 'high' || c.confidence === 'medium') ?? [];
    for (const c of (highConf.length ? highConf : palette ?? [])) addCandidate(c.normalized || c.color, 'palette');
    for (const btn of result.components?.buttons ?? []) {
      const bg = btn.states?.default?.backgroundColor;
      if (bg && bg !== 'transparent') addCandidate(bg, 'button');
    }
    for (const link of result.components?.links ?? []) addCandidate(link.color, 'link');

    // Build semantic roles
    const roles = {};
    if (semantic && Object.values(semantic).some(Boolean)) {
      // Extractor already resolved primary/secondary from class names — most authoritative
      for (const [role, val] of Object.entries(semantic)) {
        if (val) roles[role] = toHex(val) || val;
      }
    }

    // Fill any missing roles from candidates, ranked by palette confidence then saturation
    if (allCandidates.size) {
      // Score candidates: high-confidence palette colors rank above button/link colors
      const confScore = { high: 3, medium: 2, low: 1 };
      const paletteConf = new Map();
      for (const c of palette ?? []) {
        const hex = toHex(c.normalized || c.color);
        if (hex) paletteConf.set(hex, confScore[c.confidence] ?? 0);
      }

      const candidates = Array.from(allCandidates.values()).map(c => ({
        ...c,
        // For primary/secondary selection, saturation dominates — a grey with high
        // palette confidence should not beat a vivid brand color from buttons/links.
        // Saturation scaled 0–1, confidence adds a small tiebreaker.
        rank: c.sat * 100 + (paletteConf.get(c.hex) ?? 0),
      }));

      // Sort by rank before dedup so the best candidate per cluster is kept, not the first-seen
      const ranked = [...candidates].sort((a, b) => b.rank - a.rank);
      const deduped = [];
      for (const c of ranked) {
        const tooClose = deduped.some(d => deltaE(c.hex, d.hex) < 15);
        if (!tooClose) deduped.push(c);
      }

      const used = new Set(Object.values(roles).map(h => h?.toLowerCase()));
      const byRank = [...deduped].sort((a, b) => b.rank - a.rank);
      const byLum = [...deduped].sort((a, b) => a.lum - b.lum);

      const pick = (arr) => {
        const c = arr.find(x => !used.has(x.hex.toLowerCase()));
        if (c) { used.add(c.hex.toLowerCase()); return c.hex; }
        return null;
      };

      if (!roles.primary) { const h = pick(byRank); if (h) roles.primary = h; }
      if (!roles.secondary) { const h = pick(byRank); if (h) roles.secondary = h; }
      if (!roles.surface) { const h = pick([...byLum].reverse()); if (h) roles.surface = h; }
      if (!roles['on-surface']) { const h = pick(byLum); if (h) roles['on-surface'] = h; }
    }

    const usageHints = {
      primary: 'CTAs, active states, key interactive elements',
      secondary: 'Supporting UI, secondary actions',
      surface: 'Page backgrounds',
      'on-surface': 'Primary text',
      background: 'Page backgrounds',
      text: 'Primary text',
      error: 'Validation errors, destructive actions',
      accent: 'Accent highlights, badges',
    };

    const lines = ['## Colors'];
    for (const [role, hex] of Object.entries(roles)) {
      if (!hex) continue;
      const hint = usageHints[role.toLowerCase()] ?? '';
      lines.push(`- **${capitalize(role)}** (${hex})${hint ? `: ${hint}` : ''}`);
    }

    if (lines.length > 1) sections.push(lines.join('\n'));
    else sections.push('## Colors\n- **Primary** (#000000): CTAs, active states, key interactive elements\n- **Surface** (#ffffff): Page backgrounds\n- **On-surface** (#000000): Primary text');
  }

  // --- Typography ---
  {
    const SKIP = /^(fontawesome|font.awesome|material.icon|glyphicon|icomoon|dashicons|built_rg|piepie|sans-serif|serif|monospace|cursive|fantasy|-apple-system|system-ui|segoe.ui|helvetica\b|arial|georgia|times|courier)/i;
    const styles = result.typography?.styles ?? [];
    const families = new Map();
    for (const s of styles) {
      if (s.family && !SKIP.test(s.family) && !families.has(s.family)) families.set(s.family, []);
      if (s.family && !SKIP.test(s.family)) families.get(s.family).push(s);
    }

    if (!families.size) {
      sections.push('## Typography\n- **Headlines**: System font, semi-bold\n- **Body**: System font, regular, 14–16px');
    } else {
      const lines = ['## Typography'];
      const roleLabels = ['Headlines', 'Body', 'Labels'];
      let i = 0;
      for (const [family, styleList] of families) {
        const role = roleLabels[i] ?? 'Labels';
        // Summarise weights
        const weights = [...new Set(styleList.map(s => s.weight).filter(Boolean))];
        const weightDesc = humanWeight(weights[0]);
        // Summarise sizes
        const sizes = styleList.map(s => parseFloat(s.size)).filter(Boolean).sort((a, b) => a - b);
        const sizeDesc = sizes.length > 1
          ? `${sizes[0]}–${sizes[sizes.length - 1]}px`
          : sizes.length === 1 ? `${sizes[0]}px` : '';
        const parts = [family];
        if (weightDesc) parts.push(weightDesc);
        if (sizeDesc) parts.push(sizeDesc);
        lines.push(`- **${role}**: ${parts.join(', ')}`);
        i++;
      }
      sections.push(lines.join('\n'));
    }
  }

  // --- Components ---
  {
    const lines = ['## Components'];
    let hasContent = false;

    const buttons = result.components?.buttons ?? [];
    if (buttons.length) {
      const btn = buttons[0].states?.default ?? buttons[0];
      const parts = [];
      if (btn.borderRadius) {
        const r = parseFloat(btn.borderRadius);
        parts.push(r > 20 ? 'fully rounded' : r > 0 ? `rounded (${btn.borderRadius})` : 'square corners');
      }
      if (btn.backgroundColor && btn.backgroundColor !== 'transparent') {
        const hex = toHex(btn.backgroundColor);
        parts.push(`primary uses ${hex ? hex + ' fill' : 'colored fill'}`);
      }
      if (btn.border && btn.border !== 'none') parts.push('outlined variant available');
      if (parts.length) { lines.push(`- **Buttons**: ${capitalize(parts.join(', '))}`); hasContent = true; }
    }

    const inputs = result.components?.inputs;
    const firstInput = inputs?.text?.[0] ?? (Array.isArray(inputs) ? inputs[0] : null);
    if (firstInput) {
      const inp = firstInput.states?.default ?? firstInput;
      const parts = [];
      if (inp.border) parts.push(`${inp.border.split(' ').slice(0, 2).join(' ')} border`);
      if (inp.borderRadius) parts.push(`${inp.borderRadius} radius`);
      if (parts.length) { lines.push(`- **Inputs**: ${capitalize(parts.join(', '))}`); hasContent = true; }
    }

    const radiiAll = result.borderRadius?.values ?? [];
    const radii = radiiAll.filter(v => v.value && !v.value.trim().includes(' ')).slice(0, 4).map(v => v.value);
    if (radii.length) { lines.push(`- **Border radius scale**: ${radii.join(', ')}`); hasContent = true; }

    const shadows = result.shadows ?? [];
    if (shadows.length) {
      lines.push(`- **Elevation**: uses box shadows for depth`);
      hasContent = true;
    } else {
      lines.push(`- **Elevation**: flat design, no shadows`);
      hasContent = true;
    }

    if (hasContent) sections.push(lines.join('\n'));
  }

  // --- Do's and Don'ts ---
  {
    const dos = [];
    const donts = [];

    // Infer from border radius
    const radiiAll = result.borderRadius?.values ?? [];
    const radii = radiiAll.filter(v => v.value && !v.value.trim().includes(' ')).map(v => parseFloat(v.value));
    if (radii.length) {
      const hasZero = radii.some(r => r === 0);
      const hasLarge = radii.some(r => r >= 20);
      if (hasZero && hasLarge) donts.push("Don't mix fully rounded and sharp corners in the same view");
      else if (hasLarge) dos.push('Do use rounded corners consistently across interactive elements');
      else if (hasZero) dos.push('Do maintain sharp corners for a precise, technical feel');
    }

    // Infer from colors
    dos.push('Do use the primary color sparingly — only for the most important action per screen');
    dos.push('Do maintain 4.5:1 contrast ratio for all body text (WCAG AA)');

    // Infer from shadows
    if (!(result.shadows?.length)) {
      dos.push('Do convey depth through background and border contrast rather than shadows');
    }

    const lines = ['## Do\'s and Don\'ts', ...dos.map(d => `- ${d}`), ...donts.map(d => `- ${d}`)];
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n') + '\n';
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanWeight(w) {
  if (!w) return '';
  const n = parseInt(w);
  if (n <= 300) return 'light';
  if (n <= 400) return 'regular';
  if (n <= 500) return 'medium';
  if (n <= 600) return 'semi-bold';
  if (n <= 700) return 'bold';
  return 'extra-bold';
}

function toHex(raw) {
  if (raw == null) return null;
  const parsed = convertColor(String(raw));
  return parsed ? parsed.hex : null;
}
