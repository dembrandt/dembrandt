/**
 * Drift engine — the product core.
 *
 * Compares two Dembrandt native extracts (a baseline and a candidate) and
 * returns a drift report: a 0-100 score (0 = identical), a pass/fail verdict,
 * and a list of what changed. Pure functions, no dependencies, no infra.
 *
 * Baseline-agnostic by design: it does not know or care whether the baseline is
 * a rolling `main` snapshot or a pinned `ds-vN` release. The caller decides what
 * to compare against. Two-baseline workflows just call this twice.
 */

import type { BrandingResult as ExtractionResult, TypographyStyle, Confidence } from "./types.js";

export interface DriftConfig {
  /** ΔE at or below this: colors treated as identical. */
  colorSame: number;
  /** ΔE at or below this (and above colorSame): a color "shifted". Beyond: removed/added. */
  colorShift: number;
  /** Percent change at or below this: a dimension is unchanged. */
  dimPct: number;
  /** Percent change at or below this (and above dimPct): "shifted". Beyond: removed/added. */
  dimShiftPct: number;
  /** Relative weight of each category in the overall score. */
  weights: { color: number; typography: number; spacing: number; radius: number; shadow: number };
  /** score > failThreshold => fail. */
  failThreshold: number;
}

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  colorSame: 2.3, // ~ just-noticeable difference
  colorShift: 15,
  dimPct: 4,
  dimShiftPct: 25,
  weights: { color: 1, typography: 1, spacing: 0.8, radius: 0.6, shadow: 0.6 },
  failThreshold: 10,
};

export type DriftKind = "changed" | "added" | "removed";
export type DriftCategory = "color" | "typography" | "spacing" | "radius" | "shadow";

export interface DriftChange {
  category: DriftCategory;
  kind: DriftKind;
  label: string;
  before?: string;
  after?: string;
  /** ΔE for colors, percent change for dimensions. */
  delta?: number;
}

export interface CategoryResult {
  category: DriftCategory;
  score: number; // 0..1
  changed: number;
  added: number;
  removed: number;
}

export interface DriftReport {
  score: number; // 0..100, 0 = identical
  status: "stable" | "drift";
  threshold: number;
  summary: { changed: number; added: number; removed: number };
  categories: CategoryResult[];
  changes: DriftChange[];
  /** Comparison-validity caveats (e.g. baseline and candidate extracted at
   *  different viewport widths). The score stands, but changes may be
   *  environment-induced rather than design drift. */
  warnings?: string[];
}

/* ----------------------------- color math ----------------------------- */

