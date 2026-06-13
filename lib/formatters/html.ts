/**
 * HTML report formatter — a single self-contained HTML file (inline CSS, no
 * external fetches) that renders an extraction and, optionally, a drift diff.
 *
 * This is the pre-platform bridge (DEM-94): a CI artifact you can open offline
 * and attach to a PR, before the hosted dashboard exists. It is a *view* over
 * the same deterministic data the platform will later diff server-side — it
 * renders structured tokens and single-render contrast only, never re-derives
 * drift from rendered CSS. Mode B reuses the canonical `computeDrift` engine.
 *
 * Like Lighthouse's standalone report, the machine-readable result is embedded
 * in a <script> so the file is both a human view and a data artifact.
 */

import type {
  BrandingResult,
  PaletteColor,
  TypographyStyle,
  ButtonStyle,
  BadgeStyle,
  WcagPair,
  CssState,
} from "../types.js";
import type { DriftReport, DriftChange } from "../drift.js";

export interface HtmlReportOptions {
  /** When present, render a drift banner + changes at the top of the report. */
  drift?: DriftReport;
  /** Label for the baseline the drift was computed against (e.g. a filename). */
  baselineLabel?: string;
  /** CLI version, surfaced in the footer. */
  version?: string;
}

/* ------------------------------- escaping ------------------------------- */

/** Escape text for HTML body / attribute context. */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitize a JSON string for inlining inside a <script> tag. Mirrors Lighthouse's
 * report-generator: `<` would let a `</script>` in the data break out of the tag,
 * and U+2028/U+2029 are valid JSON but terminate JS string literals.
 */
