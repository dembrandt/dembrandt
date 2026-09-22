/**
 * Single source of truth for dembrandt output versioning.
 *
 * Three independent version axes travel with every extraction. Keeping them
 * separate is the whole point: a consumer (dembrandt-next, the MCP client, a
 * skill, the drift engine) must be able to reason about the *output format*
 * without coupling to which CLI release produced it.
 *
 *  - toolVersion   — the dembrandt CLI release (package.json version, e.g.
 *                    "0.16.0"). Surfaced as meta.dembrandtVersion. Changes on
 *                    every npm publish, including pure refactors.
 *  - schemaVersion — the dembrandt OUTPUT CONTRACT. Bumps only when the JSON
 *                    shape changes in a way a consumer must adapt to. A tool
 *                    release that does not change the shape leaves this alone.
 *  - specVersion   — the W3C DTCG spec revision the `--dtcg` export targets.
 *
 * Version info is surfaced through the two extraction chokepoints, so every
 * consumer inherits it without special-casing:
 *  - native JSON  : meta.schemaVersion (alongside meta.dembrandtVersion),
 *                   produced by extractBranding().
 *  - DTCG export  : $extensions["com.dembrandt"], produced by toDtcgTokens().
 *                   The DTCG spec mandates that tools preserve vendor extension
 *                   data they do not understand, so this block survives a
 *                   round-trip through any compliant tool.
 *
 * schemaVersion bump policy (semver over the output contract, not the tool):
 *  - PATCH : additive, non-semantic (a new optional field a consumer can ignore)
 *  - MINOR : additive but meaningful (a new field consumers will want to read)
 *  - MAJOR : removal, rename, or changed meaning of an existing field
 * Pre-1.0 the tool used loose semver; the output contract starts clean at 1.0.0,
 * baselined on the 0.16.0 shape (inline SVG logo fields, meta.degraded).
 */

// URL is a global in both the Node and DOM libs; no import needed.

