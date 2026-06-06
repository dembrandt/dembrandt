/**
 * DESIGN.md generator
 *
 * Converts dembrandt extraction results into Google's DESIGN.md draft format:
 * YAML design tokens in front matter plus ordered markdown rationale sections.
 */
import { convertColor, deltaE } from '../colors.js';

/**
 * @param {object} result - dembrandt extraction result
 * @returns {string} DESIGN.md content
 */
export function generateDesignMd(result: any) {
  const domain = getDomain(result);
  const name = getName(result, domain);
  const colorRoles = buildColorRoles(result);
  const typographyTokens = buildTypographyTokens(result);
  const spacingTokens = buildSpacingTokens(result);
  const roundedTokens = buildRoundedTokens(result);
  const componentTokens = buildComponentTokens(result, colorRoles, roundedTokens);

  const frontMatter = compactObject({
    name,
    description: `Design tokens extracted from ${result.url ?? domain}`,
    colors: hasKeys(colorRoles) ? colorRoles : null,
    typography: hasKeys(typographyTokens) ? typographyTokens : null,
    spacing: hasKeys(spacingTokens) ? spacingTokens : null,
    rounded: hasKeys(roundedTokens) ? roundedTokens : null,
    components: hasKeys(componentTokens) ? componentTokens : null,
  });

  const sections = [
    '# Design System',
    buildOverviewSection(domain),
    hasKeys(colorRoles) ? buildColorsSection(colorRoles) : null,
    hasKeys(typographyTokens) ? buildTypographySection(result, typographyTokens) : null,
    hasLayoutEvidence(result, spacingTokens) ? buildLayoutSection(result, spacingTokens) : null,
    hasElevationEvidence(result) ? buildElevationSection(result) : null,
    hasKeys(roundedTokens) ? buildShapesSection(roundedTokens) : null,
    hasComponentEvidence(result) ? buildComponentsSection(result) : null,
  ].filter(Boolean);

  return `---\n${toYaml(frontMatter)}---\n\n${sections.join('\n\n')}\n`;
}

function getDomain(result) {
  try {
    return new URL(result.url).hostname.replace('www.', '');
  } catch {
    return result.url ?? 'unknown';
  }
}

function getName(result, domain) {
  return result.siteName?.trim() || domain;
}

function buildOverviewSection(domain) {
  return `## Overview\nDesign tokens extracted from ${domain}. The YAML front matter contains machine-readable values observed by Dembrandt when available; the sections below summarize the extracted evidence without redesigning or correcting the source site.`;
}

function buildColorRoles(result) {
  const semantic = result.colors?.semantic;
  const palette = result.colors?.palette;

  const allCandidates = new Map();
  const addCandidate = (raw, source) => {
    if (raw == null) return;
    if (isTransparentColor(raw)) return;
    const parsed = convertColor(String(raw));
    if (!parsed) return;
    const hex = normalizeHex(parsed.hex);
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
    const state = btn.states?.default ?? btn;
    const bg = state.backgroundColor;
    if (bg && bg !== 'transparent' && !isTransparentColor(bg)) addCandidate(bg, 'button');
  }
  for (const link of result.components?.links ?? []) addCandidate(link.color, 'link');

  const roles: Record<string, any> = {};
  if (semantic && (Object.values(semantic) as any[]).some(Boolean)) {
    for (const [role, val] of (Object.entries(semantic) as any[])) {
      const hex = toHex(typeof val === 'string' ? val : val?.color);
      if (hex) roles[sanitizeTokenName(role)] = hex;
    }
  }

  if (allCandidates.size) {
    const confScore = { high: 3, medium: 2, low: 1 };
    const paletteConf = new Map();
    for (const c of palette ?? []) {
      const hex = toHex(c.normalized || c.color);
      if (hex) paletteConf.set(hex, confScore[c.confidence] ?? 0);
    }

    const ranked = Array.from(allCandidates.values())
      .map(c => ({
        ...c,
        rank: c.sat * 100 + (paletteConf.get(c.hex) ?? 0),
      }))
      .sort((a: any, b: any) => b.rank - a.rank);

    const deduped = [];
    for (const c of ranked) {
      const tooClose = deduped.some(d => deltaE(c.hex, d.hex) < 15);
      if (!tooClose) deduped.push(c);
    }

    const used = new Set((Object.values(roles) as any[]).map(h => h?.toLowerCase()));
    const byRank = [...deduped].sort((a: any, b: any) => b.rank - a.rank);
    const byLum = [...deduped].sort((a: any, b: any) => a.lum - b.lum);

    const pick = (arr) => {
      const c = arr.find(x => !used.has(x.hex.toLowerCase()));
      if (c) {
        used.add(c.hex.toLowerCase());
        return c.hex;
      }
      return null;
    };

    if (!roles.primary) roles.primary = pick(byRank);
    if (!roles.secondary) roles.secondary = pick(byRank);
    if (!roles.surface) roles.surface = pick([...byLum].reverse());
    if (!roles['on-surface']) roles['on-surface'] = pick(byLum);
  }

  return compactObject({
    primary: roles.primary,
    secondary: roles.secondary,
    tertiary: roles.tertiary ?? roles.accent,
    surface: roles.surface ?? roles.background,
    'on-surface': roles['on-surface'] ?? roles.text,
    error: roles.error,
  }) ?? {};
}