function parseColor(input: string): [number, number, number] | null {
  const s = input.trim();
  let h = s.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (/^[0-9a-fA-F]{8}$/.test(h)) h = h.slice(0, 6);
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: string, b: string): number {
  const ra = parseColor(a);
  const rb = parseColor(b);
  if (!ra || !rb) return a.trim() === b.trim() ? 0 : Infinity;
  const [l1, a1, b1] = rgbToLab(ra);
  const [l2, a2, b2] = rgbToLab(rb);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/* ------------------------------ helpers ------------------------------- */

const round = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function pctChange(a: number, b: number): number {
  if (a === 0) return b === 0 ? 0 : 100;
  return Math.abs(a - b) / Math.abs(a) * 100;
}

/** Score a set of changes into 0..1 against the baseline size. */
function categoryScore(penalty: number, baseCount: number, candCount: number): number {
  if (baseCount === 0) return candCount > 0 ? 1 : 0;
  return clamp01(penalty / baseCount);
}

/* ---------------------------- comparisons ----------------------------- */

/** A palette color with the signals that weight its drift: how heavily it is
 * used (count) and whether it plays a brand role (derived from the semantic map). */
interface ColorEntry {
  hex: string;
  count: number;
  role?: string;
}

// Brand-critical roles dominate the score; structural greys barely move it.
const ROLE_WEIGHT: Record<string, number> = {
  accent: 3, primary: 3, brand: 3, cta: 2, secondary: 1.5, surface: 0.3, background: 0.3,
};

function colorWeight(e: ColorEntry): number {
  const roleW = ROLE_WEIGHT[(e.role ?? "").toLowerCase()] ?? 1;
  // Square-root dampening so a color used 1000x does not completely drown the rest.
  return roleW * Math.sqrt(Math.max(1, e.count));
}

function compareColors(base: ColorEntry[], cand: ColorEntry[], cfg: DriftConfig): { changes: DriftChange[]; result: CategoryResult } {
  const changes: DriftChange[] = [];
  const used = new Set<number>();
  let penalty = 0;
  let totalWeight = 0;
  let changed = 0;
  let removed = 0;

  for (const bc of base) {
    const w = colorWeight(bc);
    totalWeight += w;
    let bestIdx = -1;
    let best = Infinity;
    cand.forEach((cc, i) => {
      if (used.has(i)) return;
      const d = deltaE(bc.hex, cc.hex);
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    });

    if (bestIdx !== -1 && best <= cfg.colorSame) {
      used.add(bestIdx);
    } else if (bestIdx !== -1 && best <= cfg.colorShift) {
      used.add(bestIdx);
      changes.push({ category: "color", kind: "changed", label: bc.hex, before: bc.hex, after: cand[bestIdx].hex, delta: round(best) });
      penalty += clamp01(best / cfg.colorShift) * w;
      changed++;
    } else {
      changes.push({ category: "color", kind: "removed", label: bc.hex, before: bc.hex });
      penalty += w;
      removed++;
    }
  }

  let added = 0;
  cand.forEach((cc, i) => {
    if (used.has(i)) return;
    changes.push({ category: "color", kind: "added", label: cc.hex, after: cc.hex });
    penalty += 0.5 * colorWeight(cc);
    added++;
  });

  // Weighted: a primary/accent shift dominates a background-tint shift instead
  // of counting the same. Score stays 0..1 (penalty divided by total weight).
  const score = totalWeight > 0 ? clamp01(penalty / totalWeight) : (cand.length > 0 ? 1 : 0);
  return { changes, result: { category: "color", score, changed, added, removed } };
}

function normFamily(f: string | undefined): string {
  return (f ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function fieldDiffs(b: TypographyStyle, c: TypographyStyle, cfg: DriftConfig): number {
  let d = 0;
  if (normFamily(b.family) !== normFamily(c.family)) d++;
  if (pctChange(parseFloat(b.size), parseFloat(c.size)) > cfg.dimPct) d++;
  if (String(b.weight) !== String(c.weight)) d++;
  return d;
}

// Typography severities, tuned so no single style change can max the category
// on its own. Removals are the noisiest signal live-DOM extraction produces (a
// style missing from one crawl is usually crawl variance, not a design change),
// so a removal scores below a confirmed in-place family change.
const TYPO_FAMILY_PENALTY = 0.8;
const TYPO_REMOVED_PENALTY = 0.6;
const TYPO_ADDED_PENALTY = 0.5;
// The peak floor keeps one large regression visible among many unchanged
// styles, but damped: severity 1.0 floors the category at 50%, not 100%, so a
// single style change never reads as the whole type system being replaced.
const TYPO_PEAK_DAMP = 0.5;

// Severity of one style's change, scaled by magnitude (0..1). A doubled font
// size weighs far more than a 5% nudge — binary field counting hid that, making
// a hero-size regression look as mild as a rounding tweak.
function fieldPenalty(b: TypographyStyle, c: TypographyStyle, cfg: DriftConfig): number {
  let p = 0;
  if (normFamily(b.family) !== normFamily(c.family)) p += TYPO_FAMILY_PENALTY;
  if (String(b.weight) !== String(c.weight)) p += 0.5;
  const sizePct = pctChange(parseFloat(b.size), parseFloat(c.size));
  if (sizePct > cfg.dimPct) p += clamp01(sizePct / cfg.dimShiftPct);
  return clamp01(p);
}

function compareTypography(base: TypographyStyle[], cand: TypographyStyle[], cfg: DriftConfig): { changes: DriftChange[]; result: CategoryResult } {
  const changes: DriftChange[] = [];
  const key = (s: TypographyStyle) => (s.context ?? "").toLowerCase().trim();
  const fmt = (s: TypographyStyle) => `${s.family} ${s.size}/${s.weight}`;

  // Bucket candidates by context so duplicate/empty contexts do not collapse.
  const buckets = new Map<string, TypographyStyle[]>();
  for (const c of cand) {
    const k = key(c);
    const arr = buckets.get(k);
    if (arr) arr.push(c);
    else buckets.set(k, [c]);
  }

  let penalty = 0;
  let peak = 0;
  let changed = 0;
  let removed = 0;

  for (const b of base) {
    const bucket = buckets.get(key(b));
    if (!bucket || bucket.length === 0) {
      changes.push({ category: "typography", kind: "removed", label: b.context, before: fmt(b) });
      penalty += TYPO_REMOVED_PENALTY;
      peak = Math.max(peak, TYPO_REMOVED_PENALTY);
      removed++;
      continue;
    }
    // Within the same context, consume the nearest candidate by field diffs.
    let bi = 0;
    let bd = Infinity;
    bucket.forEach((c, i) => {
      const d = fieldDiffs(b, c, cfg);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const c = bucket.splice(bi, 1)[0];
    if (bd > 0) {
      // Magnitude-aware: a doubled font size weighs far more than a 5% nudge.
      const sev = fieldPenalty(b, c, cfg);
      changes.push({ category: "typography", kind: "changed", label: b.context, before: fmt(b), after: fmt(c) });
      penalty += sev;
      peak = Math.max(peak, sev);
      changed++;
    }
  }

  let added = 0;
  for (const arr of buckets.values()) {
    for (const c of arr) {
      changes.push({ category: "typography", kind: "added", label: c.context, after: fmt(c) });
      penalty += TYPO_ADDED_PENALTY;
      peak = Math.max(peak, TYPO_ADDED_PENALTY);
      added++;
    }
  }

  return {
    changes,
    // Damped peak keeps a single large regression from being diluted by many
    // unchanged styles without letting it max the category (see TYPO_PEAK_DAMP).
    result: {
      category: "typography",
      score: Math.max(categoryScore(penalty, base.length, cand.length), peak * TYPO_PEAK_DAMP),
      changed,
      added,
      removed,
    },
  };
}

function compareDimensions(
  category: "spacing" | "radius",
  base: string[],
  cand: string[],
  cfg: DriftConfig
): { changes: DriftChange[]; result: CategoryResult } {
  const changes: DriftChange[] = [];
  const candVals = cand.map((v) => ({ raw: v, num: parseFloat(v) })).filter((x) => Number.isFinite(x.num));
  const used = new Set<number>();
  let penalty = 0;
  let changed = 0;
  let removed = 0;

  for (const raw of base) {
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) continue;
    let bestIdx = -1;
    let bestPct = Infinity;
    candVals.forEach((c, i) => {
      if (used.has(i)) return;
      const p = pctChange(num, c.num);
      if (p < bestPct) {
        bestPct = p;
        bestIdx = i;
      }
    });

    if (bestIdx !== -1 && bestPct <= cfg.dimPct) {
      used.add(bestIdx);
    } else if (bestIdx !== -1 && bestPct <= cfg.dimShiftPct) {
      used.add(bestIdx);
      changes.push({ category, kind: "changed", label: raw, before: raw, after: candVals[bestIdx].raw, delta: round(bestPct) });
      penalty += clamp01(bestPct / cfg.dimShiftPct);
      changed++;
    } else {
      changes.push({ category, kind: "removed", label: raw, before: raw });
      penalty += 1;
      removed++;
    }
  }

  let added = 0;
  candVals.forEach((c, i) => {
    if (used.has(i)) return;
    changes.push({ category, kind: "added", label: c.raw, after: c.raw });
    penalty += 0.5;
    added++;
  });

  const baseCount = base.filter((v) => Number.isFinite(parseFloat(v))).length;
  return { changes, result: { category, score: categoryScore(penalty, baseCount, candVals.length), changed, added, removed } };
}

function compareShadows(base: string[], cand: string[]): { changes: DriftChange[]; result: CategoryResult } {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const changes: DriftChange[] = [];
  const candSet = new Set(cand.map(norm));
  const baseSet = new Set(base.map(norm));
  let penalty = 0;
  let removed = 0;
  let added = 0;

  for (const b of base) {
    if (!candSet.has(norm(b))) {
      changes.push({ category: "shadow", kind: "removed", label: b, before: b });
      penalty += 1;
      removed++;
    }
  }
  for (const c of cand) {
    if (!baseSet.has(norm(c))) {
      changes.push({ category: "shadow", kind: "added", label: c, after: c });
      penalty += 0.5;
      added++;
    }
  }

  return { changes, result: { category: "shadow", score: categoryScore(penalty, base.length, cand.length), changed: 0, added, removed } };
}

/* ------------------------------- entry -------------------------------- */

/** Map the palette to weighted entries: keep usage count, and attach a brand
 * role when the color matches a semantic role. PaletteColor itself carries no
 * role, so derive it from colors.semantic (role -> hex). */
function paletteEntries(e: ExtractionResult): ColorEntry[] {
  const roleByRgb = new Map<string, string>();
  for (const [role, hex] of Object.entries(e.colors?.semantic ?? {})) {
    const rgb = parseColor(hex);
    if (rgb) roleByRgb.set(rgb.join(","), role);
  }
  return (e.colors?.palette ?? [])
    .map((c): ColorEntry | null => {
      const hex = c.normalized || c.color;
      if (!hex) return null;
      const rgb = parseColor(hex);
      return { hex, count: c.count ?? 1, role: rgb ? roleByRgb.get(rgb.join(",")) : undefined };
    })
    .filter((x): x is ColorEntry => x !== null);
}

/** Radius values outside a sane range (negative, or pill-style 9999px) are not
 * part of a scale; comparing them only adds noise. */
function isRealisticDimension(v: string): boolean {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 && n <= 500;
}

/** oklab/oklch/color() shadows are not handled by the string compare below;
 * comparing them produces phantom drift, so drop them rather than mis-score. */
function isSupportedShadow(s: string): boolean {
  return Boolean(s) && !s.includes("oklab(") && !s.includes("oklch(") && !s.includes("color(");
}

/** Low-confidence tokens are single-use, margin-of-detection elements the
 * extractor itself is unsure about. They surface inconsistently between two
 * extractions of the same design, so counting them produces phantom drift.
 * Only compare tokens the extractor is reasonably sure are real. */
function notLowConfidence(t: { confidence?: Confidence }): boolean {
  return t.confidence !== "low";
}

/** Layout-dependent tokens vary by viewport width, so a baseline and candidate
 * extracted at different widths diff the responsive layout, not the design.
 * Old snapshots lack meta.viewport; only warn when both sides carry it. */
function viewportWarning(baseline: ExtractionResult, candidate: ExtractionResult): string | null {
  const b = baseline.meta?.viewport;
  const c = candidate.meta?.viewport;
  if (!b || !c) return null;
  // Persisted blobs are untrusted: widths may be strings or absent. Coerce, and
  // stay silent on anything non-numeric rather than warn on garbage.
  const bw = Number(b.width);
  const cw = Number(c.width);
  if (!Number.isFinite(bw) || !Number.isFinite(cw) || bw === cw) return null;
  const dim = (v: { width: unknown; height: unknown }) => `${Number(v.width)}x${Number(v.height)}`;
  return (
    `baseline extracted at ${dim(b)}, candidate at ${dim(c)} — ` +
    `layout-dependent changes below may be viewport-induced, not design drift. ` +
    `Re-extract both at the same width (--screen-size).`
  );
}

/** Both extracts must come from the same page: result.url is the final URL
 * after redirects, so a baseline that landed on /fi/ diffed against a candidate
 * on / compares two different surfaces. */
function pageMismatchWarning(baseline: ExtractionResult, candidate: ExtractionResult): string | null {
  let b: URL;
  let c: URL;
  try {
    b = new URL(baseline.url);
    c = new URL(candidate.url);
  } catch {
    return null;
  }
  const norm = (u: URL) => u.host.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
  if (norm(b) === norm(c)) return null;
  return (
    `baseline was extracted from ${b.href}, candidate from ${c.href} — ` +
    `different pages after redirects, the diff compares two different surfaces.`
  );
}

/** --dark-mode merges a dark-scheme pass into the palette, so extracts with and
 * without it are not comparable: the whole palette "changes". */
function darkModeWarning(baseline: ExtractionResult, candidate: ExtractionResult): string | null {
  const b = Boolean(baseline.meta?.flags?.darkMode);
  const c = Boolean(candidate.meta?.flags?.darkMode);
  if (b === c) return null;
  return (
    `--dark-mode was on for the ${b ? "baseline" : "candidate"} only — ` +
    `palette drift may be theme-induced, not design drift. Re-extract with matching flags.`
  );
}

/** A snapshot taken before web fonts finished loading carries fallback
 * families; family drift against it is suspect. */
function fontsWarning(baseline: ExtractionResult, candidate: ExtractionResult): string | null {
  const sides: string[] = [];
  if (baseline.meta?.fontsReady === false) sides.push("baseline");
  if (candidate.meta?.fontsReady === false) sides.push("candidate");
  if (sides.length === 0) return null;
  const pending = [
    ...(baseline.meta?.pendingFonts ?? []),
    ...(candidate.meta?.pendingFonts ?? []),
  ];
  const detail = pending.length ? ` (pending: ${[...new Set(pending)].join(", ")})` : "";
  return (
    `web fonts had not finished loading in the ${sides.join(" and ")} extraction${detail} — ` +
    `typography family changes may be fallback fonts, not design drift.`
  );
}

/** Stage names the extractor records in meta.errors / meta.degraded, mapped to
 * the drift category they invalidate. The dark-mode and mobile passes merge
 * extra colors into the palette, so their failure degrades color. */
const STAGE_CATEGORY: Record<string, DriftCategory> = {
  colors: "color",
  typography: "typography",
  spacing: "spacing",
  borderRadius: "radius",
  shadows: "shadow",
  "dark-mode": "color",
  mobile: "color",
};

function degradedDriftCategories(r: ExtractionResult): Set<DriftCategory> {
  const out = new Set<DriftCategory>();
  for (const e of r.meta?.errors ?? []) {
    const cat = STAGE_CATEGORY[e.stage];
    if (cat) out.add(cat);
  }
  for (const stage of r.meta?.degraded ?? []) {
    const cat = STAGE_CATEGORY[stage];
    if (cat) out.add(cat);
  }
  return out;
}

export function computeDrift(
  baseline: ExtractionResult,
  candidate: ExtractionResult,
  config: Partial<DriftConfig> = {}
): DriftReport {
  const cfg: DriftConfig = { ...DEFAULT_DRIFT_CONFIG, ...config, weights: { ...DEFAULT_DRIFT_CONFIG.weights, ...config.weights } };

  const basePalette = paletteEntries(baseline);
  const candPalette = paletteEntries(candidate);
  const baseTypo = baseline.typography?.styles ?? [];
  const candTypo = candidate.typography?.styles ?? [];
  const baseSpacing = (baseline.spacing?.commonValues ?? []).map((s) => String(s.px));
  const candSpacing = (candidate.spacing?.commonValues ?? []).map((s) => String(s.px));
  const baseRadius = (baseline.borderRadius?.values ?? []).filter(notLowConfidence).map((r) => r.value).filter(isRealisticDimension);
  const candRadius = (candidate.borderRadius?.values ?? []).filter(notLowConfidence).map((r) => r.value).filter(isRealisticDimension);
  const baseShadows = (baseline.shadows ?? []).filter(notLowConfidence).map((s) => s.shadow).filter(isSupportedShadow);
  const candShadows = (candidate.shadows ?? []).filter(notLowConfidence).map((s) => s.shadow).filter(isSupportedShadow);

  // A category empty on BOTH sides carries no information; letting it enter the
  // average at score 0 dilutes real drift in the categories that were measured.
  const comparable = (b: unknown[], c: unknown[]) => b.length + c.length > 0;

  const parts = [
    { ...compareColors(basePalette, candPalette, cfg), w: cfg.weights.color, comparable: comparable(basePalette, candPalette) },
    {
      ...compareTypography(baseTypo, candTypo, cfg),
      w: cfg.weights.typography,
      comparable: comparable(baseTypo, candTypo),
    },
    {
      ...compareDimensions("spacing", baseSpacing, candSpacing, cfg),
      w: cfg.weights.spacing,
      comparable: comparable(baseSpacing, candSpacing),
    },
    {
      ...compareDimensions("radius", baseRadius, candRadius, cfg),
      w: cfg.weights.radius,
      comparable: comparable(baseRadius, candRadius),
    },
    {
      ...compareShadows(baseShadows, candShadows),
      w: cfg.weights.shadow,
      comparable: comparable(baseShadows, candShadows),
    },
  ];

  const warnings: string[] = [];
  for (const w of [
    viewportWarning(baseline, candidate),
    pageMismatchWarning(baseline, candidate),
    darkModeWarning(baseline, candidate),
    fontsWarning(baseline, candidate),
  ]) {
    if (w) warnings.push(w);
  }

  const baseDegraded = degradedDriftCategories(baseline);
  const candDegraded = degradedDriftCategories(candidate);

  // Weighted average over categories that actually have something to compare.
  let weighted = 0;
  let totalW = 0;
  const categories: CategoryResult[] = [];
  const changes: DriftChange[] = [];
  for (const p of parts) {
    categories.push(p.result);
    changes.push(...p.changes);
    const cat = p.result.category;
    const degradedSides = [
      baseDegraded.has(cat) ? "baseline" : null,
      candDegraded.has(cat) ? "candidate" : null,
    ].filter(Boolean);
    if (degradedSides.length > 0) {
      // Engine rule (see ExtractionMeta.degraded): a degraded category failed
      // extraction, the brand did not change — its missing tokens would read
      // as removals, so it must not enter the score.
      warnings.push(
        `${cat} extraction was degraded in the ${degradedSides.join(" and ")} — ` +
        `category excluded from the drift score.`
      );
      continue;
    }
    if (p.comparable) {
      weighted += p.result.score * p.w;
      totalW += p.w;
    }
  }

  // Degradation can exclude every comparable category. The score is then 0 by
  // construction, not by evidence — a gate must not treat that as a clean pass.
  if (totalW === 0 && (baseDegraded.size > 0 || candDegraded.size > 0)) {
    warnings.push(
      "no category could be scored: every comparable category was degraded — " +
      "this compare is inconclusive, not stable. Re-extract and retry."
    );
  }

  const score = totalW > 0 ? Math.round((weighted / totalW) * 100) : 0;
  const summary = changes.reduce(
    (acc, c) => {
      acc[c.kind]++;
      return acc;
    },
    { changed: 0, added: 0, removed: 0 } as Record<DriftKind, number>
  );

  return {
    score,
    status: score > cfg.failThreshold ? "drift" : "stable",
    threshold: cfg.failThreshold,
    summary,
    categories,
    changes,
    ...(warnings.length ? { warnings } : {}),
  };
}
