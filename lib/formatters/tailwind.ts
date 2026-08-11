/**
 * Tailwind CSS v4 theme generator.
 *
 * Emits an `@theme` block containing ONLY values observed on the page. No
 * generated 50..950 ramps, no invented intermediate shades, no derived hover or
 * on-color variants: those exist elsewhere in the extraction, but a token file
 * is a starting point a human continues from, and an invented shade is
 * indistinguishable from a measured one once it is in the file.
 *
 * v4 only. The v4 theme is plain CSS custom properties, so this module is a
 * string serializer that never imports or pins Tailwind; a v3
 * `tailwind.config.js` emitter would be a second serialization of the same data
 * and is deliberately not written until someone asks for it.
 */
import { convertColor, deltaE } from '../colors.js';
import type {
  BorderRadius,
  Breakpoint,
  Colors,
  CssVariable,
  PaletteColor,
  Shadow,
  Spacing,
  TypographyStyle,
} from '../types.js';

/**
 * The Tailwind major this emitter targets. There is no runtime dependency on
 * Tailwind: the output is text, so a Tailwind release cannot break this code,
 * only make the emitted file stale. `npm run tailwind:check` (and the scheduled
 * Tailwind Watch workflow that runs it) compares this against the published
 * latest and fails when a new major lands, which is the only event that can
 * invalidate the namespaces below.
 */
export const TAILWIND_TARGET_MAJOR = 4;

/**
 * Every Tailwind theme namespace this emitter writes into. A namespace being
 * renamed, dropped or re-scoped upstream is the concrete failure mode; this list
 * is what tailwind:check reports against so the review has a checklist.
 */
export const TAILWIND_NAMESPACES = [
  '--color-*',
  '--font-*',
  '--text-*',
  '--font-weight-*',
  '--tracking-*',
  '--spacing',
  '--spacing-*',
  '--radius-*',
  '--shadow-*',
  '--breakpoint-*',
] as const;

/**
 * A semantic role's value. Current extractions store a bare colour string;
 * older ones (and the DESIGN.md fixtures) store `{ color }`, so both are read.
 */
export type SemanticColorValue = string | { color?: string | null } | null;

/**
 * A typography style as seen by this formatter. The current extractor emits
 * `family`/`size`/`weight`; pre-1.0 payloads and hand-written fixtures use the
 * CSS property names, and both shapes reach the formatters unchanged.
 */
export interface TypographyStyleInput extends Omit<Partial<TypographyStyle>, 'fallbacks'> {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string | number;
  /** The live extractor emits one comma-joined string; fixtures use an array. */
  fallbacks?: string | string[];
  /** The live extractor's name for letter-spacing. */
  spacing?: string | null;
}

/**
 * The slice of an extraction this formatter reads. Narrower than BrandingResult
 * on purpose: a full result is assignable to it, and so is a partial payload
 * from an interrupted or degraded run, which is the case the emitter has to
 * survive without throwing.
 */
export interface TailwindThemeInput {
  url?: string;
  extractedAt?: string;
  meta?: { dembrandtVersion?: string | null };
  colors?: Partial<Omit<Colors, 'semantic'>> & {
    semantic?: Record<string, SemanticColorValue>;
  };
  typography?: { styles?: TypographyStyleInput[] };
  spacing?: Partial<Spacing>;
  borderRadius?: Partial<BorderRadius>;
  shadows?: Shadow[];
  breakpoints?: (Breakpoint | number)[];
}

/** One `--name: value;` declaration inside the `@theme` block. */
interface ThemeEntry {
  name: string;
  value: string;
  /** Rendered as a trailing comment: where the value came from. */
  note?: string;
}

/** A commented group of declarations, dropped entirely when it has no entries. */
interface ThemeSection {
  title: string;
  entries: ThemeEntry[];
}

/** Perceptual distance under which two colours are treated as the same token. */
const DEDUPE_DELTA_E = 15;

/** Upper bound on colour tokens; past this the file stops being a starting point. */
const MAX_COLORS = 24;

/**
 * Serialize an extraction as a Tailwind v4 theme.
 *
 * @param result - dembrandt extraction result, or any partial of it
 * @returns CSS: a provenance header, `@import "tailwindcss"`, one `@theme` block
 */