function buildTypographyTokens(result) {
  const styles = result.typography?.styles ?? [];
  const tokens: Record<string, any> = {};
  const usedNames = new Set();

  for (const [index, style] of styles.entries()) {
    const token = compactObject({
      fontFamily: normalizeFontFamily(style.fontFamily ?? style.family),
      fontSize: normalizeDimension(style.fontSize ?? style.size),
      fontWeight: normalizeFontWeight(style.fontWeight ?? style.weight),
      lineHeight: normalizeLineHeight(style.lineHeight),
      letterSpacing: normalizeDimension(style.letterSpacing),
      fontFeature: normalizeFontFeature(style.fontFeatures ?? style.fontFeature),
    });

    if (!token || !token.fontFamily && !token.fontSize) continue;

    const baseName = typographyTokenName(style, index);
    const name = uniqueTokenName(baseName, usedNames);
    tokens[name] = token;
  }

  return tokens;
}

function buildSpacingTokens(result) {
  const values = new Set();
  const base = normalizeDimension(result.spacing?.scaleType);
  if (base) values.add(base);

  for (const entry of result.spacing?.commonValues ?? []) {
    const value = normalizeDimension(entry.px ?? entry);
    if (value) values.add(value);
  }

  const sorted = [...values].sort((a: any, b: any) => parseFloat(a) - parseFloat(b)).slice(0, 8);
  const names = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl', 'xxxxl'];
  const tokens: Record<string, any> = {};

  if (base) tokens.base = base;
  for (let i = 0; i < sorted.length; i++) {
    const name = names[i] ?? `space-${i + 1}`;
    if (tokens[name] !== sorted[i]) tokens[name] = sorted[i];
  }

  return tokens;
}

function buildRoundedTokens(result) {
  const radii = result.borderRadius?.values ?? [];
  const values = [...new Set(radii
    .map(entry => normalizeRadius(entry.value))
    .filter(Boolean))]
    .sort((a: any, b: any) => parseFloat(a) - parseFloat(b));

  const tokens: Record<string, any> = {};
  if (values.includes('0px')) tokens.none = '0px';

  const nonZero = values.filter(value => value !== '0px' && value !== '9999px').slice(0, 4);
  const names = ['sm', 'md', 'lg', 'xl'];
  for (let i = 0; i < nonZero.length; i++) tokens[names[i]] = nonZero[i];
  if (values.includes('9999px')) tokens.full = '9999px';

  return tokens;
}

