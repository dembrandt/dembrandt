// Pure, browser-free colour-classification heuristics. The element scan in
// colors.ts runs inside page.evaluate (an isolated browser realm that cannot
// import), so the same logic is mirrored inline there. This module is the
// single source of truth and is unit-tested; the inline copy must match it.
//
// Defensive by construction: every function tolerates malformed input and
// returns a safe value rather than throwing, so a single bad colour can never
// abort the surrounding extraction.

/**
 * Context keyword -> brand-intent weight. A colour seen on an element whose
 * class/id/tag contains one of these keywords gets at least this score, which
 * lifts genuine brand colours above the structural-noise threshold.
 *
 * Card / section / input / badge families were added so colours on repeated
 * content surfaces (cards, sections, inputs, badges) are not discarded as
 * structural noise the way unlabelled repeated colours otherwise are.
 */
export const CONTEXT_SCORES: Record<string, number> = {
  logo: 5, brand: 5, primary: 4, cta: 4, hero: 3, button: 3,
  card: 2, section: 2, feature: 2, panel: 2, input: 2, badge: 2, chip: 2,
  link: 2, header: 2, nav: 1,
};

/**
 * Status / feedback context. Colours that appear ONLY via these contexts are
 * treated as status UI, not brand identity (unless declared as a token or used
 * as a CTA background). "badge" is deliberately NOT here: brand badges/pills
 * are common (e.g. a teal "New" pill) and are real brand colour; genuine status
 * badges are caught by the warm-hue numbered-utility branch instead.
 */
export const STATUS_CONTEXT_SOURCE =
  '\\b(error|danger|destructive|invalid|warning|success|alert|notice|sale|discount|toast|notification)\\b' +
  '|(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret)-(?:red|rose|orange|amber|yellow)-\\d';

/** Build the status regex. Kept as a factory so callers (and page.evaluate) get a fresh instance. */
export function statusContextRegex(): RegExp {
  return new RegExp(STATUS_CONTEXT_SOURCE);
}

/**
 * HSV-style saturation of an opaque hex string. Returns 0 for black and for any
 * unparseable input (never NaN, never throws), so downstream comparisons are
 * always well-defined.
 * @param {string} hex e.g. "#1a2b3c"
 * @returns {number} 0..1
 */
export function saturationFromHex(hex: string): number {
  if (typeof hex !== 'string') return 0;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = m[1];
  const r = parseInt(n.substring(0, 2), 16);
  const g = parseInt(n.substring(2, 4), 16);
  const b = parseInt(n.substring(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * @typedef {Object} ColorStat
 * @property {number} count       elements the colour was seen on
 * @property {number} score       accumulated brand-intent score
 * @property {number} bgCount     times it appeared as a background-color
 * @property {boolean} isToken    declared as a :root design token
 * @property {string} normalizedHex  normalized "#rrggbb" (or raw string if not hex)
 * @property {boolean} [isTransparent] fully transparent / none
 */

/**
 * Decide whether a colour is structural noise (page chrome / layout fill) rather
 * than brand identity. Tokens are never structural. The high-usage rule now only
 * fires for near-neutral colours: a saturated colour at high coverage is a brand
 * fill (a coloured section/card), not noise.
 *
 * @param {ColorStat} data
 * @param {number} totalElements
 * @returns {boolean}
 */
export function classifyStructural(
  data: { count: number; score: number; bgCount: number; isToken?: boolean; normalizedHex: string; isTransparent?: boolean },
  totalElements: number,
): boolean {
  if (!data || data.isToken) return false;
  if (data.isTransparent) return true;
  const total = totalElements > 0 ? totalElements : 1;
  const usagePercent = (data.count / total) * 100;
  const saturation = saturationFromHex(data.normalizedHex);

  // Near-neutral colour covering a huge share of elements with little brand
  // intent: page background / layout fill. Saturated high-usage colour is a
  // deliberate brand fill and is kept.
  if (usagePercent > 40 && data.score < data.count * 1.2 && saturation <= 0.2) return true;

  // Saturated colour never used as a background and with low brand intent:
  // incidental decoration. (Backgrounds, i.e. bgCount > 0, are exempt — that is
  // how card/section fills survive.)
  if (data.bgCount === 0 && data.score < data.count * 1.5 && saturation > 0.3) return true;

  return false;
}