export function generateTailwindTheme(result: TailwindThemeInput): string {
  const sections: ThemeSection[] = [
    { title: 'Colors', entries: buildColors(result) },
    { title: 'Typography', entries: buildTypography(result) },
    { title: 'Spacing', entries: buildSpacing(result) },
    { title: 'Radius', entries: buildRadius(result) },
    { title: 'Shadows', entries: buildShadows(result) },
    { title: 'Breakpoints', entries: buildBreakpoints(result) },
  ].filter(section => section.entries.length > 0);

  const body = sections.map(renderSection).join('\n\n');

  return `${buildHeader(result)}\n@import "tailwindcss";\n\n@theme {\n${body}\n}\n`;
}

/** Render one section, aligning trailing provenance comments within it. */
function renderSection(section: ThemeSection): string {
  const declarations = section.entries.map(entry => `  ${entry.name}: ${entry.value};`);
  const column = Math.max(...declarations.map(line => line.length)) + 2;

  const lines = section.entries.map((entry, i) => {
    const declaration = declarations[i];
    if (!entry.note) return declaration;
    return `${declaration}${' '.repeat(Math.max(1, column - declaration.length))}/* ${entry.note} */`;
  });

  return `  /* ${section.title} */\n${lines.join('\n')}`;
}

function buildHeader(result: TailwindThemeInput): string {
  const source = result.url ?? 'an unknown page';
  const version = result.meta?.dembrandtVersion;
  const stamp = result.extractedAt ? ` on ${result.extractedAt}` : '';

  return [
    '/*',
    ` * Tailwind v${TAILWIND_TARGET_MAJOR} theme extracted from ${source}${stamp}`,
    version ? ` * dembrandt v${version}` : null,
    ' *',
    ' * Observed values only. Every token below was measured on the page; no',
    ' * shades, states or scale steps were generated. Tailwind defaults still',
    ' * apply for anything not listed here, so extend rather than replace.',
    ' *',
    ' * This is a draft to check, not a source of truth. Each token carries the',
    ' * evidence behind it; read down the counts and drop what the page only did',
    ' * once before you build on this file.',
    ' */',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/* Colors                                                                      */
/* -------------------------------------------------------------------------- */

function buildColors(result: TailwindThemeInput): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  const emitted: string[] = [];
  const usedNames = new Set<string>();

  const add = (rawName: string, raw: string, note: string): void => {
    if (entries.length >= MAX_COLORS) return;
    const hex = toHex(raw);
    if (!hex) return;
    if (emitted.some(seen => deltaE(hex, seen) < DEDUPE_DELTA_E)) return;
    emitted.push(hex);
    entries.push({ name: uniqueName(`--color-${slug(rawName)}`, usedNames), value: hex, note });
  };

  // 1. Semantic roles. These carry the extractor's own meaning, so they keep
  //    their role name rather than being renumbered.
  for (const [role, value] of Object.entries(result.colors?.semantic ?? {})) {
    const raw = typeof value === 'string' ? value : value?.color;
    if (raw) add(role, raw, 'semantic');
  }

  // 2. Remaining palette colours. An authored CSS custom property name is the
  //    only real naming provenance the page offers, so prefer it over brand-N.
  //    Alpha/lightness variants of the primary are skipped: they are the same
  //    token in a different state, which is a decision for the human.
  const authored = authoredNames(result.colors?.cssVariables);
  const palette: PaletteColor[] = result.colors?.palette ?? [];
  let counter = 0;

  for (const entry of palette) {
    if (entry.confidence !== 'high' && entry.confidence !== 'medium') continue;
    if (entry.variantOf) continue;

    const hex = toHex(entry.normalized || entry.color);
    if (!hex) continue;

    const authoredName = authored.get(hex);
    const before = entries.length;
    const source = authoredName ? 'css variable' : 'palette';
    add(authoredName ?? `brand-${counter + 1}`, hex, `${source}, ${evidenceOf(entry)}`);
    if (entries.length > before && !authoredName) counter++;
  }

  return entries;
}

/** hex -> the author's custom property name, for colours declared as :root tokens. */
function authoredNames(
  cssVariables: Record<string, string | CssVariable> | undefined
): Map<string, string> {
  const names = new Map<string, string>();

  for (const [name, entry] of Object.entries(cssVariables ?? {})) {
    const raw = typeof entry === 'string' ? entry : entry?.hex ?? entry?.value;
    const hex = toHex(raw);
    if (!hex || names.has(hex)) continue;
    // Strip the property prefix and any redundant colour word: the emitted name
    // is already inside the --color-* namespace.
    const cleaned = name.replace(/^--/, '').replace(/^(colors?|c)-/, '');
    if (cleaned) names.set(hex, cleaned);
  }

  return names;
}

/* -------------------------------------------------------------------------- */
/* Typography                                                                  */
/* -------------------------------------------------------------------------- */

/** CSS keyword Tailwind uses for each numeric weight. */
const WEIGHT_NAMES = new Map<string, string>([
  ['100', 'thin'],
  ['200', 'extralight'],
  ['300', 'light'],
  ['400', 'normal'],
  ['500', 'medium'],
  ['600', 'semibold'],
  ['700', 'bold'],
  ['800', 'extrabold'],
  ['900', 'black'],
]);

function buildTypography(result: TailwindThemeInput): ThemeEntry[] {
  const styles: TypographyStyleInput[] = result.typography?.styles ?? [];

  return [
    ...buildFontFamilies(styles),
    ...buildFontSizes(styles),
    ...buildFontWeights(styles),
    ...buildTracking(styles),
  ];
}

/** Families in first-seen order; the first is almost always the body font. */
function buildFontFamilies(styles: TypographyStyleInput[]): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  const seen = new Set<string>();
  const usedNames = new Set<string>();

  for (const style of styles) {
    const family = String(style.family ?? style.fontFamily ?? '').trim();
    if (!family || seen.has(family)) continue;
    seen.add(family);

    const stack = [family, ...fallbackList(style.fallbacks)].map(quoteFamily).join(', ');
    entries.push({
      name: uniqueName(`--font-${slug(family)}`, usedNames),
      value: stack,
      note: style.context,
    });
  }

  return entries;
}

