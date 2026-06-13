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
 * The summary header is Lighthouse-style: big score gauges, each backed by a
 * concrete finding (lib/findings.ts) so no number is a vanity metric. The file
 * is the rendered view only — the machine-readable form is `--json-only`.
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
import { computeFindings } from "../findings.js";
import type { FindingsReport, Finding } from "../findings.js";

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
/*
 * Dark by default (matching the App at /app), with a CSS-only light toggle — no
 * JS, just `:root:has(#theme:checked)` flipping the token block. System fonts,
 * no embedded JSON: stays small at scale. Typography is generic/system on
 * purpose (no Red Hat Display / web fonts — keeps the file light); the fluid
 * type scale, brand surfaces, #38BDF8 accent and tight Linear radii still mirror
 * the App's design system (dembrandt-next/app/globals.css). color-scheme is
 * pinned per theme so a browser's own dark mode can't repaint it. Type steps
 * stay >=14px (the App's 2xs/xs at 11-13px are dropped for the no-sub-14px rule).
 */
const STYLE = `
:root{color-scheme:dark;--bg:#000;--surface:#0D0D0D;--elevated:#1A1A1A;--line:#242424;--ink:#fff;--muted:#8A8F98;--tertiary:#5E6772;--accent:#38BDF8;--accent-hover:#7dd3fc;--good:#4ade80;--avg:#fbbf24;--bad:#ef4444;--swring:rgba(255,255,255,.12);--sans:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--t-sm:clamp(0.875rem,0.85rem + 0.15vw,0.938rem);--t-base:clamp(1rem,0.975rem + 0.125vw,1.063rem);--t-md:clamp(1.125rem,1.075rem + 0.25vw,1.25rem);--t-lg:clamp(1.25rem,1.175rem + 0.375vw,1.5rem);--t-xl:clamp(1.5rem,1.375rem + 0.625vw,1.875rem);--t-2xl:clamp(1.875rem,1.675rem + 1vw,2.5rem)}
:root:has(#theme:checked){color-scheme:light;--bg:#F5F5F7;--surface:#ffffff;--elevated:#ECECEF;--line:#D8D8DE;--ink:#111827;--muted:#5E6772;--tertiary:#8A8F98;--accent:#0C6AE0;--accent-hover:#0a55b5;--good:#0a8c4a;--avg:#b36b00;--bad:#c0392b;--swring:rgba(0,0,0,.12)}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:var(--t-base);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{color:var(--accent-hover);text-decoration:underline;text-underline-offset:3px}
.mono{font-family:var(--mono)}
.muted{color:var(--muted)}
.sub{color:var(--muted);font-size:var(--t-sm)}
.row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.kvs{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:var(--t-sm)}
.kvs span{white-space:nowrap}
.topbar{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 24px;display:flex;align-items:center;gap:12px}
.topbar .bm{display:inline-flex;align-items:center;color:var(--ink);flex:none}
.topbar .bm svg{height:16px;width:auto;display:block}
.tt{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
.ttl{cursor:pointer;font-size:var(--t-sm);color:var(--muted);user-select:none}
.ttl:hover{color:var(--ink)}
.ttl::after{content:"Light"}
:root:has(#theme:checked) .ttl::after{content:"Dark"}
.counts{text-align:center;color:var(--muted);font-size:var(--t-sm);margin:0;padding:14px 24px 0}
.topbar .u{color:var(--muted);font-family:var(--mono);font-size:var(--t-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topbar .meta{margin-left:auto;color:var(--muted);font-size:var(--t-sm);white-space:nowrap}
.wrap{max-width:960px;margin:0 auto;padding:8px 24px 80px}
.gauges{display:flex;flex-wrap:wrap;gap:34px;justify-content:center;padding:18px 0 28px;border-bottom:1px solid var(--line)}
.gauge{display:flex;flex-direction:column;align-items:center;gap:9px;text-decoration:none;color:inherit}
a.gauge:hover .glabel{text-decoration:underline}
.fgroup{margin-bottom:16px}
.fgroup:last-child{margin-bottom:0}
.fgrouph{font-size:var(--t-sm);font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:10px}
.findings{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.findings li{display:grid;grid-template-columns:56px 1fr;gap:12px;align-items:baseline;font-size:var(--t-sm)}
.conf{font-size:var(--t-sm);font-weight:600}
.c-high{color:var(--good)}.c-med{color:var(--avg)}.c-low{color:var(--muted)}
.sev{font-size:var(--t-sm);font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.s-err{color:var(--bad)}.s-warn{color:var(--avg)}
.gring{width:84px;height:84px}
.gring .gbg{fill:none;stroke:var(--line);stroke-width:8}
.gring .gfg{fill:none;stroke-width:8;stroke-linecap:round}
.gring.g-pass .gfg{stroke:var(--good)}.gring.g-pass .gnum{fill:var(--good)}
.gring.g-avg .gfg{stroke:var(--avg)}.gring.g-avg .gnum{fill:var(--avg)}
.gring.g-fail .gfg{stroke:var(--bad)}.gring.g-fail .gnum{fill:var(--bad)}
.gnum{font-weight:700;font-size:var(--t-2xl)}
.glabel{font-size:var(--t-sm);color:var(--ink);font-weight:600}
.gsub{font-size:var(--t-sm);color:var(--muted)}
details.card{border:1px solid var(--line);border-radius:8px;padding:16px 20px;margin:14px 0}
details.card>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;font-size:var(--t-sm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
details.card>summary::-webkit-details-marker{display:none}
details.card>summary::after{content:"";margin-left:auto;width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);transition:transform .15s}
details.card[open]>summary::after{transform:rotate(-135deg)}
details.card>summary:hover::after{border-color:var(--accent)}
.cardbody{margin-top:16px}
.colors{display:flex;flex-wrap:wrap;gap:14px}
.color{display:flex;flex-direction:column;gap:5px;align-items:center;text-align:center}
.color .sw2{width:36px;height:36px;border-radius:6px;box-shadow:inset 0 0 0 1px var(--swring)}
.color .hex{font-family:var(--mono);font-size:var(--t-sm);color:var(--ink)}
.color .cmeta{font-size:var(--t-sm);color:var(--muted);display:flex;align-items:center;gap:6px;white-space:nowrap}
.color .role{color:var(--accent);font-size:var(--t-sm);text-transform:uppercase;letter-spacing:.03em}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.tok{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:6px 12px;font-family:var(--mono);font-size:var(--t-sm);color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:var(--t-sm)}
th,td{text-align:left;padding:8px 12px;vertical-align:top}
thead th{border-bottom:1px solid var(--line);color:var(--muted);font-weight:600;font-size:var(--t-sm);text-transform:uppercase;letter-spacing:.04em}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:var(--t-sm);font-weight:600}
.b-good{background:rgba(10,140,74,.14);color:var(--good)}
.b-warn{background:rgba(179,107,0,.16);color:var(--avg)}
.b-bad{background:rgba(192,57,43,.14);color:var(--bad)}
.b-mut{background:var(--surface);color:var(--muted)}
.badgepv{display:inline-block;padding:3px 12px;border:1px solid var(--line);border-radius:999px;font-size:var(--t-sm)}
.drift{border:1px solid var(--line);border-radius:8px;padding:20px 22px;margin:14px 0}
.drift.is-drift{border-color:var(--bad)}
.drift.is-stable{border-color:var(--good)}
.score{font-size:var(--t-2xl);font-weight:700;line-height:1;letter-spacing:-.02em}
.previewbtn{cursor:pointer}
.shadowbox{width:84px;height:52px;border-radius:8px;background:#fff;display:inline-block;border:1px solid var(--line)}
.shadowpanel{background:#f0f0f0;border-radius:8px;padding:18px;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
.shadowpanel .sb{width:56px;height:56px;border-radius:8px;background:#fff}
footer{margin-top:48px;color:var(--muted);font-size:var(--t-sm);text-align:center}
`;