function buildComponentTokens(result, colorRoles, roundedTokens) {
  const components: Record<string, any> = {};
  const button = (result.components?.buttons ?? [])
    .map(btn => btn.states?.default ?? btn)
    .find(btn => btn.backgroundColor && !isTransparentColor(btn.backgroundColor));

  if (button) {
    const background = tokenReferenceForColor(button.backgroundColor, colorRoles);
    const text = tokenReferenceForColor(button.color ?? button.textColor, colorRoles);
    const rounded = tokenReferenceForRadius(button.borderRadius, roundedTokens);

    const token = compactObject({
      backgroundColor: background ?? toHex(button.backgroundColor),
      textColor: text ?? toHex(button.color ?? button.textColor),
      rounded: rounded ?? normalizeRadius(button.borderRadius),
      padding: normalizePadding(button.padding),
      height: normalizeDimension(button.height),
    });
    if (token) components['button-observed'] = token;
  }

  const input = firstInput(result.components?.inputs);
  if (input) {
    const state = input.states?.default ?? input;
    const token = compactObject({
      backgroundColor: tokenReferenceForColor(state.backgroundColor, colorRoles) ?? toHex(state.backgroundColor),
      textColor: tokenReferenceForColor(state.color ?? state.textColor, colorRoles) ?? toHex(state.color ?? state.textColor),
      rounded: tokenReferenceForRadius(state.borderRadius, roundedTokens) ?? normalizeRadius(state.borderRadius),
      padding: normalizePadding(state.padding),
    });
    if (token) components['input-observed'] = token;
  }

  return components;
}

function buildColorsSection(colorRoles) {
  const lines = ['## Colors'];
  for (const [role, hex] of (Object.entries(colorRoles) as any[])) {
    lines.push(`- **${titleize(role)}** (${hex}): Observed color token extracted from the site's palette, semantic CSS, or component styles.`);
  }
  return lines.join('\n');
}

function buildTypographySection(result, typographyTokens) {
  const lines = ['## Typography'];
  const tokenEntries = (Object.entries(typographyTokens) as any[]).slice(0, 6);

  for (const [name, token] of tokenEntries) {
    const parts = [token.fontFamily, token.fontSize, humanWeight(token.fontWeight)]
      .filter(Boolean);
    lines.push(`- **${titleize(name)}**: ${parts.join(', ')}`);
  }

  if (result.typography?.sources?.googleFonts?.length) {
    lines.push(`- **Font source**: Google Fonts (${result.typography.sources.googleFonts.join(', ')})`);
  }

  return lines.join('\n');
}

function buildLayoutSection(result, spacingTokens) {
  const scale = result.spacing?.scaleType ? `${result.spacing.scaleType} spacing scale` : null;
  const breakpoints = (result.breakpoints ?? []).map(bp => bp.px).filter(Boolean).slice(0, 6);
  const lines = ['## Layout'];

  if (scale) {
    lines.push(`Observed spacing scale: ${scale}.`);
  }

  if (Object.keys(spacingTokens).length) {
    lines.push(`- **Spacing tokens**: ${(Object.entries(spacingTokens) as any[]).map(([name, value]) => `${name} ${value}`).join(', ')}`);
  }

  if (breakpoints.length) {
    lines.push(`- **Responsive breakpoints**: ${breakpoints.join(', ')}`);
  }

  return lines.join('\n');
}

function buildElevationSection(result) {
  const shadows = result.shadows ?? [];
  const lines = ['## Elevation & Depth'];
  lines.push(`Observed box-shadow styles: ${shadows.slice(0, 3).map(s => s.shadow).join('; ')}`);
  return lines.join('\n');
}

function buildShapesSection(roundedTokens) {
  const lines = ['## Shapes'];
  const rounded = (Object.entries(roundedTokens) as any[]).map(([name, value]) => `${name} ${value}`).join(', ');
  lines.push(`Observed rounded-corner tokens: ${rounded}.`);
  return lines.join('\n');
}