/**
 * One size token per semantic context, taken from that context's first style.
 * A page yields dozens of measured sizes and the extractor reuses a context
 * across several of them; numbering the repeats (--text-body-2, -3, …) would
 * produce a scale with no meaning. First occurrence wins, the rest is the
 * human's edit.
 */
function buildFontSizes(styles: TypographyStyleInput[]): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  const seenContexts = new Set<string>();
  const seenSizes = new Set<string>();

  for (const style of styles) {
    const size = normalizeLength(style.size ?? style.fontSize);
    if (!size || seenSizes.has(size)) continue;

    const context = slug(style.context ?? size);
    if (seenContexts.has(context)) continue;
    seenContexts.add(context);
    seenSizes.add(size);

    const name = `--text-${context}`;
    entries.push({ name, value: size, note: style.context });

    // Tailwind v4 reads `--text-<name>--line-height` as that size's paired
    // leading, so text-<name> restores both without a second utility.
    const lineHeight = normalizeLineHeight(style.lineHeight);
    if (lineHeight) entries.push({ name: `${name}--line-height`, value: lineHeight });
  }

  return entries;
}

function buildFontWeights(styles: TypographyStyleInput[]): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  const seen = new Set<string>();

  for (const style of styles) {
    const weight = normalizeWeight(style.weight ?? style.fontWeight);
    if (!weight || seen.has(weight)) continue;
    seen.add(weight);

    const name = WEIGHT_NAMES.get(weight);
    if (name) entries.push({ name: `--font-weight-${name}`, value: weight });
  }

  return entries;
}

/**
 * Letter spacing, only where the page deviates from normal, and only for the
 * first style of each context — same reasoning as the size scale.
 */
function buildTracking(styles: TypographyStyleInput[]): ThemeEntry[] {
  const entries: ThemeEntry[] = [];
  const seenContexts = new Set<string>();
  const seenValues = new Set<string>();

  for (const style of styles) {
    const tracking = normalizeTracking(style.letterSpacing ?? style.spacing);
    if (!tracking || seenValues.has(tracking)) continue;

    const context = slug(style.context ?? 'custom');
    if (seenContexts.has(context)) continue;
    seenContexts.add(context);
    seenValues.add(tracking);

    entries.push({ name: `--tracking-${context}`, value: tracking, note: style.context });
  }

  return entries;
}

/* -------------------------------------------------------------------------- */
/* Spacing, radius, shadows, breakpoints                                       */
/* -------------------------------------------------------------------------- */

function buildSpacing(result: TailwindThemeInput): ThemeEntry[] {
  // A recognised base-N rhythm is better expressed as v4's dynamic spacing
  // multiplier than as a handful of named steps: it reproduces every observed
  // value and everything between them, which is what a human continuing the
  // file will reach for next.
  // scaleType is "base-8" in normalized payloads and "8px" straight off the
  // extractor; both name the same rhythm.
  const scaleType = String(result.spacing?.scaleType ?? '');
  const base = /^base-(\d+)$/.exec(scaleType) ?? /^(\d+)px$/.exec(scaleType);
  if (base) return [{ name: '--spacing', value: `${base[1]}px`, note: `${scaleType} scale` }];

  const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  return mostUsed(
    result.spacing?.commonValues ?? [],
    entry => entry?.display ?? entry?.px,
    names.length
  ).map((observed, i) => ({
    name: `--spacing-${names[i]}`,
    value: observed.value,
    note: evidenceOf(observed),
  }));
}