/**
 * dembrandt output contract version. Bump per the policy documented above.
 *
 *  1.16.0 — meta.crawl gains `pages`: the landed URL of every page merged into
 *          the result, in merge order. A count cannot be checked, reproduced or
 *          re-read, and a merged palette is not interpretable without knowing
 *          which pages produced it.
 *
 *          Behaviour, not contract, in the same release: colors.palette no
 *          longer reads `color` off an element that paints no text of its own,
 *          nor `border-color` off one that draws no border. Both resolve to
 *          currentColor when unset, so every wrapper reported the inherited
 *          value: on an unstyled anchor, the browser's default link blue.
 *          rgb(0,0,238) was the most frequent semantic.primary across a 174-site
 *          corpus. Palettes shrink on most sites and primary moves on some; two
 *          large consumer brands move onto the colour they actually use.
 *
 *  (unversioned) — `voice` / `voiceSkipped` ship behind a hidden, opt-in flag
 *          and deliberately do not bump the contract. Bump when the flag is
 *          documented, not before.
 *  1.16.0 — the neutral-primary rescue starts firing on dark brand-coloured
 *          picks, so a site that changed nothing can report a different primary.
 *
 *          The rescue is gated on how colourful the current pick is, and that
 *          measure was HSL saturation, which is meaningless near black: a
 *          near-black navy reads 0.76 and cleared the 0.20 bar, so the gate
 *          built for exactly this mis-pick never fired. Chroma is now attenuated
 *          by distance from black and white, unchanged at mid lightness, and the
 *          bar moves to 0.30 on the new scale for both the gate and the
 *          replacement. Primary moves on sites whose previous pick was a dark
 *          ink or surface colour with a declared brand token or recurring CTA
 *          behind it.
 *
 *          No field is added or removed. Values move for an unchanged site.
 *  1.15.0 — two scoring checks that were dead in the field start firing, so a
 *          site that changed nothing reports differently than it did on 1.14.0.
 *
 *          findings off-scale spacing ran only when spacing.scaleType read
 *          "base-8"/"base-4", while 1.14.0 changed the extractor to emit
 *          "8px"/"4px". On a live extraction the base was always 0, the check
 *          never ran, and every site reported zero off-grid values. Sites with
 *          off-grid spacing now carry the finding and a lower consistency score.
 *
 *          drift compareColors counted every baseline palette entry toward the
 *          denominator, unchanged ones included, so one changed brand colour in
 *          a real palette scored stable and exited 0. Only changed, added and
 *          removed entries carry weight now, matching compareSemantic. Drift
 *          scores rise across the board and gates that passed may fail.
 *  1.14.0 — three extraction-accuracy changes that move values for an unchanged
 *          site. They ship together so a consumer re-approves one baseline, not
 *          three.
 *
 *          spacing.scaleType is decided by how much of the observed spacing sits
 *          on the grid, weighted by occurrence, instead of whether any single
 *          value divides by 8 or 4. The old test passed on one stray multiple,
 *          so most sites reported "8px" regardless of their rhythm; a site now
 *          reads "custom" unless 60% of declarations land on the step. Two large
 *          public sites with 20% and 3% on the 8 grid both move to "custom".
 *          spacing.commonValues[].rem is computed against the document's root
 *          font size rather than a hardcoded 16, so rem moves on any site that
 *          sets html { font-size }.
 *
 *          colors.palette drops colour samples: a run of four or more equal-size
 *          siblings whose fills are all opaque and all distinct, an element whose
 *          entire text is its own colour value, and anything inside code/pre/
 *          samp/kbd. Any page documenting a palette previously scored its own
 *          swatches as brand colour. A row of cards shares one fill and is
 *          untouched.
 *
 *          colors.semantic.primary: the neutral-primary rescue now considers any
 *          primary below 0.20 chroma, not 0.12. The bar a replacement must clear
 *          is unchanged at 0.25, so a deliberately neutral identity is protected
 *          exactly as before. Primary moves on sites whose previous pick was a
 *          desaturated grey. Measured over the 29 corpus sites that can change at
 *          all: two improved, none regressed, a delta inside the corpus labelling
 *          error, so both were inspected individually.
 *
 *          No field is added or removed. Values move for an unchanged site.
 *  1.13.0 — wcag pairs gain fontSize, fontWeight, large, requiredAA, passAA and
 *          passAAA: the observed text size decides which 1.4.3 / 1.4.6
 *          threshold governs a pair, so passAA is a verdict where aa was only
 *          a fixed 4.5:1 test. BEHAVIOR: pairs are now keyed by size class, so
 *          one colour pair can appear twice (body and large), and text that
 *          1.4.3 exempts (logotypes, disabled controls, aria-hidden) plus
 *          wrappers whose text is rendered by a child are no longer reported.
 *          Hover/focus pairs carry the same fields. aa/aaLarge/aaa are still
 *          written but deprecated: they test fixed ratios and ignore text size,
 *          and they are removed in 2.0.0. Every surface grades through
 *          gradeWcagPair()/passesAA(); read passAA, not aa.
 *          Values move for an unchanged site.
 *          Also in 1.13.0: logo.dataUri is emitted for img and css-background
 *          logos, not only inline SVG, and favicons gain dataUri. Bytes are
 *          fetched at extraction time (in the page, then from node), capped at
 *          100KB for a logo and 25KB for a favicon, and the field stays absent
 *          when the fetch fails. Exports stop hotlinking the audited site: a
 *          saved report or PDF no longer breaks offline, rots when the asset
 *          URL changes, or re-requests the site's server when opened. MCP
 *          responses replace the bytes with a marker: an agent cannot use
 *          them and they would cost it hundreds of kilobytes of context.
 *          Drift gains a `logo` category (weight 0.8): the mark is compared at
 *          the strongest identity both snapshots carry (inline markup, then
 *          inlined bytes, then a url normalised of w/q/dpl/dpr/s), so an image
 *          optimizer's rewritten url, and a pre-1.13.0 baseline that has no
 *          bytes, are not reported as a changed logo.
 *
 *  1.12.0 — colors.detected entries gain areaFrac: the colour's share of painted
 *          background area, alongside the existing element-count usageFrac, so
 *          a hero fill is not outranked by sixty icons. BEHAVIOR, and it is a
 *          shape change in the DTCG export: a shadow token's $value is an array
 *          of layers when the shadow has more than one, where every earlier
 *          release emitted a single object built by splitting the string on
 *          whitespace — which read a computed shadow's leading colour as its
 *          offsetX and folded multi-layer shadows into one. A consumer reading
 *          $value.offsetX must branch on Array.isArray. Tailwind's shadow
 *          ladder is also reordered by depth (blur + |offsetY| + spread)
 *          instead of blur alone, so --shadow-sm/md/lg/xl can move for an
 *          unchanged site. typography styles: isFluid is now read from the
 *          authored declaration rather than the computed px, so clamp() and
 *          calc(vw) ramps are detected at all.
 *          Shipping alongside in the same release, and moving values for an
 *          unchanged site: borderRadius pill values normalise from the computed
 *          maximum length (serialised `3.35544e+07px`) to `9999px`, and two raw
 *          spellings of one pill merge into a single entry with the counts
 *          added; typography reports the family that actually rendered the text
 *          rather than the first name in the stack, so a numerals-only face
 *          moves from `family` to `fallbacks`; `code`/`pre`/`kbd`/`samp` are
 *          extracted under a new `mono` context, which is a new value of an
 *          existing string field, not a new field; colors.semantic.primary no
 *          longer accepts a class where a rendering role qualifies "primary"
 *          (foreground-primary, text-primary, border-primary). colors._raw, an
 *          internal scratch set that had shipped in every extraction since at
 *          least 0.17.0, is removed from the output and dropped at ingest.
 *          DRIFT: none of these reach the drift engine — radius pills are
 *          filtered by the ≤500px realism guard on both sides, typography is
 *          compared on family/size/weight only, and the removed field was never
 *          compared. No baseline needs re-approval.
 *  1.11.0 — meta gains robotsWarnings: human-readable notes on pages robots.txt
 *          disallowed, whether that was the entry URL or a page discovered
 *          during --crawl/--sitemap/MCP pages. The check stays advisory (it
 *          never blocks extraction), so this is the only record of what it
 *          flagged. Additive: 1.10.x consumers ignore it. DRIFT: not read by
 *          the drift engine.
 *  1.10.0 — colors.palette entries gain contrastAgainst: [{bg, ratio, aa}],
 *          the WCAG pairs (from `wcag`, --wcag only) this candidate was
 *          actually observed against on the page, sorted by ratio descending
 *          and deduped by the other colour. Behind --wcag, same as `wcag`
 *          itself: absent entirely when the flag is off. Additive: 1.9.x
 *          consumers ignore it. BEHAVIOR: `wcag` pairs and colors.palette's
 *          new contrastAgainst now reflect the effective, alpha-composited
 *          color a viewer actually sees rather than the raw declared value —
 *          a translucent background or text color was previously read as
 *          opaque. DRIFT: neither is read by the drift engine; candidate
 *          colour values and ordering are unchanged.
 *  1.9.0 — meta gains requestedUrl (the URL as passed on the command line,
 *          before redirect resolution), contentLength (extracted page text
 *          length, for spotting thin/bot-wall pages) and timeouts (present
 *          only when at least one occurred, naming which wait timed out).
 *          meta.crawl (technique, pagesRequested, pagesFound) is new when
 *          --crawl, --sitemap or explicit paths are used. Additive: 1.8.x
 *          consumers ignore all of it. DRIFT: none of these are read by the
 *          drift engine, and no existing value's meaning changed —
 *          dembrandt.com and stripe.com reference extractions scored 0
 *          churn against the previous release.
 *  1.8.0 — no shape change. BEHAVIOR: the drift engine compares colors.semantic
 *          role by role. It previously read that map only to attach role labels
 *          to palette entries, so a changed brand primary produced no drift at
 *          all (DEM-208). DriftReport.changes can now carry entries labelled
 *          `semantic.<role>`, and colour scores rise wherever a role moved.
 *          A baseline whose primary differs from the candidate's starts
 *          reporting that difference on upgrade, which is the point.
 *  1.7.0 — typography.styles entries gain count (elements rendering that exact
 *          style) and typography.sources gains filteredFamilies. Additive: 1.6.x
 *          consumers ignore both. BEHAVIOR, and it moves existing values:
 *          a palette colour seen once can no longer be "high" confidence and a
 *          colour seen once at all caps at "low"; non-heading text above the
 *          reading range (>24px) is labelled "text" instead of "body", so the
 *          body token stops inheriting hero copy; and a family covering under
 *          2% of counted text (minimum 3 elements) is dropped from styles and
 *          listed in filteredFamilies instead. Baselines from 1.6.x will show
 *          typography and colour drift once on upgrade.
 *  1.6.0 — typography.sources gains urls: the resolved http(s) font asset and
 *          webfont-provider stylesheet URLs seen during extraction, sorted and
 *          deduped. Lets a consumer re-fetch, cache or verify the actual font
 *          files instead of guessing from family names. Additive: 1.5.x
 *          consumers ignore it. Not read by the drift engine, so it introduces
 *          no baseline churn — which matters, because cache-busting query
 *          strings make these URLs change on every deploy of a site.
 *  1.5.0 — meta gains httpStatus (the page.goto() navigation response status;
 *          null when Playwright returns no response). Lets consumers reject
 *          extractions that came from a bot-wall/WAF error page instead of
 *          persisting a styled 403/404 as if it were the real brand.
 *          Additive: 1.4.x consumers ignore it.
 *  1.4.0 — colors.cssVariables entries gain `hex` (parseable identity beside
 *          the authored token value, which may be a modern colour function).
 *          Additive: 1.3.x consumers ignore it. BEHAVIOR: modern CSS colour
 *          functions (oklab/oklch/lab/lch/color/hwb) now normalise instead of
 *          leaking raw strings or being dropped; palette/semantic originals
 *          serialise as legacy rgb()/rgba() with alpha preserved; emitted
 *          lch() strings are D50 per the CSS spec (previously D65 — every lch
 *          value changes; hex/rgb/oklch are unaffected). Shipped in CLI 0.26.0
 *          which erroneously still declared 1.3.0.
 *  1.3.0 — meta gains snapshotId (canonical snapshot key: pin/dedupe on this,
 *          not on extractedAt or storage timestamps), viewport (extraction
 *          width/height; mismatched widths produce false layout drift),
 *          fontsReady and pendingFonts (false = typography families may be OS
 *          fallbacks). DriftReport gains warnings[] (comparison-validity
 *          caveats) and inconclusive. Additive: 1.2.x consumers ignore the new
 *          keys. BEHAVIOR: drift scores recalibrated — categories empty on
 *          both sides no longer dilute the average, and typography severities
 *          changed; an approved baseline may need re-approval after upgrade.
 *  1.2.0 — added colors.semantic.background, colors.semantic.text and
 *          colors.semantic.accent (canonical page surface, body text, and a
 *          hue-distinct brand accent). Typography gains a "text" context value
 *          for body-eligible text whose family is not the dominant body font.
 *          Additive: 1.1.x consumers ignore the new keys and treat "text" as
 *          body-like.
 *  1.1.0 — added SpacingValue.display, a guaranteed "Npx" string for rendering.
 *          Additive: 1.0.x consumers ignore it. Read `display` instead of
 *          formatting `px`, whose type narrows from "16px" to a number through
 *          normalizeExtraction().
 *  1.0.0 — baselined on the 0.16.0 shape.
 */