function buildComponentsSection(result) {
  const lines = ['## Components'];

  const button = firstButton(result.components?.buttons);
  if (button) {
    const btn = button.states?.default ?? button;
    const parts = [];
    if (btn.borderRadius) {
      parts.push(`radius ${btn.borderRadius}`);
    }
    if (btn.backgroundColor && !isTransparentColor(btn.backgroundColor)) {
      const hex = toHex(btn.backgroundColor);
      parts.push(`background ${hex ?? btn.backgroundColor}`);
    }
    if (btn.color ?? btn.textColor) parts.push(`text ${toHex(btn.color ?? btn.textColor) ?? (btn.color ?? btn.textColor)}`);
    if (btn.padding) parts.push(`padding ${btn.padding}`);
    if (hasVisibleBorder(btn.border)) parts.push(`border ${btn.border}`);
    if (parts.length) {
      lines.push(`- **Buttons**: Observed sample with ${parts.join(', ')}`);
    }
  }

  const input = firstInput(result.components?.inputs);
  if (input) {
    const inp = input.states?.default ?? input;
    const parts = [];
    if (hasVisibleBorder(inp.border)) parts.push(`${inp.border.split(' ').slice(0, 2).join(' ')} border`);
    if (inp.borderRadius) parts.push(`${inp.borderRadius} radius`);
    if (parts.length) {
      lines.push(`- **Inputs**: Observed sample with ${parts.join(', ')}`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent);
  let yaml = '';

  for (const [key, child] of (Object.entries(value) as any[])) {
    if (child == null) continue;
    if (typeof child === 'object' && !Array.isArray(child)) {
      if (!Object.keys(child).length) continue;
      yaml += `${pad}${yamlKey(key)}:\n${toYaml(child, indent + 1)}`;
    } else {
      yaml += `${pad}${yamlKey(key)}: ${yamlScalar(child)}\n`;
    }
  }

  return yaml;
}

function yamlKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

function yamlScalar(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value));
}

function typographyTokenName(style, index) {
  const contexts = style.contexts ?? (style.context ? [style.context] : []);
  const normalized = contexts.map(c => String(c).toLowerCase());

  if (normalized.some(c => /^h1$/.test(c))) return 'headline-display';
  if (normalized.some(c => /^h2$/.test(c))) return 'headline-lg';
  if (normalized.some(c => /^h3$/.test(c))) return 'headline-md';
  if (normalized.some(c => /^h[4-6]$/.test(c))) return 'headline-sm';
  if (normalized.some(c => c === 'button')) return 'label-lg';
  if (normalized.some(c => c === 'a')) return 'label-md';
  if (normalized.some(c => c === 'p' || c === 'div')) return 'body-md';

  return `text-${index + 1}`;
}

