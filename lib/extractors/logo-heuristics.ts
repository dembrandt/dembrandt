// Pure, DOM-free logo heuristics.
//
// The logo extractor runs almost entirely inside `page.evaluate()`, a browser sandbox
// that cannot import modules. To keep a single source of truth AND make the decision
// logic unit-testable, each function here is written to be fully self-contained — no
// imports, no closures over module scope, no `this`. `LOGO_HEURISTICS_SOURCE` serializes
// them so `logo.ts` can re-hydrate the exact same code inside the page with `new
// Function`. Tests import the functions directly; production runs their serialized twins.
//
// Because the source is re-hydrated in a foreign context, every function must also be
// defensive: it receives values that crossed a DOM boundary and may be null, NaN,
// unexpected types, or malformed strings. None of these may throw — a thrown heuristic
// would abort logo extraction for the whole page.

export type LogoContext = 'header' | 'footer' | 'hero' | 'body';
export type Box = { x: number; y: number; width: number; height: number };
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'scale-down' | 'none';

/**
 * Does this href point at the site's own home page? Such a link is the strongest signal
 * that the mark inside it is the site's own logo, wherever on the page it sits.
 */
export function isHomeHref(href: unknown, origin: unknown): boolean {
  if (typeof href !== 'string') return false;
  let h = href.trim().toLowerCase();
  if (!h) return false;
  if (h === '/' || h === './') return true;
  const o = (typeof origin === 'string' ? origin : '').trim().toLowerCase().replace(/\/+$/, '');
  // an absolute URL to our own origin — reduce it to its path so the locale check applies
  if (o && (h === o || h.startsWith(o + '/'))) { h = h.slice(o.length) || '/'; }
  if (h === '/' || h === './') return true;
  // a localized homepage root: /en, /de, /en-us, /fr_ca (many i18n sites link the logo here)
  return /^\/[a-z]{2}([-_][a-z]{2})?\/?$/.test(h);
}

/**
 * Classify a mark by its vertical position in the document. Above the fold it belongs to
 * the header; deep at the bottom, the footer; otherwise the body. Position shapes ranking
 * elsewhere — this only names the region.
 */
export function classifyContextByPosition(top: unknown, docHeight: unknown, foldY = 500): LogoContext {
  const t = Number(top);
  if (!Number.isFinite(t) || t <= foldY) return 'header';
  const dh = Number(docHeight);
  // Only tall pages have a footer band distinct from the body; on a short page dh-1200 is
  // negative and would swallow all mid-page content as "footer".
  if (Number.isFinite(dh) && dh > 1200 && t > dh - 1200) return 'footer';
  return 'body';
}

/**
 * If an image's alt text names a brand that is NOT this site, return that squashed brand
 * name; otherwise null. Catches customer / integration / testimonial logos on marketing
 * pages (a single-word brand, or multi-word like "Acme Widgets Logo"). Multi-word
 * names must survive — the older single-word pattern let them through as our own brand.
 * A home-linked mark is never third-party and must be checked by the caller first.
 */