export const SCHEMA_VERSION = '1.16.0';

/** W3C DTCG spec revision the `--dtcg` export targets. */
export const DTCG_SPEC_VERSION = '2025.10';

/**
 * Reverse-domain key under which all dembrandt-specific data lives in DTCG
 * output. The DTCG spec recommends reverse-domain notation for $extensions keys
 * to avoid vendor clashes, and requires other tools to preserve unknown
 * extension data. This is the only sanctioned channel for proprietary data;
 * never invent custom `$`-prefixed keys or custom `$type` values.
 */
export const EXTENSION_KEY = 'com.dembrandt';

/** Document-level provenance block embedded in DTCG `$extensions`. */
export interface DembrandtProvenance {
  /** Output contract version (SCHEMA_VERSION). */
  schemaVersion: string;
  /** dembrandt CLI release that produced this, or null if unknown. */
  toolVersion: string | null;
  /** DTCG spec revision the export targets. */
  specVersion: string;
  /** Constant tool identifier. */
  generator: 'dembrandt';
  /** Extraction source. */
  source: { url: string | null; domain: string };
  /** ISO timestamp of the extraction, or null. */
  extractedAt: string | null;
}

/** The slice of an extraction result this module needs to assemble provenance. */
export interface ExtractionLike {
  url?: string;
  extractedAt?: string;
  meta?: { dembrandtVersion?: string | null; schemaVersion?: string | null };
}

