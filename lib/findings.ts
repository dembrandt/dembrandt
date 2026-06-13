/**
 * Design-system findings — the honest, computable audits that back the report's
 * summary scores. Every gauge number traces to a concrete finding here; nothing
 * is a vanity metric. These are the decay signals product-strategy names: a hex
 * off by a hair (ΔE), a role with no visual hierarchy, a brand colour that fails
 * contrast, an off-scale spacing value. Pure and deterministic — given the same
 * extraction it always returns the same findings, so it is safe to gate on.
 *
 * This mirrors the documented `--lint` categories (development-prompts.md): each
 * finding has a severity, and the consistency score is derived from them.
 */

import { deltaE2000, relativeLuminance } from "./colors.js";
import type { BrandingResult } from "./types.js";

export type FindingSeverity = "error" | "warn";
export type FindingCategory = "contrast" | "consistency" | "duplication";

export interface Finding {
  category: FindingCategory;
  /** Display grouping for the report (Gestalt proximity): Color, Typography, … */
  group: string;
  severity: FindingSeverity;
  message: string;
}

export interface FindingsReport {
  findings: Finding[];
  /** 0-100 from the type/spacing/duplication findings. 100 = no issues. */
  consistency: number;
  /** 0-100 from the contrast findings. 100 = no contrast issues. */
  contrast: number;
  /** How complete the captured token set is, as a fraction. */
  coverage: { present: number; total: number };
}

/** Parse a hex or rgb()/rgba() string to #rrggbb, or null if unparseable. */
function toHex(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const h = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
    return ("#" + h(m[1]) + h(m[2]) + h(m[3])).toLowerCase();
  }
  return null;
}

/** WCAG contrast ratio between two colours (any parseable form), or null. */
function contrastRatio(a: string, b: string): number | null {
  const ha = toHex(a);
  const hb = toHex(b);
  if (!ha || !hb) return null;
  const la = relativeLuminance(ha);
  const lb = relativeLuminance(hb);
  if (la == null || lb == null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Leading pixel value of a size string like "40px (2.50rem)", or null. */
function pxOf(size: string | undefined): number | null {
  if (!size) return null;
  const m = String(size).match(/(-?\d+(?:\.\d+)?)\s*px/);
  return m ? Number(m[1]) : null;
}

export function computeFindings(result: BrandingResult): FindingsReport {
  const findings: Finding[] = [];

  // 1. Near-duplicate palette colours (ΔE2000 < just-noticeable). The "#133074
  //    where #133174 should be" decay — two tokens that are visually one colour.
  const palette = (result.colors?.palette ?? [])
    .map((c) => (c.normalized || c.color || "").toLowerCase())
    .filter((h) => /^#[0-9a-f]{6}$/i.test(h));
  const seenDup = new Set<string>();
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const d = deltaE2000(palette[i], palette[j]);
      // < 1.0 = indistinguishable. Looser (the 2.3 JND) flags intentional
      // surface tokens (e.g. #fff vs #f6f6f7 at ΔE 1.9) and creates noise.
      if (d < 1.0) {
        const key = [palette[i], palette[j]].sort().join("|");
        if (seenDup.has(key)) continue;
        seenDup.add(key);
        findings.push({
          category: "duplication",
          group: "Color",
          severity: "warn",
          message: `${palette[i]} and ${palette[j]} are perceptually identical (ΔE ${d.toFixed(1)}) — likely one token split in two.`,
        });
      }
    }
  }

  // 2. Type roles with no hierarchy — two distinct roles sharing size + weight.
  //    Only flag where hierarchy is *expected*: two heading levels that collide,
  //    or a heading sharing a size with body. Body/link/ui sharing a size is the
  //    convention, not a smell, so those groups are skipped.
  const isHierarchy = (r: string) => /heading|display|title|^h[1-6]$/i.test(r);
  const isText = (r: string) => /body|text|paragraph|^p$/i.test(r);
  const styles = result.typography?.styles ?? [];
  const byKey = new Map<number, Map<string, string[]>>();
  for (const s of styles) {
    const px = pxOf(s.size);
    if (px == null || !s.context) continue;
    const rounded = Math.round(px);
    const weight = String(s.weight ?? "");
    const wmap = byKey.get(rounded) ?? new Map<string, string[]>();
    const arr = wmap.get(weight) ?? [];
    if (!arr.includes(s.context)) arr.push(s.context);
    wmap.set(weight, arr);
    byKey.set(rounded, wmap);
  }
  for (const [px, wmap] of byKey) {
    for (const [weight, roles] of wmap) {
      if (roles.length < 2) continue;
      const relevant = roles.filter(isHierarchy).length >= 2 || (roles.some(isHierarchy) && roles.some(isText));
      if (!relevant) continue;
      findings.push({
        category: "consistency",
        group: "Typography",
        severity: "warn",
        message: `${roles.slice(0, 4).join(", ")} share ${px}px${weight ? ` / ${weight}` : ""} — no visual hierarchy between them.`,
      });
    }
  }

  // 3. Brand colour contrast on white — the default canvas. A primary that can't
  //    meet AA as text on white is the "brand colour fails contrast" decay. Warn
  //    (not error): it may be used only as a fill behind white text, which we
  //    can't confirm here. Checked against white only — every colour trivially
  //    clears one of pure black/white, so "best of the two" would never fire.
  const primary = result.colors?.semantic?.primary as string | undefined;
  if (primary) {
    const onWhite = contrastRatio(primary, "#ffffff");
    if (onWhite != null && onWhite < 4.5) {
      findings.push({
        category: "contrast",
        group: "Contrast",
        severity: "warn",
        message: `Primary ${primary} has low contrast on white (${onWhite.toFixed(1)}:1) — fails WCAG AA for text.`,
      });
    }
  }

  // 4. Off-scale spacing — values that break the detected base grid.
  const scaleType = result.spacing?.scaleType ?? "";
  const base = scaleType === "base-8" ? 8 : scaleType === "base-4" ? 4 : 0;
  if (base) {
    const off = (result.spacing?.commonValues ?? [])
      .map((v) => v.px)
      .filter((px): px is number => typeof px === "number" && px >= base && px % base !== 0);
    if (off.length) {
      findings.push({
        category: "consistency",
        group: "Spacing",
        severity: "warn",
        message: `${off.slice(0, 5).map((p) => `${p}px`).join(", ")} ${off.length === 1 ? "is" : "are"} off the ${scaleType} spacing grid.`,
      });
    }
  }

  // Two scores, each derived from its own findings — never invented. Errors
  // cost more than warnings. Consistency = type/spacing/duplication; Contrast =
  // accessibility. Both are always computable, so the header is never one lone
  // gauge.
  const cost = (f: Finding) => (f.severity === "error" ? 12 : 6);
  const sum = (cat: (f: Finding) => boolean) =>
    Math.max(0, 100 - findings.filter(cat).reduce((n, f) => n + cost(f), 0));
  const consistency = sum((f) => f.category !== "contrast");
  const contrast = sum((f) => f.category === "contrast");

  // Coverage: how complete the captured token set is.
  const present = [
    (result.colors?.palette?.length ?? 0) > 0,
    (result.typography?.styles?.length ?? 0) > 0,
    (result.spacing?.commonValues?.length ?? 0) > 0,
    (result.borderRadius?.values?.length ?? 0) > 0,
    (result.shadows?.length ?? 0) > 0,
    (result.breakpoints?.length ?? 0) > 0,
  ].filter(Boolean).length;

  return { findings, consistency, contrast, coverage: { present, total: 6 } };
}
