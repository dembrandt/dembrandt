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
:root{--bg:#000000;--surface:#0D0D0D;--elevated:#1A1A1A;--line:#242424;--line-hover:#3F4150;--ink:#ffffff;--muted:#8A8F98;--accent:#38BDF8;--accent-hover:#7dd3fc;--warm:#EA580C;--good:#4ade80;--bad:#ef4444;--r-sm:6px;--r-md:8px;--r-lg:12px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Red Hat Display',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{color:var(--accent-hover)}
.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
.muted{color:var(--muted)}
.sub{color:var(--muted);font-size:14px}
.row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.kvs{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:14px}
.topbar{position:sticky;top:0;z-index:10;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 24px;display:flex;align-items:baseline;gap:12px}
.topbar .bm{font-size:14px;font-weight:700;color:var(--accent);letter-spacing:.01em;display:inline-flex;align-items:center;gap:7px}
.topbar .bm svg{height:15px;width:auto}
.topbar .u{color:var(--muted);font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wrap{max-width:1000px;margin:0 auto;padding:8px 24px 88px}
.cap{text-align:center;color:var(--muted);font-size:14px;margin:22px 0 4px}
.gauges{display:flex;flex-wrap:wrap;gap:34px;justify-content:center;padding:18px 0 28px;border-bottom:1px solid var(--line)}
.gauge{display:flex;flex-direction:column;align-items:center;gap:9px}
.gring{width:84px;height:84px}
.gring .gbg{fill:none;stroke:var(--line);stroke-width:8}
.gring .gfg{fill:none;stroke-width:8;stroke-linecap:round}
.gring.g-pass .gfg{stroke:var(--good)}.gring.g-pass .gnum{fill:var(--good)}
.gring.g-avg .gfg{stroke:var(--warm)}.gring.g-avg .gnum{fill:var(--warm)}
.gring.g-fail .gfg{stroke:var(--bad)}.gring.g-fail .gnum{fill:var(--bad)}
.gnum{font:700 28px 'Red Hat Display',system-ui,sans-serif}
.glabel{font-size:14px;color:var(--ink);font-weight:600}
.gsub{font-size:14px;color:var(--muted)}
details.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:16px 20px;margin:14px 0}
details.card>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
details.card>summary::-webkit-details-marker{display:none}
details.card>summary::after{content:"";margin-left:auto;width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);transition:transform .15s}
details.card[open]>summary::after{transform:rotate(-135deg)}
.cardbody{margin-top:16px}
.colors{display:flex;flex-wrap:wrap;gap:16px}
.color{display:flex;flex-direction:column;gap:6px;width:104px}
.color .sw2{width:100%;height:48px;border-radius:var(--r-md);box-shadow:0 0 0 1px rgba(255,255,255,.1)}
.color .hex{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:14px;color:var(--ink)}
.color .cmeta{font-size:14px;color:var(--muted);display:flex;align-items:center;gap:6px}
.color .role{color:var(--accent);font-size:14px;text-transform:uppercase;letter-spacing:.03em}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.tok{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:6px 12px;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:14px;color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:.05em}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:14px;font-weight:600}
.b-good{background:rgba(74,222,128,.16);color:var(--good)}
.b-warn{background:rgba(234,88,12,.18);color:var(--warm)}
.b-bad{background:rgba(239,68,68,.18);color:var(--bad)}
.b-mut{background:var(--elevated);color:var(--muted)}
.drift{border:1px solid var(--line);border-radius:var(--r-lg);padding:20px 22px;margin:14px 0;background:var(--surface)}
.drift.is-drift{border-color:rgba(239,68,68,.45)}
.drift.is-stable{border-color:rgba(74,222,128,.4)}
.score{font-size:40px;font-weight:700;line-height:1;letter-spacing:-.02em}
.previewbtn{cursor:pointer}
.shadowbox{width:84px;height:52px;border-radius:var(--r-md);background:var(--elevated);display:inline-block}
.shadowpanel{background:#e5e5e5;border-radius:var(--r-md);padding:18px;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
.shadowpanel .sb{width:56px;height:56px;border-radius:var(--r-md);background:#fff}
footer{margin-top:56px;color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:18px;text-align:center}
`;

// Dembrandt brand mark (from dembrandt-next/components/AppMarkIcon.tsx). Inlined,
// fill=currentColor so it inherits the topbar accent. Self-contained — no asset fetch.
const LOGO = `<svg viewBox="0 0 316.6 310.01" fill="currentColor" aria-hidden="true"><path d="M81.48,20.83h-34.92C20.85,20.83,0,41.68,0,67.39v175.22c0,25.72,20.85,46.56,46.56,46.56h34.92c2.3,0,4.17-1.87,4.17-4.17V25c0-2.3-1.87-4.17-4.17-4.17Z"/><path d="M268.66,0H110.47c-2.3,0-4.17,1.87-4.17,4.17v301.67c0,2.3,1.87,4.17,4.17,4.17h158.18c26.48,0,47.95-21.47,47.95-47.95V47.95c0-26.48-21.47-47.95-47.95-47.95Z"/></svg>`;

/* ------------------------------ components ------------------------------ */

function confBadge(c?: string): string {
  const cls = c === "high" ? "b-good" : c === "medium" ? "b-warn" : "b-mut";
  return `<span class="badge ${cls}">${esc(c ?? "low")}</span>`;
}

// Collapsible section card (Lighthouse-style, native <details> — no JS, stays
// self-contained). Open by default; the user can collapse any section.
function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `<details class="card" open><summary>${esc(title)}</summary><div class="cardbody">${body}</div></details>`;
}

/** A Lighthouse-style circular score gauge (0-100), coloured by threshold. */
function gauge(value: number, label: string, sub?: string): string {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const cls = v >= 90 ? "g-pass" : v >= 50 ? "g-avg" : "g-fail";
  const C = 339.292; // 2πr, r=54
  const arc = ((C * v) / 100).toFixed(1);
  return `<div class="gauge"><svg viewBox="0 0 120 120" class="gring ${cls}" role="img" aria-label="${esc(label)} ${v} of 100"><circle class="gbg" cx="60" cy="60" r="54"/><circle class="gfg" cx="60" cy="60" r="54" stroke-dasharray="${arc} ${C}" transform="rotate(-90 60 60)"/><text class="gnum" x="60" y="60" text-anchor="middle" dominant-baseline="central">${v}</text></svg><span class="glabel">${esc(label)}</span>${sub ? `<span class="gsub">${esc(sub)}</span>` : ""}</div>`;
}

/** The top "ranking" row — gauges that summarise the report's status. */
function summaryGauges(result: BrandingResult, drift?: DriftReport): string {
  const g: string[] = [];
  if (drift) {
    g.push(gauge(Math.max(0, 100 - Math.min(100, drift.score)), "Stability", `drift ${drift.score}`));
  }
  const wcag = result.wcag ?? [];
  if (wcag.length) {
    const passed = wcag.filter((p) => p.aa).length;
    g.push(gauge((100 * passed) / wcag.length, "Accessibility", `${passed}/${wcag.length} AA`));
  }
  const palette = result.colors?.palette ?? [];
  if (palette.length) {
    const high = palette.filter((c) => c.confidence === "high").length;
    g.push(gauge((100 * high) / palette.length, "Confidence", `${high}/${palette.length} high`));
  }
  return g.length ? `<div class="gauges">${g.join("")}</div>` : "";
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
  const gauges = summaryGauges(result, options.drift);

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
<div class="topbar"><span class="bm">${LOGO}dembrandt</span><span class="u">${esc(result.url)}</span></div>
<div class="wrap">
<div class="cap">${esc(domain)} · extracted ${esc(result.extractedAt)}${version ? " · v" + esc(version) : ""} · ${esc(summary)}</div>
${gauges}
${body}
<footer>Generated by <a href="https://github.com/dembrandt/dembrandt">Dembrandt</a>${version ? " " + esc(version) : ""} · <a href="https://github.com/dembrandt/dembrandt/issues">File an issue</a></footer>
</div>
<script type="application/json" id="dembrandt-data">${data}</script>
</body>
</html>`;
}
