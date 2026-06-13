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

// Dembrandt design system (dark, Linear-inspired). This is the report's *chrome* —
// a Dembrandt report looks like Dembrandt. The extracted site's tokens are content
// (swatches, values) shown inside it, never the skin. Tokens from dembrandt-next
// design.md / globals.css. Brand fonts are declared with system fallbacks (the App
// loads them; a standalone file falls back gracefully, staying self-contained).
const STYLE = `
:root{--bg:#000000;--surface:#0D0D0D;--elevated:#1A1A1A;--line:#242424;--line-hover:#3F4150;--ink:#ffffff;--muted:#8A8F98;--tertiary:#5E6772;--accent:#38BDF8;--accent-hover:#7dd3fc;--warm:#EA580C;--good:#4ade80;--warn:#EA580C;--bad:#ef4444;--r-sm:6px;--r-md:8px;--r-lg:12px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Red Hat Display',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:48px 24px 80px}
.brand{font-size:13px;font-weight:700;letter-spacing:.02em;color:var(--accent);margin:0 0 18px}
h1{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0 0 6px;color:var(--ink)}
h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:44px 0 16px}
a{color:var(--accent);text-decoration:none}
a:hover{color:var(--accent-hover)}
.sub{color:var(--muted);font-size:14px}
.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
.grid{display:grid;gap:12px}
.swatches{grid-template-columns:repeat(auto-fill,minmax(132px,1fr))}
.sw{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;transition:border-color .15s}
.sw:hover{border-color:var(--line-hover)}
.sw .chip{height:72px}
.sw .meta{padding:10px 12px;font-size:12px}
.sw .hex{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;color:var(--ink)}
.sw .role{color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-top:3px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.tok{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:5px 11px;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600}
.b-good{background:rgba(74,222,128,.14);color:var(--good)}
.b-warn{background:rgba(234,88,12,.16);color:var(--warm)}
.b-bad{background:rgba(239,68,68,.16);color:var(--bad)}
.b-mut{background:var(--elevated);color:var(--muted)}
.drift{border:1px solid var(--line);border-radius:var(--r-lg);padding:20px 22px;margin:8px 0 0;background:var(--surface)}
.drift.is-drift{border-color:rgba(239,68,68,.45)}
.drift.is-stable{border-color:rgba(74,222,128,.4)}
.score{font-size:40px;font-weight:700;line-height:1;letter-spacing:-.02em}
.row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.previewbtn{cursor:pointer}
.shadowbox{width:84px;height:52px;border-radius:var(--r-md);background:var(--elevated);display:inline-block}
.muted{color:var(--muted)}
.kvs{display:flex;flex-wrap:wrap;gap:8px 20px}
header{border-bottom:1px solid var(--line);padding-bottom:22px}
footer{margin-top:56px;color:var(--tertiary);font-size:12px;border-top:1px solid var(--line);padding-top:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:18px 20px;margin:16px 0}
.card h2{margin:0 0 14px}
.colors{display:flex;flex-wrap:wrap;gap:14px}
.color{display:flex;flex-direction:column;gap:6px;width:84px}
.color .sw2{width:100%;height:46px;border-radius:var(--r-md);box-shadow:0 0 0 1px rgba(255,255,255,.1)}
.color .hex{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink)}
.color .cmeta{font-size:10px;color:var(--muted);display:flex;align-items:center;gap:5px}
.color .role{color:var(--accent);font-size:10px;text-transform:uppercase;letter-spacing:.04em}
.shadowpanel{background:#e5e5e5;border-radius:var(--r-md);padding:18px;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
.shadowpanel .sb{width:56px;height:56px;border-radius:var(--r-md);background:#fff}
`;

/* ------------------------------ components ------------------------------ */

function confBadge(c?: string): string {
  const cls = c === "high" ? "b-good" : c === "medium" ? "b-warn" : "b-mut";
  return `<span class="badge ${cls}">${esc(c ?? "low")}</span>`;
}

function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `<section class="card"><h2>${esc(title)}</h2>${body}</section>`;
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
      return `<div class="color"><div class="sw2" style="background:${safeCss(hex) || "transparent"}"></div><div class="hex">${esc(hex)}</div><div class="cmeta">${esc(c.count ?? 0)}× ${confBadge(c.confidence)}</div>${role ? `<div class="role">${esc(role)}</div>` : ""}</div>`;
    })
    .join("");
  return section("Palette", `<div class="colors">${cards}</div>`);
}

function semanticSection(result: BrandingResult): string {
  const sem = Object.entries(result.colors?.semantic ?? {}).filter(([, v]) => v);
  if (!sem.length) return "";
  const chips = sem
    .map(
      ([role, hex]) =>
        `<div class="color"><div class="sw2" style="background:${safeCss(hex) || "transparent"}"></div><div class="role">${esc(role)}</div><div class="hex">${esc(hex)}</div></div>`
    )
    .join("");
  return section("Semantic colors", `<div class="colors">${chips}</div>`);
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
  const boxes = shadows.map((s) => `<span class="sb" style="box-shadow:${safeCss(s.shadow)}"></span>`).join("");
  const list = shadows.map((s) => `<div class="mono sub">${esc(s.shadow)}</div>`).join("");
  return section("Shadows", `<div class="shadowpanel">${boxes}</div><div style="margin-top:12px;display:grid;gap:4px">${list}</div>`);
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
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
<div class="brand">dembrandt</div>
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
