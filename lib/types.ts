/**
 * Shared types for dembrandt extraction output and CLI options.
 * These were JSDoc @typedefs; promoted to real exported interfaces so the rest
 * of the (now TypeScript) codebase can import and use them.
 */

export type Confidence = 'high' | 'medium' | 'low';

export interface PaletteColor {
  /** Original color string */
  color: string;
  /** Hex color (#rrggbb) */
  normalized: string;
  /** Number of occurrences */
  count: number;
  /** Semantic relevance score */
  score?: number;
  /** CSS class/id sources */
  sources?: string[];
  confidence: Confidence;
}

export interface Colors {
  palette: PaletteColor[];
  /** e.g. { primary: '#hex' } */
  semantic: Record<string, string>;
  /** CSS custom properties */
  cssVariables: Record<string, string>;
  rawColors?: PaletteColor[];
}

export interface TypographyStyle {
  /** 'heading-1' | 'body' | 'button' | 'caption' | 'display' | 'link' */
  context: string;
  family: string;
  fallbacks?: string[];
  size: string;
  weight: string | number;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: string;
  isVariable?: boolean;
  isFluid?: boolean;
}

export interface Typography {
  styles: TypographyStyle[];
  sources: {
    googleFonts?: string[];
    adobeFonts?: string[] | boolean;
    variableFonts?: string[];
    customFonts?: string[];
    selfHostedFonts?: string[];
    fontDisplay?: string;
  };
}

export interface SpacingValue {
  px: number;
  rem?: string;
  count?: number;
}

export interface Spacing {
  /** 'base-4' | 'base-8' | 'fibonacci' | 'custom' */
  scaleType: string;
  commonValues: SpacingValue[];
}

export interface TokenValue {
  value: string;
  count: number;
  confidence: Confidence;
}

export interface BorderRadius {
  values: TokenValue[];
}

export interface BorderCombination {
  width: string;
  style: string;
  color: string;
  count?: number;
  confidence?: Confidence;
}

export interface Borders {
  widths?: TokenValue[];
  styles?: TokenValue[];
  colors?: TokenValue[];
  combinations?: BorderCombination[];
}

export interface Shadow {
  shadow: string;
  count: number;
  confidence: Confidence;
}

export interface Gradient {
  gradient: string;
  type:
    | 'linear'
    | 'radial'
    | 'conic'
    | 'linear-repeating'
    | 'radial-repeating'
    | 'conic-repeating';
  stopColors: string[];
  count: number;
}

/** Computed CSS for one interaction state (rest/hover/active/focus). */
export interface CssState {
  backgroundColor?: string;
  color?: string;
  borderRadius?: string;
  padding?: string;
  border?: string;
  boxShadow?: string;
  textDecoration?: string;
  [key: string]: string | undefined;
}

export interface ButtonStyle {
  states: { default: CssState; hover?: CssState; active?: CssState; focus?: CssState; [key: string]: CssState | undefined };
  text?: string;
  fontWeight?: string;
  fontSize?: string;
  classes?: string;
}

export interface LinkStyle {
  states: { default: CssState; hover?: CssState };
  fontWeight?: string;
}

export interface InputStyle {
  type?: string;
  border?: string;
  borderRadius?: string;
  padding?: string;
  states?: { default?: CssState; focus?: CssState };
}

export interface BadgeStyle {
  backgroundColor?: string;
  color?: string;
  borderRadius?: string;
  padding?: string;
  fontSize?: string;
  isRounded?: boolean;
  styleType?: string;
}

export interface Components {
  buttons: ButtonStyle[];
  inputs: { text?: InputStyle[] } | InputStyle[];
  links: LinkStyle[];
  badges: { all?: BadgeStyle[]; byVariant?: Record<string, BadgeStyle[]> } | BadgeStyle[];
}

export interface Breakpoint {
  px: number | string;
}

export interface IconSystem {
  name: string;
  type: string;
  sizes?: string[];
}

export interface Framework {
  name: string;
  confidence: Confidence;
  evidence?: string;
}

export interface Logo {
  source: 'img' | 'svg';
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  inline?: boolean;
  color?: string | null;
  ariaLabel?: string | null;
  markup?: string | null;
  dataUri?: string | null;
  safeZone?: { top: number; right: number; bottom: number; left: number };
  background?: string | null;
}

