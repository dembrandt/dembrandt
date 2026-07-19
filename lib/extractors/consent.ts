import type { Frame, Page } from 'playwright';

/**
 * Cookie/consent dismissal.
 *
 * The banner is not always in the main document. Two common cases were
 * previously unreachable:
 *
 *  - iframe-hosted CMPs (Sourcepoint `sp_message_iframe_*`, TrustArc,
 *    Quantcast, Cookiebot's dialog) live in a child frame, so a
 *    `page.evaluate` on the top document never sees the button.
 *  - shadow-DOM CMPs (Usercentrics, Osano, CookieYes) put the button inside
 *    an open shadow root, where `document.querySelector` does not reach.
 *
 * Both leave the overlay up, and the extractors then read the overlay's
 * palette and type as if it were the site's. So: sweep every frame, and
 * pierce open shadow roots in each.
 */

const ACCEPT_SELECTORS = [
  // Generic accept patterns
  'button[id*="accept"]', 'button[class*="accept"]',
  'button[id*="agree"]', 'button[class*="agree"]',
  'button[id*="consent"]', 'button[class*="consent"]',
  '[data-testid*="accept"]', '[data-testid*="agree"]',
  // Common consent libraries
  '#onetrust-accept-btn-handler',
  '.cc-btn.cc-allow', '.cc-accept',
  '[aria-label*="Accept"]', '[aria-label*="agree"]',
  // EU/GDPR common patterns
  'button[data-cookiebanner]',
  '.cookiebanner button', '#cookiebanner button',
  '[class*="cookie"] button[class*="primary"]',
  '[id*="cookie"] button[class*="primary"]',
  '[class*="gdpr"] button', '[id*="gdpr"] button',
  // CMP patterns — main document
  '.sp-message-open .message-button',
  '#sp-cc-accept', '.optanon-allow-all',
  // CMP patterns — inside the CMP's own iframe, where the wrapper class above
  // does not exist and the button stands alone
  '.message-button', '.sp_choice_type_11',
  '#truste-consent-button', '.trustarc-agree-btn',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  // Shadow-DOM CMPs — these ids/classes only resolve once the shadow root is
  // pierced, which the deep query below does
  '#uc-btn-accept-banner', '[data-testid="uc-accept-all-button"]',
  '.osano-cm-accept-all', '.cky-btn-accept',
];

// Last resort inside a frame that looks like a consent surface: match the
// button by its label. Scoped to affirmative-only text so we never click
// "Reject all" or "Manage preferences" (which opens a second overlay).
const ACCEPT_TEXT = /^(accept|allow|agree|i agree|got it|ok|okay|understood|continue)\b/i;
const REJECT_TEXT = /\b(reject|decline|deny|manage|settings|preferences|customi[sz]e|options|necessary only|more info)\b/i;

/**
 * Runs inside the page/frame — Playwright serializes this function, so it must
 * stay self-contained and reference nothing from module scope. Returns the
 * selector that was clicked, or null.
 */
function dismissInFrame(
  { selectors, acceptSrc, rejectSrc }: { selectors: string[]; acceptSrc: string; rejectSrc: string }
): string | null {
  const MAX_NODES = 4000;   // bound the shadow walk on pathological DOMs
  const MAX_DEPTH = 6;      // shadow roots nest, but not deeply in practice
  const TEXT_CAP = 60;

  const isVisible = (el: Element): boolean => {
    try {
      const h = el as HTMLElement;
      return h.offsetParent !== null ||
        (typeof h.getClientRects === 'function' && h.getClientRects().length > 0);
    } catch { return false; }
  };
  const safeClick = (el: Element): boolean => {
    try {
      if (typeof (el as HTMLElement).click === 'function') {
        (el as HTMLElement).click();
        return true;
      }
    } catch {}
    return false;
  };

  // Every root worth searching: the document plus each open shadow root.
  const roots: (Document | ShadowRoot)[] = [document];
  let budget = MAX_NODES;
  const collect = (root: Document | ShadowRoot, depth: number): void => {
    if (depth > MAX_DEPTH || budget <= 0) return;
    let all: Element[] = [];
    try { all = Array.from(root.querySelectorAll('*')); } catch { return; }
    for (const el of all) {
      if (budget-- <= 0) return;
      const sr = (el as HTMLElement).shadowRoot;   // null for closed roots
      if (sr) { roots.push(sr); collect(sr, depth + 1); }
    }
  };
  try { collect(document, 0); } catch {}

  for (const sel of selectors) {
    for (const root of roots) {
      try {
        const el = root.querySelector(sel);
        if (el && isVisible(el) && safeClick(el)) return sel;
      } catch {}
    }
  }

  // Text fallback. Only inside a frame/root that actually looks like consent
  // UI, so an ordinary "Continue" button on the site is never clicked.
  let looksLikeConsent = false;
  try {
    const hay = (document.body?.innerText || '').slice(0, 4000);
    looksLikeConsent = /cookie|consent|gdpr|privacy|tracking/i.test(hay);
  } catch {}
  if (!looksLikeConsent) return null;

  const accept = new RegExp(acceptSrc, 'i');
  const reject = new RegExp(rejectSrc, 'i');
  for (const root of roots) {
    let candidates: Element[] = [];
    try {
      candidates = Array.from(
        root.querySelectorAll('button, a[role="button"], [role="button"], input[type="submit"], input[type="button"]')
      ).slice(0, 80);
    } catch { continue; }
    for (const el of candidates) {
      try {
        if (!isVisible(el)) continue;
        const raw = el.textContent || (el as HTMLInputElement).value ||
          el.getAttribute('aria-label') || '';
        const text = String(raw).trim().replace(/\s+/g, ' ').slice(0, TEXT_CAP);
        if (!text || !accept.test(text) || reject.test(text)) continue;
        if (safeClick(el)) return `text:${text}`;
      } catch {}
    }
  }
  return null;
}

/**
 * Try the main document first, then every child frame. Returns a label for the
 * dismissal that succeeded, or null if no banner was found. Never throws: a
 * click can navigate the page and destroy the execution context, which is a
 * successful dismissal, not a failure.
 */
export async function dismissConsent(page: Page): Promise<string | null> {
  let frames: Frame[] = [];
  try { frames = page.frames(); } catch { frames = []; }

  // frames[0] is the main frame, so the main document is tried first and a
  // top-level banner still wins before any iframe is touched.
  for (const frame of frames) {
    let hit: string | null = null;
    try {
      hit = await frame.evaluate(dismissInFrame, {
        selectors: ACCEPT_SELECTORS,
        acceptSrc: ACCEPT_TEXT.source,
        rejectSrc: REJECT_TEXT.source,
      });
    } catch {
      // Detached frame, cross-origin eval refusal, or a click that navigated
      // the page and destroyed the execution context. Only the last is a
      // dismissal, and it is indistinguishable here — so keep sweeping the
      // remaining frames rather than claiming either outcome.
      continue;
    }
    if (hit) return frame === frames[0] ? hit : `frame:${hit}`;
  }
  return null;
}
