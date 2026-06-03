/**
 * Drift engine — ported from dembrandt-next/lib/app/drift.ts
 *
 * Compares two Dembrandt extracts (baseline and candidate) and returns a
 * drift report: 0-100 score (0 = identical), pass/fail verdict, and a list
 * of what changed. Pure functions, no dependencies, no infra.
 */

export const DEFAULT_DRIFT_CONFIG = {
  colorSame: 2.3,
  colorShift: 15,
  dimPct: 4,
  dimShiftPct: 25,
  weights: { color: 1, typography: 1, spacing: 0.8, radius: 0.6, shadow: 0.6 },
  failThreshold: 10,
};

/* ----------------------------- color math ----------------------------- */

function parseColor(input) {
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

function rgbToLab([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const ra = parseColor(a), rb = parseColor(b);
  if (!ra || !rb) return a.trim() === b.trim() ? 0 : Infinity;
  const [l1, a1, b1] = rgbToLab(ra);
  const [l2, a2, b2] = rgbToLab(rb);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/* ------------------------------ helpers ------------------------------- */

const round = (n) => Math.round(n * 10) / 10;
const clamp01 = (n) => Math.max(0, Math.min(1, n));

function pctChange(a, b) {
  if (a === 0) return b === 0 ? 0 : 100;
  return Math.abs(a - b) / Math.abs(a) * 100;
}

function categoryScore(penalty, baseCount, candCount) {
  if (baseCount === 0) return candCount > 0 ? 1 : 0;
  return clamp01(penalty / baseCount);
}

/* ---------------------------- comparisons ----------------------------- */

const ROLE_WEIGHT = { accent: 3, primary: 3, brand: 3, cta: 2, secondary: 1.5, surface: 0.3, background: 0.3 };

function colorWeight(entry) {
  const role = (entry?.role ?? "").toLowerCase();
  const roleW = ROLE_WEIGHT[role] ?? 1;
  const count = entry?.count ?? 1;
  // Square-root dampening so a color used 1000x doesn't completely drown others
  return roleW * Math.sqrt(Math.max(1, count));
}

function compareColors(base, cand, cfg) {
  const changes = [];
  const used = new Set();
  let penalty = 0, totalWeight = 0, changed = 0, removed = 0;

  for (const bc of base) {
    const w = colorWeight(bc);
    totalWeight += w;
    const bcHex = bc.normalized ?? bc.color ?? bc;

    let bestIdx = -1, best = Infinity;
    cand.forEach((cc, i) => {
      if (used.has(i)) return;
      const ccHex = cc.normalized ?? cc.color ?? cc;
      const d = deltaE(bcHex, ccHex);
      if (d < best) { best = d; bestIdx = i; }
    });

    const bcLabel = bcHex;
    if (bestIdx !== -1 && best <= cfg.colorSame) {
      used.add(bestIdx);
    } else if (bestIdx !== -1 && best <= cfg.colorShift) {
      used.add(bestIdx);
      const candHex = cand[bestIdx].normalized ?? cand[bestIdx].color ?? cand[bestIdx];
      changes.push({ category: "color", kind: "changed", label: bcLabel, before: bcLabel, after: candHex, delta: round(best) });
      penalty += clamp01(best / cfg.colorShift) * w;
      changed++;
    } else {
      changes.push({ category: "color", kind: "removed", label: bcLabel, before: bcLabel });
      penalty += w;
      removed++;
    }
  }

  let added = 0;
  cand.forEach((cc, i) => {
    if (used.has(i)) return;
    const ccHex = cc.normalized ?? cc.color ?? cc;
    const w = colorWeight(cc);
    changes.push({ category: "color", kind: "added", label: ccHex, after: ccHex });
    penalty += 0.5 * w;
    added++;
  });

  const score = totalWeight > 0 ? clamp01(penalty / totalWeight) : (cand.length > 0 ? 1 : 0);
  return { changes, result: { category: "color", score, changed, added, removed } };
}

function normFamily(f) {
  return (f ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function fieldDiffs(b, c, cfg) {
  let d = 0;
  if (normFamily(b.family) !== normFamily(c.family)) d++;
  if (pctChange(parseFloat(b.size), parseFloat(c.size)) > cfg.dimPct) d++;
  if (String(b.weight) !== String(c.weight)) d++;
  return d;
}

function compareTypography(base, cand, cfg) {
  const changes = [];
  const key = (s) => (s.context ?? "").toLowerCase().trim();
  const fmt = (s) => `${s.family} ${s.size}/${s.weight}`;

  const buckets = new Map();
  for (const c of cand) {
    const k = key(c);
    const arr = buckets.get(k);
    if (arr) arr.push(c);
    else buckets.set(k, [c]);
  }

  let penalty = 0, changed = 0, removed = 0;

  for (const b of base) {
    const bucket = buckets.get(key(b));
    if (!bucket || bucket.length === 0) {
      changes.push({ category: "typography", kind: "removed", label: b.context, before: fmt(b) });
      penalty += 1; removed++;
      continue;
    }
    let bi = 0, bd = Infinity;
    bucket.forEach((c, i) => {
      const d = fieldDiffs(b, c, cfg);
      if (d < bd) { bd = d; bi = i; }
    });
    const c = bucket.splice(bi, 1)[0];
    if (bd > 0) {
      changes.push({ category: "typography", kind: "changed", label: b.context, before: fmt(b), after: fmt(c) });
      penalty += clamp01(bd / 3);
      changed++;
    }
  }

  let added = 0;
  for (const arr of buckets.values()) {
    for (const c of arr) {
      changes.push({ category: "typography", kind: "added", label: c.context, after: fmt(c) });
      penalty += 0.5; added++;
    }
  }

  return { changes, result: { category: "typography", score: categoryScore(penalty, base.length, cand.length), changed, added, removed } };
}

function compareDimensions(category, base, cand, cfg) {
  const changes = [];
  const candVals = cand.map((v) => ({ raw: v, num: parseFloat(v) })).filter((x) => Number.isFinite(x.num));
  const used = new Set();
  let penalty = 0, changed = 0, removed = 0;

  for (const raw of base) {
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) continue;
    let bestIdx = -1, bestPct = Infinity;
    candVals.forEach((c, i) => {
      if (used.has(i)) return;
      const p = pctChange(num, c.num);
      if (p < bestPct) { bestPct = p; bestIdx = i; }
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
      penalty += 1; removed++;
    }
  }

  let added = 0;
  candVals.forEach((c, i) => {
    if (used.has(i)) return;
    changes.push({ category, kind: "added", label: c.raw, after: c.raw });
    penalty += 0.5; added++;
  });

  const baseCount = base.filter((v) => Number.isFinite(parseFloat(v))).length;
  return { changes, result: { category, score: categoryScore(penalty, baseCount, candVals.length), changed, added, removed } };
}

function compareShadows(base, cand) {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const changes = [];
  const candSet = new Set(cand.map(norm));
  const baseSet = new Set(base.map(norm));
  let penalty = 0, removed = 0, added = 0;

  for (const b of base) {
    if (!candSet.has(norm(b))) {
      changes.push({ category: "shadow", kind: "removed", label: b, before: b });
      penalty += 1; removed++;
    }
  }
  for (const c of cand) {
    if (!baseSet.has(norm(c))) {
      changes.push({ category: "shadow", kind: "added", label: c, after: c });
      penalty += 0.5; added++;
    }
  }

  return { changes, result: { category: "shadow", score: categoryScore(penalty, base.length, cand.length), changed: 0, added, removed } };
}

/* ------------------------------- entry -------------------------------- */

function isRealisticDimension(v) {
  if (!v) return false;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 && n <= 500;
}

function isSupportedShadow(s) {
  if (!s || typeof s !== "string") return false;
  return !s.includes("oklab(") && !s.includes("oklch(") && !s.includes("color(");
}

function paletteEntries(extract) {
  return (extract.colors?.palette ?? []).filter((c) => c.normalized ?? c.color);
}

export function computeDrift(baseline, candidate, config = {}) {
  const cfg = {
    ...DEFAULT_DRIFT_CONFIG,
    ...config,
    weights: { ...DEFAULT_DRIFT_CONFIG.weights, ...config.weights },
  };

  // ignore: { shadows: true, colors: ["#000"], borderRadius: true, spacing: true, typography: true }
  const ignore = config.ignore ?? {};

  function ignoredValues(category) {
    const v = ignore[category];
    if (!v) return null;
    if (v === true) return "all";
    return Array.isArray(v) ? new Set(v.map((s) => s.toLowerCase())) : null;
  }

  function applyIgnore(values, category) {
    const ig = ignoredValues(category);
    if (!ig) return values;
    if (ig === "all") return [];
    return values.filter((v) => !ig.has(String(v).toLowerCase()));
  }

  const wColor     = ignoredValues("colors")      === "all" ? 0 : cfg.weights.color;
  const wTypo      = ignoredValues("typography")  === "all" ? 0 : cfg.weights.typography;
  const wSpacing   = ignoredValues("spacing")     === "all" ? 0 : cfg.weights.spacing;
  const wRadius    = ignoredValues("borderRadius") === "all" ? 0 : cfg.weights.radius;
  const wShadow    = ignoredValues("shadows")     === "all" ? 0 : cfg.weights.shadow;

  const basePalette  = applyIgnore(paletteEntries(baseline), "colors");
  const candPalette  = applyIgnore(paletteEntries(candidate), "colors");
  const baseSpacing  = applyIgnore((baseline.spacing?.commonValues ?? []).map((s) => s.px), "spacing");
  const candSpacing  = applyIgnore((candidate.spacing?.commonValues ?? []).map((s) => s.px), "spacing");
  const baseRadius   = applyIgnore((baseline.borderRadius?.values ?? []).map((r) => r.value).filter(isRealisticDimension), "borderRadius");
  const candRadius   = applyIgnore((candidate.borderRadius?.values ?? []).map((r) => r.value).filter(isRealisticDimension), "borderRadius");
  const baseShadows  = applyIgnore((baseline.shadows ?? []).map((s) => s.shadow).filter(isSupportedShadow), "shadows");
  const candShadows  = applyIgnore((candidate.shadows ?? []).map((s) => s.shadow).filter(isSupportedShadow), "shadows");

  const parts = [
    { ...compareColors(basePalette, candPalette, cfg), w: wColor },
    { ...compareTypography(baseline.typography?.styles ?? [], candidate.typography?.styles ?? [], cfg), w: wTypo },
    { ...compareDimensions("spacing", baseSpacing, candSpacing, cfg), w: wSpacing },
    { ...compareDimensions("radius", baseRadius, candRadius, cfg), w: wRadius },
    { ...compareShadows(baseShadows, candShadows), w: wShadow },
  ];

  let weighted = 0, totalW = 0;
  const categories = [], changes = [];

  for (const p of parts) {
    categories.push(p.result);
    changes.push(...p.changes);
    const active = p.result.changed + p.result.added + p.result.removed > 0 || p.result.score > 0;
    if (active || p.w > 0) {
      weighted += p.result.score * p.w;
      totalW += p.w;
    }
  }

  const score = totalW > 0 ? Math.round((weighted / totalW) * 100) : 0;
  const summary = changes.reduce(
    (acc, c) => { acc[c.kind]++; return acc; },
    { changed: 0, added: 0, removed: 0 }
  );

  return {
    score,
    status: score > cfg.failThreshold ? "drift" : "stable",
    threshold: cfg.failThreshold,
    summary,
    categories,
    changes,
  };
}