/**
 * Derive a clean domain from an extraction URL. Returns 'unknown' on failure so
 * the contract never throws while assembling metadata.
 */
function domainOf(url: string | undefined | null): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Build the canonical `com.dembrandt` provenance block for DTCG `$extensions`.
 * Reads the tool version off the already-assembled native result so there is one
 * place (extractBranding's meta) that owns toolVersion.
 */
export function buildDembrandtProvenance(result: ExtractionLike = {}): DembrandtProvenance {
  return {
    schemaVersion: SCHEMA_VERSION,
    toolVersion: result?.meta?.dembrandtVersion ?? null,
    specVersion: DTCG_SPEC_VERSION,
    generator: 'dembrandt',
    source: {
      url: result?.url ?? null,
      domain: domainOf(result?.url),
    },
    extractedAt: result?.extractedAt ?? null,
  };
}

/**
 * Verdict of comparing an extraction's output-contract version against the
 * contract this build understands.
 *
 *  - 'current'    : found === SCHEMA_VERSION exactly.
 *  - 'compatible' : same major, different minor/patch. Safe to consume: within a
 *                   major the contract only changes additively, so a newer
 *                   producer just carries extra fields a consumer can ignore,
 *                   and an older producer is missing fields a consumer tolerates.
 *  - 'outdated'   : found major < expected major. A breaking contract change
 *                   landed since; re-extraction recommended.
 *  - 'ahead'      : found major > expected major. The producer is newer than
 *                   this build; upgrade the consumer to read it reliably.
 *  - 'legacy'     : no schemaVersion present but a toolVersion is. A pre-1.0
 *                   extraction made before the contract existed.
 *  - 'unknown'    : no version metadata at all.
 *
 * `compatible` is true only for 'current' and 'compatible'; every other status
 * carries a non-null `message`. This is the single sanctioned compatibility
 * check: consumers (the viewer, dembrandt-next, the drift engine) must compare
 * the OUTPUT CONTRACT here, never the CLI release (`toolVersion`), which churns
 * on every publish and produces false "version mismatch" warnings.
 */
export type SchemaCompatibilityStatus =
  | 'current'
  | 'compatible'
  | 'outdated'
  | 'ahead'
  | 'legacy'
  | 'unknown';

export interface SchemaCompatibility {
  status: SchemaCompatibilityStatus;
  /** True when the extraction can be consumed without caveats. */
  compatible: boolean;
  /** schemaVersion read off the extraction, or null when absent. */
  found: string | null;
  /** The contract version this build understands (SCHEMA_VERSION). */
  expected: string;
  /** CLI release that produced the extraction, for diagnostics only. */
  toolVersion: string | null;
  /** Human-readable caveat, or null when status is 'current' / 'compatible'. */
  message: string | null;
}

/** Parse a semver-ish string into its numeric parts, or null if unparseable. */
function parseSemver(v: string | null | undefined): { major: number; minor: number; patch: number } | null {
  if (!v) return null;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * Compare an extraction's output-contract version against this build's
 * SCHEMA_VERSION. Never throws: malformed or missing version data degrades to
 * 'unknown' / 'legacy'. See SchemaCompatibility for the status semantics.
 */
export function checkSchemaCompatibility(result: ExtractionLike = {}): SchemaCompatibility {
  const found = result?.meta?.schemaVersion ?? null;
  const toolVersion = result?.meta?.dembrandtVersion ?? null;
  const base = { found, expected: SCHEMA_VERSION, toolVersion };

  const foundParts = parseSemver(found);
  if (!foundParts) {
    if (toolVersion) {
      return {
        ...base,
        status: 'legacy',
        compatible: false,
        message:
          `Extraction predates the schema contract (produced by dembrandt v${toolVersion}, ` +
          `no schemaVersion). Re-extract with the current release to validate against ` +
          `schema ${SCHEMA_VERSION}. Reading best-effort.`,
      };
    }
    return {
      ...base,
      status: 'unknown',
      compatible: false,
      message:
        'No version metadata on this extraction. Cannot verify schema compatibility; reading best-effort.',
    };
  }

  const expectedParts = parseSemver(SCHEMA_VERSION)!;

  if (foundParts.major === expectedParts.major) {
    const status: SchemaCompatibilityStatus =
      found === SCHEMA_VERSION ? 'current' : 'compatible';
    return { ...base, status, compatible: true, message: null };
  }

  if (foundParts.major < expectedParts.major) {
    return {
      ...base,
      status: 'outdated',
      compatible: false,
      message:
        `Extraction uses schema ${found}, this build expects ${SCHEMA_VERSION} ` +
        `(breaking change between majors). Re-extract recommended.`,
    };
  }

  return {
    ...base,
    status: 'ahead',
    compatible: false,
    message:
      `Extraction uses schema ${found}, newer than this build's ${SCHEMA_VERSION} ` +
      `(breaking change between majors). Upgrade dembrandt to read it reliably.`,
  };
}

/**
 * One-line notice for surfacing a compatibility verdict in a UI or log. Returns
 * null when there is nothing to warn about, so callers can render unconditionally:
 * `const notice = formatCompatibilityNotice(checkSchemaCompatibility(result));`
 */
export function formatCompatibilityNotice(compat: SchemaCompatibility): string | null {
  return compat.compatible ? null : compat.message;
}