export interface Favicon {
  type: string;
  url: string;
  sizes: string | null;
}

export interface WcagPair {
  fg: string;
  bg: string;
  ratio: number;
  aa: boolean;
  aaLarge: boolean;
  aaa: boolean;
  count?: number;
  state?: string;
  tag?: string;
  source?: string;
}

/** Metadata block on the native extraction output. */
export interface ExtractionMeta {
  /** Provenance: the CLI release that produced this. Doubles as source.cliVersion. */
  dembrandtVersion?: string | null;
  /**
   * Output contract version. Required: the current producer always stamps it.
   * Consumers key migrations off this (absent in a persisted blob = pre-1.0) and
   * must NOT shape-sniff. Bumps on breaking shape changes.
   */
  schemaVersion: string;
  flags?: Record<string, unknown>;
  /**
   * Categories that extracted incompletely. Engine rule: do NOT flag drift from a
   * degraded category (it failed extraction, the brand did not change) — surface
   * it in the UI instead.
   */
  degraded?: string[];
}

export interface BrandingResult {
  url: string;
  /** ISO 8601 timestamp */
  extractedAt: string;
  meta?: ExtractionMeta;
  siteName?: string | null;
  logo?: Logo | null;
  logoInstances?: any[];
  favicons?: Favicon[];
  manifest?: any;
  colors: Colors;
  typography: Typography;
  spacing: Spacing;
  borderRadius: BorderRadius;
  borders: Borders;
  shadows: Shadow[];
  gradients?: Gradient[];
  motion?: any;
  components: Components;
  breakpoints: Breakpoint[];
  iconSystem: IconSystem[];
  frameworks: Framework[];
  wcag?: WcagPair[];
  pages?: { url: string }[];
  /**
   * CLI-emitted note about the extraction itself (e.g. canvas-only sites). This is
   * NOT a user annotation — a user note belongs in the storage envelope around the
   * payload, never on the pristine BrandingResult, or it mutates the payload.
   */
  note?: string;
  isCanvasOnly?: boolean;
  /** Internal/transient fields used during crawl + merge. Never persist; see stripTransient(). */
  _discoveredLinks?: any[];
  _extractedUrls?: any[];
  _pageResults?: any[];
}

/**
 * Storage envelope around a pristine BrandingResult payload. Identity, time, and
 * user-facing annotations live HERE, never on the payload — putting them on the
 * payload would mutate the immutable extraction and break drift comparison.
 *
 * This type is reserved for the storage/UI layer (dembrandt-next, drift). The CLI
 * does not produce it; it is defined in core so every consumer agrees on one
 * envelope shape instead of forking it. Build the notes/labels feature against
 * `note`/`label` here — not against BrandingResult.note (which is CLI metadata).
 */
export interface Snapshot {
  id: string;
  /** Which tracked surface (page/route/brand) this capture belongs to. */
  surfaceId: string;
  /** Owns identity + time, separate from payload.extractedAt. */
  capturedAt: string;
  /** The untouched extraction. */
  payload: BrandingResult;
  /** Optional human label for the capture. */
  label?: string;
  /** The customer's own note about this capture. NOT payload.note. */
  note?: string;
}

/**
 * Minimal spinner contract extractBranding() needs. A real ora `Ora` satisfies
 * it structurally, as does the MCP null-spinner stub — so we don't pull ora's
 * full type just to accept a progress reporter.
 */
export interface Spinner {
  text?: string;
  start(text?: string): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  warn(text?: string): Spinner;
  info(text?: string): Spinner;
}

/** CLI / programmatic options accepted by extractBranding(). */
export interface ExtractOptions {
  slow?: boolean;
  darkMode?: boolean;
  mobile?: boolean;
  stealth?: boolean;
  wcag?: boolean;
  keepAnimations?: boolean;
  verbose?: boolean;
  navigationTimeout?: number;
  screenshotPath?: string;
  discoverLinks?: number | null;
  includeRawColors?: boolean;
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
  acceptLanguage?: string;
  screenSize?: string;
  cookie?: string;
  header?: string;
  /** Injected CLI version, surfaced as meta.dembrandtVersion. */
  _version?: string;
}