function buildRadius(result: TailwindThemeInput): ThemeEntry[] {
  const observed = result.borderRadius?.values ?? [];
  const entries: ThemeEntry[] = [];
  const names = ['sm', 'md', 'lg', 'xl'];

  // 0 and the pill radius are shapes, not scale steps: they keep Tailwind's own
  // names and stay out of the sm..xl ordering.
  const isShape = (value: string): boolean => value === '0px' || parseFloat(value) >= 999;
  const shapes = mostUsed(observed, entry => entry?.value, Infinity).filter(shape =>
    isShape(shape.value)
  );
  const square = shapes.find(shape => shape.value === '0px');
  const pill = shapes.find(shape => shape.value !== '0px');

  if (square) entries.push({ name: '--radius-none', value: '0px', note: evidenceOf(square) });

  mostUsed(observed, entry => entry?.value, names.length, isShape).forEach((radius, i) =>
    entries.push({ name: `--radius-${names[i]}`, value: radius.value, note: evidenceOf(radius) })
  );

  if (pill) entries.push({ name: '--radius-full', value: pill.value, note: evidenceOf(pill) });

  return entries;
}

function buildShadows(result: TailwindThemeInput): ThemeEntry[] {
  const values = new Set<string>();
  for (const entry of result.shadows ?? []) {
    const shadow = normalizeShadow(entry?.shadow);
    if (shadow) values.add(shadow);
  }

  const names = ['sm', 'md', 'lg', 'xl'];
  return [...values]
    .sort((a, b) => blurOf(a) - blurOf(b))
    .slice(0, names.length)
    .map((value, i) => ({ name: `--shadow-${names[i]}`, value }));
}

function buildBreakpoints(result: TailwindThemeInput): ThemeEntry[] {
  const values = new Set<number>();
  for (const entry of result.breakpoints ?? []) {
    // px is a number after normalizeExtraction() and a "576px" string before it.
    const px = parseFloat(String(typeof entry === 'object' ? entry?.px : entry));
    if (Number.isFinite(px) && px > 0) values.add(px);
  }

  const names = ['sm', 'md', 'lg', 'xl', '2xl'];
  return [...values]
    .sort((a, b) => a - b)
    .slice(0, names.length)
    .map((px, i) => ({ name: `--breakpoint-${names[i]}`, value: `${px}px` }));
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** An observed value carrying how often it was seen on the page. */
interface CountedValue {
  count?: number;
  confidence?: string;
}

/**
 * The evidence behind a value, rendered as its trailing comment.
 *
 * This export is a draft to check, not a source of truth: a token sitting on
 * one element and a token sitting on two hundred look identical once they are
 * both a hex in a CSS file. Carrying the count and confidence into the file is
 * what makes the manual pass cheap.
 */
function evidenceOf(entry: CountedValue): string {
  const parts = [
    Number(entry?.count) > 0 ? `${entry.count}x` : null,
    entry?.confidence ? `${entry.confidence} confidence` : null,
  ].filter((part): part is string => part !== null);

  return parts.length ? parts.join(', ') : 'observed';
}

/**
 * Share of the leading value's usage a value must reach to earn a token. A real
 * page emits sub-pixel artefacts (2.72px, 3.4px from a transform or a clamp())
 * a handful of times next to a base value it uses fifty times; those are
 * measurements, not scale steps.
 */
const MIN_USAGE_SHARE = 0.2;

/**
 * Pick the most-used values, then order them by size.
 *
 * Taking the N smallest instead would fill the scale with the artefacts above
 * and drop the values the page actually builds on. Usage decides membership;
 * size decides the naming. Counts default to 1, so a payload without them keeps
 * every value.
 */
function mostUsed<T extends CountedValue>(
  observed: T[],
  read: (entry: T) => string | number | null | undefined,
  limit: number,
  exclude: (value: string) => boolean = () => false
): { value: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const entry of observed) {
    const value = normalizeLength(read(entry));
    if (!value || parseFloat(value) <= 0 || exclude(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + (Number(entry?.count) || 1));
  }

  const leader = Math.max(0, ...counts.values());

  return [...counts.entries()]
    .filter(([, count]) => count >= leader * MIN_USAGE_SHARE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => byNumericValue(a.value, b.value));
}

/** Fallback families as a list, from either the joined string or an array. */
function fallbackList(fallbacks: string | string[] | undefined): string[] {
  if (!fallbacks) return [];
  const list = Array.isArray(fallbacks) ? fallbacks : fallbacks.split(',');
  return list.map(family => family.trim()).filter(Boolean);
}

/**
 * A box-shadow reduced to the layers that actually paint, or null when none do.
 *
 * A computed box-shadow carries one layer per shadow variable the framework
 * declares, and the unused ones come back fully transparent. Dropping them
 * removes no-op layers, not observed values: what is left renders identically
 * and is short enough to read.
 */
function normalizeShadow(raw: string | null | undefined): string | null {
  const shadow = String(raw ?? '').trim();
  if (!shadow || shadow === 'none') return null;

  const painted = splitLayers(shadow).filter(layer => !isTransparentLayer(layer));
  return painted.length ? painted.join(', ') : null;
}

/** Split a comma-separated CSS list, ignoring commas inside colour functions. */
function splitLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of value) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      layers.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) layers.push(current.trim());
  return layers;
}