function uniqueTokenName(baseName, usedNames) {
  let name = sanitizeTokenName(baseName);
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${sanitizeTokenName(baseName)}-${suffix}`;
    suffix++;
  }
  usedNames.add(name);
  return name;
}

function sanitizeTokenName(name) {
  return String(name)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'token';
}

function normalizeFontFamily(value) {
  if (!value) return null;
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeFontFeature(value) {
  if (!value) return null;
  const raw = String(value).trim();
  return raw && raw !== 'normal' ? raw : null;
}

function normalizeFontWeight(value) {
  if (value == null) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeLineHeight(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  const dimension = normalizeDimension(raw);
  if (dimension) return dimension;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeDimension(value) {
  if (value == null) return null;
  if (typeof value === 'number') return `${value}px`;

  const clean = String(value).split('(')[0].trim();
  const match = clean.match(/^(-?\d*\.?\d+)(px|em|rem)$/i);
  if (!match) return null;
  return `${trimNumber(match[1])}${match[2].toLowerCase()}`;
}

function normalizeRadius(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === '50%' || raw === '100%') return '9999px';
  return normalizeDimension(raw);
}

function normalizePadding(value) {
  if (value == null) return null;
  const parts = String(value).trim().split(/\s+/).map(normalizeDimension);
  if (parts.some(part => !part)) return null;
  return parts.join(' ');
}

function tokenReferenceForColor(raw, colorRoles) {
  const hex = toHex(raw);
  if (!hex) return null;
  const match = (Object.entries(colorRoles) as any[]).find(([, value]) => value.toLowerCase() === hex.toLowerCase());
  return match ? `{colors.${match[0]}}` : null;
}

function tokenReferenceForRadius(raw, roundedTokens) {
  const radius = normalizeRadius(raw);
  if (!radius) return null;
  const match = (Object.entries(roundedTokens) as any[]).find(([, value]) => value === radius);
  return match ? `{rounded.${match[0]}}` : null;
}

function hasKeys(object) {
  return Boolean(object && Object.keys(object).length);
}

function hasLayoutEvidence(result, spacingTokens) {
  return hasKeys(spacingTokens) || (result.breakpoints ?? []).some(bp => bp.px);
}

function hasElevationEvidence(result) {
  return result.shadows?.length > 0;
}

function hasComponentEvidence(result) {
  return Boolean(firstButton(result.components?.buttons) || firstInput(result.components?.inputs));
}

function firstButton(buttons) {
  if (!Array.isArray(buttons)) return null;
  const normalized = buttons.map(button => button.states?.default ?? button);
  return normalized.find(button =>
    button.backgroundColor && !isTransparentColor(button.backgroundColor) ||
    positiveDimension(button.borderRadius) ||
    meaningfulPadding(button.padding) ||
    hasVisibleBorder(button.border)
  ) ?? normalized.find(button =>
    button.backgroundColor ||
    button.color ||
    button.textColor ||
    button.padding ||
    button.borderRadius ||
    hasVisibleBorder(button.border)
  ) ?? null;
}

function firstInput(inputs) {
  if (!inputs) return null;
  if (Array.isArray(inputs)) return inputs[0] ?? null;
  return inputs.text?.[0] ?? inputs.search?.[0] ?? (Object.values(inputs) as any[]).flat()[0] ?? null;
}

function compactObject(object) {
  const entries = (Object.entries(object) as any[]).filter(([, value]) => value != null && value !== '');
  return entries.length ? Object.fromEntries(entries) : null;
}

function isTransparentColor(value) {
  if (!value) return true;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'transparent') return true;

  const hexAlpha = raw.match(/^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i);
  if (hexAlpha) {
    const alpha = raw.length === 5 ? raw[4] + raw[4] : raw.slice(7, 9);
    return alpha === '00';
  }

  const functional = raw.match(/^rgba?\((.*)\)$/);
  if (!functional) return false;

  const body = functional[1].trim();
  const slashParts = body.split('/');
  if (slashParts.length === 2) return isZeroAlpha(slashParts[1]);

  const commaParts = body.split(',');
  return commaParts.length === 4 && isZeroAlpha(commaParts[3]);
}

function isZeroAlpha(value) {
  const raw = String(value).trim();
  const parsed = parseFloat(raw);
  return !Number.isNaN(parsed) && parsed === 0;
}

function hasVisibleBorder(value) {
  if (!value) return false;
  const raw = String(value).trim().toLowerCase();
  return raw !== 'none' && !raw.includes(' none ') && !raw.startsWith('0px none');
}

function meaningfulPadding(value) {
  if (!value) return false;
  return String(value).split(/\s+/).some(part => positiveDimension(part));
}

function positiveDimension(value) {
  if (!value) return false;
  const match = String(value).match(/^(\d*\.?\d+)px$/);
  return Boolean(match && parseFloat(match[1]) > 0);
}

function toHex(raw) {
  if (raw == null) return null;
  if (isTransparentColor(raw)) return null;
  const parsed = convertColor(String(raw));
  return parsed ? normalizeHex(parsed.hex) : null;
}

function normalizeHex(hex) {
  return hex.toUpperCase();
}

function trimNumber(value) {
  return String(parseFloat(value));
}

function titleize(s) {
  return String(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function humanWeight(w) {
  if (!w) return '';
  const n = parseInt(w, 10);
  if (n <= 300) return 'light';
  if (n <= 400) return 'regular';
  if (n <= 500) return 'medium';
  if (n <= 600) return 'semi-bold';
  if (n <= 700) return 'bold';
  return 'extra-bold';
}