// Dembrandt brand mark (from dembrandt-next/components/AppMarkIcon.tsx). Inlined,
// fill=currentColor so it inherits the topbar accent. Self-contained — no asset fetch.
const LOGO = `<svg viewBox="0 0 316.6 310.01" fill="currentColor" aria-hidden="true"><path d="M81.48,20.83h-34.92C20.85,20.83,0,41.68,0,67.39v175.22c0,25.72,20.85,46.56,46.56,46.56h34.92c2.3,0,4.17-1.87,4.17-4.17V25c0-2.3-1.87-4.17-4.17-4.17Z"/><path d="M268.66,0H110.47c-2.3,0-4.17,1.87-4.17,4.17v301.67c0,2.3,1.87,4.17,4.17,4.17h158.18c26.48,0,47.95-21.47,47.95-47.95V47.95c0-26.48-21.47-47.95-47.95-47.95Z"/></svg>`;

/* ------------------------------ components ------------------------------ */

function confBadge(c?: string): string {
  const cls = c === "high" ? "c-high" : c === "medium" ? "c-med" : "c-low";
  return `<span class="conf ${cls}">${esc(c ?? "low")}</span>`;
}

// Collapsible section card (Lighthouse-style, native <details> — no JS, stays
// self-contained). Open by default; the user can collapse any section.
function section(title: string, body: string, id?: string): string {
  if (!body.trim()) return "";
  return `<details class="card"${id ? ` id="${esc(id)}"` : ""} open><summary>${esc(title)}</summary><div class="cardbody">${body}</div></details>`;
}

