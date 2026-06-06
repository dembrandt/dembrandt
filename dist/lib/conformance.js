/**
 * Conformance engine — checks whether a live extraction honors a declared
 * token contract (.dembrandt/tokens.json shape).
 *
 * Distinct from drift:
 *   - drift is symmetric: any difference from a snapshot counts.
 *   - conformance is one-directional: every token the contract DECLARES must be
 *     present in the live site. Extra tokens in live are not violations — the
 *     contract documents a minimum, not an exhaustive set.
 *
 * The contract (tokens.json) is structurally lossy: it carries flat sets of
 * families and sizes with no per-context structure, and no usage counts or
 * roles. Conformance is therefore UNWEIGHTED — every declared token counts
 * equally. Callers must surface this; the score is not comparable to a drift
 * score.
 *
 * Pure functions, no I/O.
 */
import { deltaE2000 } from "./colors.js";
export const DEFAULT_CONFORMANCE_CONFIG = {
    colorSame: 2.3, // CIEDE2000 just-noticeable difference (same scale as drift)
    dimPct: 5, // percent tolerance for sizes/spacing/radius
    failThreshold: 10, // percent of declared tokens unsatisfied
};
const round = (n) => Math.round(n * 10) / 10;
function pctChange(a, b) {
    if (a === 0)
        return b === 0 ? 0 : 100;
    return (Math.abs(a - b) / Math.abs(a)) * 100;
}
function normFamily(f) {
    return (f ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
}
function normShadow(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
}
const uniq = (arr) => [...new Set(arr)];
/**
 * Convert a parsed DESIGN.md front matter object into the flat contract shape
 * that computeConformance consumes. DESIGN.md nests tokens differently than
 * tokens.json (named typography/spacing/rounded objects), so map them across.
 * @param {object} fm — parsed YAML front matter
 */
export function designTokensToContract(fm) {
    const contract = {};
    if (fm?.colors && typeof fm.colors === "object")
        contract.colors = fm.colors;
    if (fm?.typography && typeof fm.typography === "object") {
        const families = new Set(), sizes = new Set();
        for (const t of Object.values(fm.typography)) {
            if (t && typeof t === "object") {
                if (t.fontFamily)
                    families.add(t.fontFamily);
                if (t.fontSize)
                    sizes.add(t.fontSize);
            }
        }
        if (families.size)
            contract.fontFamilies = [...families];
        if (sizes.size)
            contract.fontSizes = [...sizes];
    }
    const flatValues = (obj) => obj && typeof obj === "object" ? uniq(Object.values(obj).filter((v) => typeof v === "string")) : [];
    const spacing = flatValues(fm?.spacing);
    const rounded = flatValues(fm?.rounded);
    if (spacing.length)
        contract.spacing = spacing;
    if (rounded.length)
        contract.borderRadius = rounded;
    return contract;
}
/* ----------------------- contract / live extraction ----------------------- */
function contractValues(contract) {
    return {
        colors: uniq([
            ...(Array.isArray(contract.palette) ? contract.palette : []),
            ...(contract.colors && typeof contract.colors === "object" ? Object.values(contract.colors) : []),
        ].filter(Boolean)),
        fontFamilies: (contract.fontFamilies ?? []).filter(Boolean),
        fontSizes: (contract.fontSizes ?? []).filter(Boolean),
        spacing: (contract.spacing ?? []).filter(Boolean),
        borderRadius: (contract.borderRadius ?? []).filter(Boolean),
        shadows: (contract.shadows ?? []).filter(Boolean),
    };
}
function liveValues(extract) {
    const palette = (extract.colors?.palette ?? [])
        .map((c) => c.normalized ?? c.color ?? c)
        .filter(Boolean);
    const semantic = extract.colors?.semantic
        ? Object.values(extract.colors.semantic)
            .map((v) => (typeof v === "string" ? v : v?.hex ?? v?.normalized ?? v?.color))
            .filter(Boolean)
        : [];
    const styles = extract.typography?.styles ?? [];
    return {
        colors: uniq([...palette, ...semantic]),
        fontFamilies: uniq(styles.map((s) => s.fontFamily ?? s.family).filter(Boolean)),
        fontSizes: uniq(styles.map((s) => s.fontSize ?? s.size).filter(Boolean)),
        spacing: (extract.spacing?.commonValues ?? []).map((s) => s.px ?? s).filter(Boolean),
        borderRadius: (extract.borderRadius?.values ?? []).map((r) => r.value ?? r).filter(Boolean),
        shadows: (extract.shadows ?? []).map((s) => s.shadow ?? s).filter(Boolean),
    };
}
/* ------------------------------ comparisons ------------------------------- */
function colorConformance(want, have, cfg) {
    const violations = [];
    for (const c of want) {
        const ok = have.some((h) => deltaE2000(c, h) <= cfg.colorSame);
        if (!ok)
            violations.push({ category: "color", token: c });
    }
    return { category: "color", total: want.length, violations };
}
function setConformance(category, want, have, normalize) {
    const liveSet = new Set(have.map(normalize));
    const violations = [];
    for (const v of want) {
        if (!liveSet.has(normalize(v)))
            violations.push({ category, token: v });
    }
    return { category, total: want.length, violations };
}
function dimConformance(category, want, have, cfg) {
    const haveNums = have.map((v) => parseFloat(v)).filter(Number.isFinite);
    const violations = [];
    let total = 0;
    for (const v of want) {
        const n = parseFloat(v);
        if (!Number.isFinite(n))
            continue;
        total++;
        const ok = haveNums.some((h) => pctChange(n, h) <= cfg.dimPct);
        if (!ok)
            violations.push({ category, token: v });
    }
    return { category, total, violations };
}
/* -------------------------------- entry ----------------------------------- */
/**
 * @param {object} contract — tokens.json-shaped declared contract
 * @param {object} candidate — live ExtractionResult
 * @param {object} [config]
 */
export function computeConformance(contract, candidate, config = {}) {
    const cfg = { ...DEFAULT_CONFORMANCE_CONFIG, ...config };
    const want = contractValues(contract);
    const have = liveValues(candidate);
    const categories = [
        colorConformance(want.colors, have.colors, cfg),
        setConformance("fontFamily", want.fontFamilies, have.fontFamilies, normFamily),
        dimConformance("fontSize", want.fontSizes, have.fontSizes, cfg),
        dimConformance("spacing", want.spacing, have.spacing, cfg),
        dimConformance("radius", want.borderRadius, have.borderRadius, cfg),
        setConformance("shadow", want.shadows, have.shadows, normShadow),
    ];
    const total = categories.reduce((n, c) => n + c.total, 0);
    const violations = categories.flatMap((c) => c.violations);
    const violated = violations.length;
    const score = total > 0 ? round((violated / total) * 100) : 0;
    return {
        mode: "conformance",
        weighted: false,
        score,
        status: score > cfg.failThreshold ? "violation" : "conformant",
        threshold: cfg.failThreshold,
        summary: { total, satisfied: total - violated, violated },
        categories: categories.map((c) => ({ category: c.category, total: c.total, violated: c.violations.length })),
        violations,
    };
}
//# sourceMappingURL=conformance.js.map