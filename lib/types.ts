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
  /** Declared as a :root custom property, i.e. carries author provenance */
  isToken?: boolean;
  /** 'surface' | 'neutral' | 'accent', derived from saturation and confidence */
  role?: string;
  /** Best-contrast foreground for this colour */
  onColor?: string;
  /** Derived interactive-state variant, always toward better contrast */
  hover?: string;
  /** Set to 'primary' when this is an alpha/lightness variant of the primary */
  variantOf?: string | null;
  /** Precomputed notations of `normalized`; see convertColor() */
  lch?: string;
  oklch?: string;
}

/**
 * A declared CSS custom property. `value` is the author's string verbatim, which
 * is the only surviving provenance of the authored notation; the rest are
 * computed from it so consumers never have to parse modern colour functions.
 */
export interface CssVariable {
  value: string;
  hex?: string;
  lch?: string;
  oklch?: string;
}

export interface Colors {
  palette: PaletteColor[];
  /** e.g. { primary: '#hex' } */
  semantic: Record<string, string>;
  /**
   * CSS custom properties. Older extractions carry a bare colour string; current
   * ones carry a CssVariable object, so consumers must handle both.
   */
  cssVariables: Record<string, string | CssVariable>;
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
  /** How many elements on the page render this exact style. */
  count?: number;
}

/** A variable-font axis (e.g. "wght") with the value range seen across the page. */
export interface VariableFontAxis {
  axis: string;
  min: number;
  max: number;
  count: number;
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
    /** Variable-font axes actually exercised via font-variation-settings. */
    variableAxes?: VariableFontAxis[];
    /** OpenType features actively enabled via font-feature-settings (e.g. ss01, calt). */
    openTypeFeatures?: string[];
    /** Resolved font asset/stylesheet URLs discovered during extraction. */
    urls?: string[];
    /** Families dropped by the usage floor, usually third-party embed faces. */
    filteredFamilies?: string[];
  };
}

export interface SpacingValue {
  /**
   * Numeric pixels for math and diffing. Raw extraction emits the "16px" string;
   * normalizeExtraction() coerces it to a number. Read `display` for rendering.
   */
  px: number | string;
  /** Guaranteed formatted value for display, e.g. "16px". Survives normalize. */
  display: string;
  rem?: string;
  count?: number;
  /** Numeric pixels as emitted by the extractor; mirror of px once normalized. */
  numericValue?: number;
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
  svgColors?: string[];
  safeZone?: { top: number; right: number; bottom: number; left: number };
  background?: string | null;
}

export interface Favicon {
  type: string;
  url: string;
  sizes: string | null;
}

/** PWA web app manifest fields consumed during extraction (theme/name seeding). */
export interface WebManifest {
  name?: string;
  shortName?: string;
  themeColor?: string;
  backgroundColor?: string;
}

/** A same-origin link found during crawl discovery, scored by DOM location. */
export interface DiscoveredLink {
  href: string;
  pathname: string;
  locationScore: number;
}

export interface MotionDuration {
  value: string;
  ms: number;
  count?: number;
}

export interface MotionEasing {
  value: string;
  count: number;
  type?: string;
}

export interface MotionAnimation {
  name?: string;
  value?: string;
  count?: number;
  contexts?: string[];
}

/** Per-semantic-context motion profile (nav, button, hero, ...). */
export interface MotionContext {
  count: number;
  durations: string[];
  easingType?: string;
  props: string[];
}

/** Observed style change between rest and an interactive state. */
export interface MotionDelta {
  tag: string;
  text: string;
  pattern: string;
  delta: unknown;
}

export interface Motion {
  durations: MotionDuration[];
  easings: MotionEasing[];
  animations: MotionAnimation[];
  contexts?: Record<string, MotionContext>;
  interactiveDeltas?: MotionDelta[];
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
  /**
   * Unique id of this snapshot, stamped at extraction time. The canonical key
   * for consumers: extractedAt and storage timestamps drift by seconds, so
   * anything pinning or deduping snapshots must use this, not a time.
   */
  snapshotId?: string;
  /**
   * HTTP status of the page.goto() navigation response. Null when Playwright
   * returns no response (e.g. same-document navigation). A bot wall or WAF
   * error page still yields a syntactically valid extraction, so this is
   * consumers' only signal to distinguish a genuine brand from an error page.
   */
  httpStatus?: number | null;
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
   * Viewport the extraction ran at. Layout-dependent tokens (typography,
   * spacing, visible components) vary by width, so comparing extracts taken at
   * different widths produces false drift; the drift engine warns on mismatch.
   */
  viewport?: { width: number; height: number };
  /**
   * False when web fonts had not finished loading when styles were read:
   * typography families may be OS fallbacks, and family drift against this
   * snapshot is suspect. Consumers must not have to infer this from generic
   * family names.
   */
  fontsReady?: boolean;
  /** Font families still pending when fontsReady is false. */
  pendingFonts?: string[];
  /**
   * Categories that extracted incompletely. Engine rule: do NOT flag drift from a
   * degraded category (it failed extraction, the brand did not change) — surface
   * it in the UI instead.
   */
  degraded?: string[];
  /**
   * Scoped failures of individual extractors. Each parallel extractor is fault
   * isolated: when one throws it records { stage, reason } here and falls back to
   * an empty value, so a single broken extractor never aborts the whole run.
   */
  errors?: ExtractorError[];
}