/** A Lighthouse-style circular score gauge (0-100), coloured by threshold. */
function gauge(value: number, label: string, sub?: string, invert = false, href?: string): string {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const cls = (invert ? v <= 10 : v >= 90) ? "g-pass" : (invert ? v <= 40 : v >= 50) ? "g-avg" : "g-fail";
  const C = 339.292; // 2πr, r=54
  const arc = ((C * v) / 100).toFixed(1);
  const inner = `<svg viewBox="0 0 120 120" class="gring ${cls}" role="img" aria-label="${esc(label)} ${v} of 100"><circle class="gbg" cx="60" cy="60" r="54"/><circle class="gfg" cx="60" cy="60" r="54" stroke-dasharray="${arc} ${C}" transform="rotate(-90 60 60)"/><text class="gnum" x="60" y="60" text-anchor="middle" dominant-baseline="central">${v}</text></svg><span class="glabel">${esc(label)}</span>${sub ? `<span class="gsub">${esc(sub)}</span>` : ""}`;
  return href
    ? `<a class="gauge" href="${esc(href)}">${inner}</a>`
    : `<div class="gauge">${inner}</div>`;
}

/** A Lighthouse-style fraction tile (e.g. token coverage 6/6). */
/**
 * The top "ranking" row — Dembrandt's axes, not Lighthouse's. Drift (did it
 * change vs a baseline) and Contrast (WCAG AA) appear only when that data
 * exists; Consistency is always computable. Every gauge links to the card that
 * explains it, so no number is a mystery.
 */
function summaryGauges(result: BrandingResult, fr: FindingsReport, drift?: DriftReport): string {
  const g: string[] = [];
  if (drift) {
    g.push(gauge(drift.score, "Drift", drift.status === "drift" ? "vs baseline" : "stable", true, "#drift"));
  }
  const cIssues = fr.findings.filter((f) => f.category !== "contrast").length;
  g.push(gauge(fr.consistency, "Consistency", cIssues ? `${cIssues} issue${cIssues === 1 ? "" : "s"}` : "clean", false, "#findings"));
  // Contrast is always present: real WCAG pairs when --wcag ran, else the
  // self-computed contrast findings.
  const wcag = result.wcag ?? [];
  if (wcag.length) {
    const passed = wcag.filter((p) => p.aa).length;
    g.push(gauge((100 * passed) / wcag.length, "Contrast", `${passed}/${wcag.length} pairs AA`, false, "#wcag"));
  } else {
    const xIssues = fr.findings.filter((f) => f.category === "contrast").length;
    g.push(gauge(fr.contrast, "Contrast", xIssues ? `${xIssues} issue${xIssues === 1 ? "" : "s"}` : "clean", false, "#findings"));
  }
  return `<div class="gauges">${g.join("")}</div>`;
}

/** An at-a-glance executive line of token counts — honest, no score. */
function summaryCounts(result: BrandingResult): string {
  const n = (a: unknown) => (Array.isArray(a) ? a.length : 0);
  const plural = (c: number, one: string, many = one + "s") => `${c} ${c === 1 ? one : many}`;
  const parts: string[] = [];
  const colors = n(result.colors?.palette);
  if (colors) parts.push(plural(colors, "color"));
  const styles = n(result.typography?.styles);
  if (styles) parts.push(plural(styles, "text style"));
  const spacing = n(result.spacing?.commonValues);
  if (spacing) parts.push(`${spacing} spacing`);
  const radii = n(result.borderRadius?.values);
  if (radii) parts.push(plural(radii, "radius", "radii"));
  const shadows = n(result.shadows);
  if (shadows) parts.push(plural(shadows, "shadow"));
  const bps = n(result.breakpoints);
  if (bps) parts.push(plural(bps, "breakpoint"));
  return parts.length ? `<p class="counts">${esc(parts.join(" · "))}</p>` : "";
}