function sanitizeJson(object: unknown): string {
  return JSON.stringify(object)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Allow only safe CSS color/length-ish tokens into inline style values, so
 * extracted site CSS cannot inject `}` / `<` / `url()` etc. into the report.
 * Anything outside the allowlist is dropped.
 */
function safeCss(value: unknown): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  // hex, rgb/rgba, hsl/hsla, named-ish words, numbers+units, commas, %, spaces, parens, dots, slashes (for line-height font shorthand)
  if (/^[#0-9a-zA-Z().,%\s/\-+]+$/.test(v) && !/[<>{};]/.test(v)) return v;
  return "";
}

/* -------------------------------- styles -------------------------------- */

const STYLE = `
:root{--bg:#ffffff;--panel:#f7f8fa;--panel2:#eef1f5;--ink:#1a1d23;--muted:#6b7280;--line:#e6e8ec;--accent:#133174;--good:#15803d;--warn:#b45309;--bad:#b91c1c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:22px;margin:0 0 4px;color:var(--accent)}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:32px 0 12px;border-bottom:2px solid var(--accent);padding-bottom:6px}
a{color:var(--accent)}
.sub{color:var(--muted);font-size:13px}
.grid{display:grid;gap:10px}
.swatches{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
.sw{background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.sw .chip{height:64px}
.sw .meta{padding:8px 10px;font-size:12px}
.sw .hex{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sw .role{color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.tok{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600}
.b-good{background:rgba(63,185,80,.15);color:var(--good)}
.b-warn{background:rgba(210,153,34,.15);color:var(--warn)}
.b-bad{background:rgba(248,81,73,.15);color:var(--bad)}
.b-mut{background:var(--panel2);color:var(--muted)}
.drift{border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:8px 0 0;background:var(--panel)}
.drift.is-drift{border-color:rgba(248,81,73,.5)}
.drift.is-stable{border-color:rgba(63,185,80,.4)}
.score{font-size:34px;font-weight:700;line-height:1}
.row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.previewbtn{border:0;cursor:default}
.shadowbox{width:80px;height:48px;border-radius:8px;background:#fff;display:inline-block}
.muted{color:var(--muted)}
.kvs{display:flex;flex-wrap:wrap;gap:6px 18px}
footer{margin-top:48px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px}
`;

/* ------------------------------ components ------------------------------ */

function confBadge(c?: string): string {
  const cls = c === "high" ? "b-good" : c === "medium" ? "b-warn" : "b-mut";
  return `<span class="badge ${cls}">${esc(c ?? "low")}</span>`;
}

function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `<h2>${esc(title)}</h2>${body}`;
}

function paletteSection(result: BrandingResult): string {
  const palette = result.colors?.palette ?? [];
  if (!palette.length) return "";
  // role lookup: hex -> role from semantic map
  const roleByHex = new Map<string, string>();
  for (const [role, hex] of Object.entries(result.colors?.semantic ?? {})) {
    if (hex) roleByHex.set(String(hex).toLowerCase(), role);
  }
  const cards = palette
    .map((c: PaletteColor) => {
      const hex = c.normalized || c.color;
      const role = roleByHex.get(String(hex).toLowerCase());
      return `<div class="sw"><div class="chip" style="background:${safeCss(hex) || "transparent"}"></div><div class="meta"><div class="hex">${esc(hex)}</div><div class="sub">${esc(c.count ?? 0)}× ${confBadge(c.confidence)}</div>${role ? `<div class="role">${esc(role)}</div>` : ""}</div></div>`;
    })
    .join("");
  return section("Palette", `<div class="grid swatches">${cards}</div>`);
}

function semanticSection(result: BrandingResult): string {
  const sem = Object.entries(result.colors?.semantic ?? {}).filter(([, v]) => v);
  if (!sem.length) return "";
  const chips = sem
    .map(
      ([role, hex]) =>
        `<div class="sw" style="min-width:120px"><div class="chip" style="height:40px;background:${safeCss(hex) || "transparent"}"></div><div class="meta"><div class="role">${esc(role)}</div><div class="hex">${esc(hex)}</div></div></div>`
    )
    .join("");
  return section("Semantic colors", `<div class="chips">${chips}</div>`);
}

function typographySection(result: BrandingResult): string {
  const styles = result.typography?.styles ?? [];
  if (!styles.length) return "";
  const rows = styles
    .map(
      (s: TypographyStyle) =>
        `<tr><td>${esc(s.context)}</td><td>${esc((s.family ?? "").split(",")[0])}</td><td class="mono">${esc(s.size)}</td><td class="mono">${esc(s.weight)}</td><td class="mono">${esc(s.lineHeight ?? "")}</td></tr>`
    )
    .join("");
  const srcs = result.typography?.sources ?? {};
  const fams = [
    ...(srcs.googleFonts ?? []),
    ...(Array.isArray(srcs.adobeFonts) ? srcs.adobeFonts : []),
    ...(srcs.customFonts ?? []),
    ...(srcs.selfHostedFonts ?? []),
  ];
  const srcLine = fams.length ? `<p class="sub">Sources: ${esc(fams.join(", "))}</p>` : "";
  return section(
    "Typography",
    `<table><thead><tr><th>Context</th><th>Family</th><th>Size</th><th>Weight</th><th>Line height</th></tr></thead><tbody>${rows}</tbody></table>${srcLine}`
  );
}

function tokenChips(values: { value?: string; display?: string; px?: number | string; count?: number }[]): string {
  return values
    .map((v) => {
      const label = v.display ?? v.value ?? (v.px != null ? `${v.px}px` : "");
      if (!label) return "";
      return `<span class="tok">${esc(label)}${v.count != null ? ` <span class="muted">${esc(v.count)}×</span>` : ""}</span>`;
    })
    .join("");
}

function spacingSection(result: BrandingResult): string {
  const vals = result.spacing?.commonValues ?? [];
  if (!vals.length) return "";
  const scale = result.spacing?.scaleType ? `<p class="sub">Scale: ${esc(result.spacing.scaleType)}</p>` : "";
  return section("Spacing", `<div class="chips">${tokenChips(vals as any)}</div>${scale}`);
}

function radiusSection(result: BrandingResult): string {
  const vals = result.borderRadius?.values ?? [];
  if (!vals.length) return "";
  return section("Border radius", `<div class="chips">${tokenChips(vals as any)}</div>`);
}

function shadowsSection(result: BrandingResult): string {
  const shadows = result.shadows ?? [];
  if (!shadows.length) return "";
  const rows = shadows
    .map(
      (s) =>
        `<div class="row" style="margin-bottom:8px"><span class="shadowbox" style="box-shadow:${safeCss(s.shadow)}"></span><span class="mono sub">${esc(s.shadow)}</span></div>`
    )
    .join("");
  return section("Shadows", rows);
}

function buttonsSection(result: BrandingResult): string {
  const buttons = result.components?.buttons ?? [];
  if (!buttons.length) return "";
  const previews = buttons
    .slice(0, 12)
    .map((b: ButtonStyle) => {
      const st: CssState = b.states?.default ?? {};
      const style = [
        st.backgroundColor ? `background:${safeCss(st.backgroundColor)}` : "",
        st.color ? `color:${safeCss(st.color)}` : "",
        st.borderRadius ? `border-radius:${safeCss(st.borderRadius)}` : "",
        st.padding ? `padding:${safeCss(st.padding)}` : "padding:8px 14px",
        st.border ? `border:${safeCss(st.border)}` : "",
        b.fontWeight ? `font-weight:${safeCss(b.fontWeight)}` : "",
        b.fontSize ? `font-size:${safeCss(b.fontSize)}` : "",
      ]
        .filter(Boolean)
        .join(";");
      return `<button class="previewbtn" style="${esc(style)}">${esc(b.text || "Button")}</button>`;
    })
    .join(" ");
  return section("Buttons", `<div class="row">${previews}</div>`);
}

function badgesSection(result: BrandingResult): string {
  const raw = result.components?.badges;
  const list: BadgeStyle[] = Array.isArray(raw) ? raw : raw?.all ?? [];
  if (!list.length) return "";
  const chips = list
    .slice(0, 16)
    .map((bd: BadgeStyle) => {
      const style = [
        bd.backgroundColor ? `background:${safeCss(bd.backgroundColor)}` : "",
        bd.color ? `color:${safeCss(bd.color)}` : "",
        bd.borderRadius ? `border-radius:${safeCss(bd.borderRadius)}` : "border-radius:999px",
        bd.padding ? `padding:${safeCss(bd.padding)}` : "padding:2px 10px",
        bd.fontSize ? `font-size:${safeCss(bd.fontSize)}` : "font-size:12px",
      ]
        .filter(Boolean)
        .join(";");
      return `<span style="${esc(style)}">${esc(bd.styleType || "Badge")}</span>`;
    })
    .join(" ");
  return section("Badges", `<div class="row">${chips}</div>`);
}

function wcagSection(result: BrandingResult): string {
  const pairs = result.wcag ?? [];
  if (!pairs.length) return "";
  const rows = pairs
    .slice(0, 60)
    .map((p: WcagPair) => {
      const verdict = p.aa ? `<span class="badge b-good">AA</span>` : p.aaLarge ? `<span class="badge b-warn">AA Large</span>` : `<span class="badge b-bad">Fail</span>`;
      return `<tr><td><span class="shadowbox" style="width:22px;height:22px;border-radius:4px;background:${safeCss(p.bg)};border:1px solid var(--line)"></span></td><td class="mono">${esc(p.fg)}</td><td class="mono">${esc(p.bg)}</td><td class="mono">${esc(p.ratio?.toFixed ? p.ratio.toFixed(2) : p.ratio)}</td><td>${verdict}</td></tr>`;
    })
    .join("");
  return section(
    "WCAG contrast",
    `<table><thead><tr><th>bg</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>AA</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function metaSection(result: BrandingResult): string {
  const fw = (result.frameworks ?? []).map((f) => f.name);
  const icons = (result.iconSystem ?? []).map((i) => i.name);
  const bps = (result.breakpoints ?? []).map((b) => `${b.px}px`);
  const items: string[] = [];
  if (fw.length) items.push(`<span><span class="muted">Frameworks:</span> ${esc(fw.join(", "))}</span>`);
  if (icons.length) items.push(`<span><span class="muted">Icons:</span> ${esc(icons.join(", "))}</span>`);
  if (bps.length) items.push(`<span><span class="muted">Breakpoints:</span> ${esc(bps.join(", "))}</span>`);
  if (!items.length) return "";
  return section("Detected", `<div class="kvs">${items.join("")}</div>`);
}

/* -------------------------------- drift --------------------------------- */

function driftSection(drift: DriftReport, baselineLabel?: string): string {
  const cls = drift.status === "drift" ? "is-drift" : "is-stable";
  const verdict =
    drift.status === "drift"
      ? `<span class="badge b-bad">DRIFT</span>`
      : `<span class="badge b-good">STABLE</span>`;
  const cats = drift.categories
    .filter((c) => c.changed + c.added + c.removed > 0)
    .map(
      (c) =>
        `<tr><td>${esc(c.category)}</td><td>${esc(Math.round(c.score * 100))}</td><td>${esc(c.changed)}</td><td>${esc(c.added)}</td><td>${esc(c.removed)}</td></tr>`
    )
    .join("");
  const changes = drift.changes
    .slice(0, 120)
    .map((ch: DriftChange) => {
      const kindCls = ch.kind === "added" ? "b-good" : ch.kind === "removed" ? "b-bad" : "b-warn";
      const detail = ch.before && ch.after ? `${esc(ch.before)} → ${esc(ch.after)}` : esc(ch.before ?? ch.after ?? "");
      return `<tr><td>${esc(ch.category)}</td><td><span class="badge ${kindCls}">${esc(ch.kind)}</span></td><td class="mono">${esc(ch.label)}</td><td class="mono">${detail}</td><td class="mono">${ch.delta != null ? esc(ch.delta) : ""}</td></tr>`;
    })
    .join("");
  const more = drift.changes.length > 120 ? `<p class="sub">… ${drift.changes.length - 120} more changes</p>` : "";
  return `<div class="drift ${cls}"><div class="row"><div class="score">${esc(drift.score)}</div><div><div>${verdict} <span class="sub">threshold ${esc(drift.threshold)}</span></div><div class="sub">${esc(drift.summary.changed)} changed · ${esc(drift.summary.added)} added · ${esc(drift.summary.removed)} removed${baselineLabel ? ` · vs ${esc(baselineLabel)}` : ""}</div></div></div>${
    cats ? `<table style="margin-top:14px"><thead><tr><th>Category</th><th>Score</th><th>Δ</th><th>+</th><th>−</th></tr></thead><tbody>${cats}</tbody></table>` : ""
  }${
    changes ? `<table style="margin-top:10px"><thead><tr><th>Category</th><th>Kind</th><th>Token</th><th>Change</th><th>Δ</th></tr></thead><tbody>${changes}</tbody></table>${more}` : ""
  }</div>`;
}

/* -------------------------------- entry --------------------------------- */

export function generateHtmlReport(result: BrandingResult, options: HtmlReportOptions = {}): string {
  let domain = result.url;
  try {
    domain = new URL(result.url).hostname.replace(/^www\./, "");
  } catch {
    /* leave as-is */
  }
  const summary = `${result.colors?.palette?.length ?? 0} colors · ${result.typography?.styles?.length ?? 0} text styles · ${result.spacing?.commonValues?.length ?? 0} spacing · ${result.breakpoints?.length ?? 0} breakpoints`;
  const version = options.version ?? result.meta?.dembrandtVersion ?? "";

  const body = [
    options.drift ? driftSection(options.drift, options.baselineLabel) : "",
    paletteSection(result),
    semanticSection(result),
    typographySection(result),
    spacingSection(result),
    radiusSection(result),
    shadowsSection(result),
    buttonsSection(result),
    badgesSection(result),
    wcagSection(result),
    metaSection(result),
  ].join("\n");

  // Self-theme: the report wears the brand it reported on. Accent = the extracted
  // primary (the report of site X looks like site X), with a neutral readable base
  // so it stays legible whatever the brand. Heading font follows the extracted
  // heading family when present (declaration only — no external font fetch).
  const semantic = result.colors?.semantic ?? {};
  const accent =
    semantic.primary || semantic.brand || semantic.accent ||
    result.colors?.palette?.[0]?.normalized || result.colors?.palette?.[0]?.color || "#133174";
  const headingStyle = (result.typography?.styles ?? []).find((s) => /head|display|title/i.test(s.context ?? ""));
  const headingFamily = ((headingStyle ?? result.typography?.styles?.[0])?.family ?? "").split(",")[0].replace(/["']/g, "").trim();
  const fontRule = /^[\w .-]+$/.test(headingFamily) && headingFamily ? `h1,h2{font-family:'${headingFamily}',system-ui,sans-serif}` : "";
  const themed = `:root{--accent:${safeCss(accent) || "#133174"}}${fontRule}`;

  // Embed the machine-readable data so the report is also a data artifact,
  // re-parseable from the same file (Lighthouse pattern).
  const data = sanitizeJson({ result, drift: options.drift ?? null });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="dembrandt${version ? " " + esc(version) : ""}">
<title>Dembrandt report — ${esc(domain)}</title>
<style>${STYLE}
${themed}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${esc(domain)}</h1>
<div class="sub"><a href="${esc(result.url)}">${esc(result.url)}</a> · extracted ${esc(result.extractedAt)}</div>
<div class="sub">${esc(summary)}</div>
</header>
${body}
<footer>Generated by dembrandt${version ? " v" + esc(version) : ""} · self-contained report, no external resources.</footer>
</div>
<script type="application/json" id="dembrandt-data">${data}</script>
</body>
</html>`;
}