/** A single fault-isolated extractor failure. */
export interface ExtractorError {
  /** Extractor name, e.g. 'colors', 'typography'. */
  stage: string;
  /** Failure message (err.message, or the stringified throw value). */
  reason: string;
}

export interface BrandingResult {
  url: string;
  /** ISO 8601 timestamp */
  extractedAt: string;
  meta?: ExtractionMeta;
  siteName?: string | null;
  logo?: Logo | null;
  logoInstances?: Logo[];
  favicons?: Favicon[];
  manifest?: WebManifest;
  colors: Colors;
  typography: Typography;
  spacing: Spacing;
  borderRadius: BorderRadius;
  borders: Borders;
  shadows: Shadow[];
  gradients?: Gradient[];
  motion?: Motion;
  components: Components;
  breakpoints: Breakpoint[];
  iconSystem: IconSystem[];
  frameworks: Framework[];
  wcag?: WcagPair[];
  /** Null rather than partial when the page yields too little text to measure. */
  voice?: Voice | null;
  voiceSkipped?: VoiceSkipReason;
  pages?: { url: string; extractedAt?: string; rawColors?: PaletteColor[] }[];
  /**
   * CLI-emitted note about the extraction itself (e.g. canvas-only sites). This is
   * NOT a user annotation — a user note belongs in the storage envelope around the
   * payload, never on the pristine BrandingResult, or it mutates the payload.
   */
  note?: string;
  isCanvasOnly?: boolean;
  /** Internal/transient fields used during crawl + merge. Never persist; see stripTransient(). */
  _discoveredLinks?: DiscoveredLink[];
  _extractedUrls?: string[];
  _pageResults?: BrandingResult[];
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

/**
 * Role-labelled page copy plus deterministic metrics over it. Consumers read
 * `fragments` + `metrics`; the CLI itself does not interpret them.
 */

/** Where a piece of copy sits on the page. */
export type VoiceRole =
  | 'meta-title'
  | 'meta-description'
  | 'hero-h1'
  | 'hero-body'
  | 'cta'
  | 'nav-label'
  | 'section-h2'
  | 'section-body-lede'
  | 'value-prop'
  | 'claim'
  | 'social-proof'
  | 'differentiator'
  | 'form-label'
  | 'form-placeholder'
  | 'error-404-h1'
  | 'error-404-body'
  | 'footer-legal';

export interface VoiceFragment {
  role: VoiceRole;
  /** Normalized copy: trimmed, whitespace collapsed. Never truncated mid-word. */
  text: string;
  /** Document order within the role, 0-based. */
  order: number;
  /** Debug provenance for the source element. Only emitted with `debug`. */
  selectorHint?: string;
}

/** Coarse page classification. Sets the word budget and role weights only. */
export type VoicePageType = 'landing' | 'product' | 'docs' | 'contact' | 'news' | 'other';

/** Why voice extraction produced nothing. Emitted instead of a partial object. */
export type VoiceSkipReason = 'below-word-floor' | 'no-text' | 'probe-failed' | 'error';

export interface PronounRatios {
  /** "we", "our", "us" */
  first: number;
  /** "you", "your" */
  second: number;
  /** "they", "customers", "clients" */
  third: number;
}

/**
 * Derived from sentence and punctuation structure, not from word lists. Valid
 * for any language that separates words with whitespace.
 */
export interface VoiceStructuralMetrics {
  wordCount: number;
  sentenceCount: number;
  meanSentenceLength: number;
  /** Sample standard deviation of sentence length. */
  sentenceLengthStdev: number;
  exclamationRatio: number;
  questionRatio: number;
  /** Words over three syllables, over all words. Latin-script approximation. */
  longWordRatio: number;
  avgSyllablesPerWord: number;
  /** Too few words for stable sentence statistics; treat stdev as indicative. */
  lowSample: boolean;
}

/**
 * Language-dependent signals. Null in full outside supported languages: a zero
 * would read as a measured "no first-person voice" rather than "not measured".
 */
export interface VoiceLexicalMetrics {
  /** Pronoun stance. A closed word class, so this is counted, not guessed. */
  personPronounRatio: PronounRatios;
  /** Flesch reading ease, or null when the formula does not model `lang`. */
  readability: number | null;
}

export interface VoiceMetrics {
  structural: VoiceStructuralMetrics;
  /** Null when `lang` is outside the supported lexicons. */
  lexical: VoiceLexicalMetrics | null;
  /** BCP 47 tag from html[lang], falling back to detection. */
  lang: string;
}

export interface Voice {
  fragments: VoiceFragment[];
  metrics: VoiceMetrics;
  pageType: VoicePageType;
}

/** CLI / programmatic options accepted by extractBranding(). */
export interface ExtractOptions {
  slow?: boolean;
  darkMode?: boolean;
  mobile?: boolean;
  /** Reveal hidden content (open click-toggle menus/dropdowns, advance carousels)
   *  and re-scan for colors. Standard behaviour, on by default; set false to skip
   *  (used for deterministic QA baselines via the DEMBRANDT_DISABLE_REVEAL env var). */
  reveal?: boolean;
  stealth?: boolean;
  wcag?: boolean;
  /** Collect page copy + voice metrics. Opt-in: costs one extra navigation. */
  voice?: boolean;
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
  /** Internal: collect raw :root tokens + interactive-state styles to a sidecar. */
  teach?: boolean;
  /** Injected CLI version, surfaced as meta.dembrandtVersion. */
  _version?: string;
}