export function thirdPartyBrandFromAlt(altText: unknown, siteDomain: unknown): string | null {
  if (typeof altText !== 'string') return null;
  const brand = altText
    // generic logo words, then file extensions, then common asset-name variant suffixes
    .replace(/\b(logos?|logotypes?|logomarks?|brandmarks?|wordmarks?|icons?|brands?|marks?)\b/gi, ' ')
    .replace(/\.(svg|png|webp|avif|jpe?g|gif)\b/gi, ' ')
    .replace(/\b(on[-_]?white|on[-_]?black|white|black|dark|light|colou?r|mono|full|small|large|[0-9]+x|2x|3x|v?[0-9]{1,4})\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
  if (brand.length < 2) return null;
  const site = (typeof siteDomain === 'string' ? siteDomain : '').toLowerCase();
  if (!site) return null;
  if (brand === site || brand.includes(site) || site.includes(brand)) return null;
  return brand;
}

/**
 * Parse a CSS object-position / background-position axis token into a 0..1 fraction.
 * Percentages map directly; keywords map to their edges; anything else centres at 0.5.
 */
export function positionFraction(token: unknown): number {
  if (typeof token !== 'string') return 0.5;
  const t = token.trim().toLowerCase();
  if (t.endsWith('%')) {
    const p = parseFloat(t);
    return Number.isFinite(p) ? Math.min(1, Math.max(0, p / 100)) : 0.5;
  }
  if (t === 'left' || t === 'top') return 0;
  if (t === 'right' || t === 'bottom') return 1;
  if (t === 'center' || t === 'centre') return 0.5;
  return 0.5;
}

/**
 * The box a logo is actually painted in, given its content box and how it's fitted.
 *
 * `content` is the element's content box (border and padding already removed). For a
 * replaced element whose intrinsic aspect ratio differs from the content box, the mark is
 * letterboxed: `object-fit: contain` (and SVG `preserveAspectRatio: …meet`) shrink it to
 * fit, leaving empty space that `object-position` then distributes. `fill` and `cover`
 * paint the whole box, so the content box IS the painted box.
 *
 * All-defensive: missing/zero/NaN intrinsic size, or an unfamiliar fit, returns the
 * content box unchanged — never throws, never returns a degenerate negative box.
 */
export function fitPaintedBox(
  content: Box,
  intrinsic: { width: number; height: number } | null | undefined,
  fit: ObjectFit | string | null | undefined,
  positionX = 0.5,
  positionY = 0.5,
): Box {
  const cx = Number(content?.x), cy = Number(content?.y);
  const cw = Number(content?.width), ch = Number(content?.height);
  const base: Box = {
    x: Number.isFinite(cx) ? cx : 0,
    y: Number.isFinite(cy) ? cy : 0,
    width: Number.isFinite(cw) && cw > 0 ? cw : 0,
    height: Number.isFinite(ch) && ch > 0 ? ch : 0,
  };
  const iw = Number(intrinsic?.width), ih = Number(intrinsic?.height);
  // Only 'contain' and 'scale-down' letterbox. 'fill', 'cover', 'none', or an unknown
  // value paints (or overflows) the whole content box, so leave it as the content box.
  const letterboxes = fit === 'contain' || fit === 'scale-down';
  if (!letterboxes || !(iw > 0) || !(ih > 0) || base.width === 0 || base.height === 0) return base;

  let scale = Math.min(base.width / iw, base.height / ih);
  if (fit === 'scale-down') scale = Math.min(1, scale); // never upscale
  const pw = iw * scale, ph = ih * scale;
  const fx = Math.min(1, Math.max(0, Number.isFinite(positionX) ? positionX : 0.5));
  const fy = Math.min(1, Math.max(0, Number.isFinite(positionY) ? positionY : 0.5));
  return {
    x: base.x + (base.width - pw) * fx,
    y: base.y + (base.height - ph) * fy,
    width: pw,
    height: ph,
  };
}

/**
 * Is this mark big enough to be a logo rather than a UI icon? Measured floor: no confirmed
 * or human-found logo in the labelled set has a longer edge below 24px, while header search
 * / menu / social glyphs are 16-20px squares. Defensive: non-finite dimensions are not a
 * logo.
 */
export function isLogoSized(width: unknown, height: unknown, minLongEdge = 24): boolean {
  const w = Number(width), h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  return Math.max(w, h) >= minLongEdge;
}

// Serialized twins, injected into page.evaluate so the browser runs identical code.
// Order matters only for readability; none reference each other.
export const LOGO_HEURISTICS_SOURCE: string = [
  isHomeHref,
  classifyContextByPosition,
  thirdPartyBrandFromAlt,
  positionFraction,
  fitPaintedBox,
  isLogoSized,
].map((fn) => fn.toString()).join('\n\n');