/** True when a shadow layer's colour has zero alpha, in any colour notation. */
function isTransparentLayer(layer: string): boolean {
  if (/\btransparent\b/.test(layer)) return true;
  const color = /[a-z]+\([^)]*\)/i.exec(layer)?.[0];
  if (!color) return false;
  return /[,/]\s*0(\.0+)?\s*\)$/.test(color);
}

/** Any CSS colour to lowercase hex, or null when it carries no visible colour. */
function toHex(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || value === 'transparent' || value === 'none' || value === 'currentColor') return null;
  if (/^rgba?\([^)]*,\s*0(\.0+)?\s*\)$/i.test(value)) return null;

  const converted = convertColor(value);
  return converted ? converted.hex.toLowerCase() : null;
}

/** CSS identifier fragment: lowercase, alphanumerics and dashes, never leading-digit. */
function slug(value: string): string {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!cleaned) return 'token';
  return /^\d/.test(cleaned) ? `n${cleaned}` : cleaned;
}

/** Suffix a name until it is unused, so no declaration is silently shadowed. */
function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  let i = 2;
  while (used.has(candidate)) candidate = `${name}-${i++}`;
  used.add(candidate);
  return candidate;
}

/** Quote a family name unless it is a bare CSS identifier or generic keyword. */
function quoteFamily(family: string): string {
  const value = String(family).trim().replace(/^["']|["']$/g, '');
  return /^[a-zA-Z-]+$/.test(value) ? value : `"${value}"`;
}

/**
 * A length usable as a token value. Percentages are rejected: they resolve
 * against a context the token file does not have. The display forms the
 * extractor produces ("96px (6.00rem)") keep their first, authoritative unit.
 */
function normalizeLength(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^-?\d*\.?\d+$/.test(raw)) return `${trimNumber(parseFloat(raw))}px`;

  const match = /^(-?\d*\.?\d+)(px|rem|em)\b/.exec(raw);
  return match ? `${trimNumber(parseFloat(match[1]))}${match[2]}` : null;
}

function normalizeLineHeight(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw === 'normal') return null;
  if (/^\d*\.?\d+$/.test(raw)) return trimNumber(parseFloat(raw));
  return normalizeLength(raw);
}

function normalizeWeight(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'normal') return '400';
  if (raw === 'bold') return '700';
  return /^\d{3}$/.test(raw) ? raw : null;
}

function normalizeTracking(value: string | number | null | undefined): string | null {
  const length = normalizeLength(value);
  if (!length || parseFloat(length) === 0) return null;
  return length;
}

/**
 * Largest blur radius across a shadow's layers, used only to order them: a
 * multi-layer shadow reads as deep as its widest layer, not its first.
 */
function blurOf(shadow: string): number {
  const blurs = splitLayers(shadow).map(layer => {
    const lengths = layer.replace(/[a-z]+\([^)]*\)/gi, '').match(/-?\d*\.?\d+px/g) ?? [];
    return lengths.length >= 3 ? parseFloat(lengths[2]) : 0;
  });
  return blurs.length ? Math.max(...blurs) : 0;
}

function byNumericValue(a: string, b: string): number {
  return parseFloat(a) - parseFloat(b);
}

function trimNumber(n: number): string {
  return String(parseFloat(n.toFixed(4)));
}