/** Actionable findings — the audits behind the scores, Lighthouse-style. */
function findingsSection(fr: FindingsReport): string {
  if (!fr.findings.length) return "";
  const sev = (s: Finding["severity"]) =>
    s === "error" ? `<span class="sev s-err">error</span>` : `<span class="sev s-warn">warn</span>`;
  // Group by display group (Gestalt proximity) so the list reads as Color /
  // Typography / Spacing / Contrast rather than a flat mixed stream.
  const groups = new Map<string, Finding[]>();
  for (const f of fr.findings) {
    const arr = groups.get(f.group) ?? [];
    arr.push(f);
    groups.set(f.group, arr);
  }
  const blocks = [...groups.entries()]
    .map(([group, items]) => {
      const rows = items
        .map((f) => `<li>${sev(f.severity)}<span>${esc(f.message)}</span></li>`)
        .join("");
      return `<div class="fgroup"><div class="fgrouph">${esc(group)} <span class="muted">${items.length}</span></div><ul class="findings">${rows}</ul></div>`;
    })
    .join("");
  return `<details class="card" id="findings" open><summary>Findings (${fr.findings.length})</summary><div class="cardbody">${blocks}</div></details>`;
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
      return `<div class="color"><div class="sw2" style="background:${safeCss(hex) || "transparent"}"></div><div class="hex">${esc(hex)}</div>${role ? `<div class="role">${esc(role)}</div>` : `<div class="cmeta">${confBadge(c.confidence)}</div>`}</div>`;
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

type TokenValue = { value?: string; display?: string; px?: number | string; numericValue?: number; count?: number };

/** Numeric px of a token value, for ordering a scale low → high. */
function tokenPx(v: TokenValue): number {
  if (typeof v.numericValue === "number") return v.numericValue;
  if (typeof v.px === "number") return v.px;
  const m = String(v.display ?? v.value ?? v.px ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : Number.POSITIVE_INFINITY;
}

/** Sort token values ascending so a scale reads in order. */
function sortByPx(values: TokenValue[]): TokenValue[] {
  return [...values].sort((a, b) => tokenPx(a) - tokenPx(b));
}

function tokenChips(values: TokenValue[]): string {
  return values
    .map((v) => {
      // px may already be a string like "2px" (pre-1.1.0 extractions); don't
      // re-append the unit.
      const label = v.display ?? v.value ?? (typeof v.px === "string" ? v.px : v.px != null ? `${v.px}px` : "");
      if (!label) return "";
      return `<span class="tok">${esc(label)}${v.count != null ? ` <span class="muted">${esc(v.count)}×</span>` : ""}</span>`;
    })
    .join("");
}

function spacingSection(result: BrandingResult): string {
  const vals = result.spacing?.commonValues ?? [];
  if (!vals.length) return "";
  const scale = result.spacing?.scaleType ? `<p class="sub">Scale: ${esc(result.spacing.scaleType)}</p>` : "";
  return section("Spacing", `<div class="chips">${tokenChips(sortByPx(vals as TokenValue[]))}</div>${scale}`);
}

function radiusSection(result: BrandingResult): string {
  const vals = result.borderRadius?.values ?? [];
  if (!vals.length) return "";
  return section("Border radius", `<div class="chips">${tokenChips(sortByPx(vals as TokenValue[]))}</div>`);
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
        bd.borderRadius ? `border-radius:${safeCss(bd.borderRadius)}` : "",
      ]
        .filter(Boolean)
        .join(";");
      return `<span class="badgepv" style="${esc(style)}">${esc(bd.styleType || "badge")}</span>`;
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
    `<table><thead><tr><th>bg</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>AA</th></tr></thead><tbody>${rows}</tbody></table>`,
    "wcag"
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
  return `<div class="drift ${cls}" id="drift"><div class="row"><div class="score">${esc(drift.score)}</div><div><div>${verdict} <span class="sub">threshold ${esc(drift.threshold)}</span></div><div class="sub">${esc(drift.summary.changed)} changed · ${esc(drift.summary.added)} added · ${esc(drift.summary.removed)} removed${baselineLabel ? ` · vs ${esc(baselineLabel)}` : ""}</div></div></div>${
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
  const version = options.version ?? result.meta?.dembrandtVersion ?? "";
  const fr = computeFindings(result);

  const body = [
    options.drift ? driftSection(options.drift, options.baselineLabel) : "",
    findingsSection(fr),
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

  const gauges = summaryGauges(result, fr, options.drift);

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
<input type="checkbox" id="theme" class="tt">
<div class="topbar"><span class="bm">${LOGO}</span><span class="u">${esc(result.url)}</span><span class="meta">${esc(result.extractedAt)}${version ? " · v" + esc(version) : ""}</span><label for="theme" class="ttl" title="Toggle light / dark"></label></div>
<div class="wrap">
${gauges}
${summaryCounts(result)}
${body}
<footer>Generated by <a href="https://github.com/dembrandt/dembrandt">Dembrandt</a>${version ? " " + esc(version) : ""} · <a href="https://github.com/dembrandt/dembrandt/issues">File an issue</a></footer>
</div>
</body>
</html>`;
}
