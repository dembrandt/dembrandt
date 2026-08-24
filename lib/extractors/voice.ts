import type { Page } from 'playwright';
import type { VoiceFragment, VoiceRole } from '../types.js';

const ROLE_LIMITS: Record<VoiceRole, number> = {
  'meta-title': 1,
  'meta-description': 1,
  'hero-h1': 1,
  'hero-body': 2,
  cta: 6,
  'nav-label': 8,
  'section-h2': 8,
  'section-body-lede': 6,
  'value-prop': 3,
  claim: 6,
  'social-proof': 4,
  differentiator: 2,
  'form-label': 8,
  'form-placeholder': 8,
  'error-404-h1': 1,
  'error-404-body': 2,
  'footer-legal': 1,
};

export interface VoiceExtractionConfig {
  roleLimits: Record<VoiceRole, number>;
  bodyTruncateWords: number;
  minProseWords: number;
  errorPageOnly: boolean;
  /** Emit selectorHint. Off by default: it is debug weight nothing consumes. */
  debug: boolean;
}

export const DEFAULT_VOICE_CONFIG: VoiceExtractionConfig = {
  roleLimits: ROLE_LIMITS,
  bodyTruncateWords: 40,
  minProseWords: 8,
  errorPageOnly: false,
  debug: false,
};

export async function extractVoice(
  page: Page,
  config: VoiceExtractionConfig = DEFAULT_VOICE_CONFIG,
): Promise<VoiceFragment[]> {
  return await page.evaluate((cfg: VoiceExtractionConfig) => {
    const out: VoiceFragment[] = [];
    const counts = new Map<VoiceRole, number>();
    const seen = new Set<string>();

    const normalize = (raw: string): string => raw.replace(/\s+/g, ' ').trim();
    const wordsOf = (text: string): string[] => (text ? text.split(' ').filter(Boolean) : []);

    const truncate = (text: string, maxWords: number): string => {
      const words = wordsOf(text);
      return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ');
    };

    const hintFor = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
      const parent = el.parentElement ? `${el.parentElement.tagName.toLowerCase()} > ` : '';
      return `${parent}${tag}${id}${cls}`;
    };

    const EXCLUDED_CLOSEST = [
      '[hidden]',
      '[aria-hidden="true"]',
      '[data-nosnippet]',
      'script',
      'style',
      'noscript',
      'template',
      'nav[aria-label*="readcrumb"]',
      '[class*="cookie" i]',
      '[class*="consent" i]',
      '[id*="cookie" i]',
      '[id*="consent" i]',
      '[class*="gdpr" i]',
      '[class*="chat-widget" i]',
      '[class*="intercom" i]',
      '[class*="drift-" i]',
      '[class*="skip-link" i]',
      '[class*="sr-only" i]',
      '[class*="visually-hidden" i]',
      '[class*="screen-reader" i]',
      '[class*="pagination" i]',
      '[class*="lang-switch" i]',
      '[class*="language-select" i]',
    ].join(',');

    const isExcluded = (el: Element): boolean => {
      try {
        return el.closest(EXCLUDED_CLOSEST) !== null;
      } catch {
        return false;
      }
    };

    const isVisible = (el: Element): boolean => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const usable = (el: Element): boolean => !isExcluded(el) && isVisible(el);

    const push = (role: VoiceRole, rawText: string, el: Element | null, truncateTo?: number): void => {
      const used = counts.get(role) ?? 0;
      if (used >= (cfg.roleLimits[role] ?? 0)) return;

      let text = normalize(rawText);
      if (!text) return;
      if (truncateTo) text = truncate(text, truncateTo);

      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const fragment: VoiceFragment = { role, text, order: used };
      if (cfg.debug) fragment.selectorHint = el ? hintFor(el) : role;
      out.push(fragment);
      counts.set(role, used + 1);
    };

    const metaContent = (selector: string): string =>
      document.querySelector(selector)?.getAttribute('content') ?? '';

    if (!cfg.errorPageOnly) {
      push('meta-title', document.title || metaContent('meta[property="og:title"]'), null);
      push(
        'meta-description',
        metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]'),
        null,
      );
    }

    interface Block {
      el: Element;
      text: string;
      words: number;
      fontSize: number;
      top: number;
      inFirstViewport: boolean;
    }

    const viewportHeight = window.innerHeight || 800;
    const blocks: Block[] = [];

    const candidates = document.querySelectorAll(
      'h1, h2, h3, p, li, blockquote, figcaption, span, div, a, strong, em',
    );

    for (const el of Array.from(candidates)) {
      if (!usable(el)) continue;

      const hasElementChildWithText = Array.from(el.children).some(
        (child) => (child.textContent ?? '').trim().length > 0,
      );
      if (hasElementChildWithText) continue;

      const text = normalize(el.textContent ?? '');
      if (!text) continue;

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const top = rect.top + window.scrollY;

      blocks.push({
        el,
        text,
        words: wordsOf(text).length,
        fontSize: parseFloat(style.fontSize) || 0,
        top,
        inFirstViewport: top < viewportHeight,
      });
    }

    const firstScreen = blocks.filter((b) => b.inFirstViewport);
    const byType = [...firstScreen].sort((a, b) => b.fontSize - a.fontSize || a.top - b.top);
    const heroHeading = byType.find((b) => b.words >= 2);

    if (cfg.errorPageOnly) {
      if (heroHeading) push('error-404-h1', heroHeading.text, heroHeading.el);
      const errBody = firstScreen
        .filter((b) => b.el !== heroHeading?.el && b.words >= 4)
        .sort((a, b) => a.top - b.top);
      for (const b of errBody) push('error-404-body', b.text, b.el, cfg.bodyTruncateWords);
      return out;
    }

    if (heroHeading) {
      push('hero-h1', heroHeading.text, heroHeading.el);

      const heroBody = firstScreen
        .filter((b) => b.el !== heroHeading.el)
        .filter((b) => b.fontSize < heroHeading.fontSize && b.words >= cfg.minProseWords)
        .sort((a, b) => a.top - b.top);

      for (const b of heroBody) push('hero-body', b.text, b.el, cfg.bodyTruncateWords);
    }

    const ctaNodes = document.querySelectorAll(
      'button, [role="button"], a.btn, a[class*="button" i], a[class*="cta" i], input[type="submit"]',
    );
    for (const el of Array.from(ctaNodes)) {
      if (!usable(el)) continue;
      const text = el instanceof HTMLInputElement ? el.value : (el.textContent ?? '');
      const words = wordsOf(normalize(text)).length;
      if (words < 1 || words > 8) continue;
      push('cta', text, el);
    }

    const navRoot = document.querySelector('header nav, nav, header');
    if (navRoot) {
      for (const el of Array.from(navRoot.querySelectorAll('a'))) {
        if (!usable(el)) continue;
        const words = wordsOf(normalize(el.textContent ?? '')).length;
        if (words < 1 || words > 5) continue;
        push('nav-label', el.textContent ?? '', el);
      }
    }

    const headings = Array.from(document.querySelectorAll('h2')).filter(usable);
    for (const h of headings) push('section-h2', h.textContent ?? '', h);

    const proofNodes = document.querySelectorAll(
      'blockquote, [class*="testimonial" i], [class*="review" i], [class*="quote" i], figure figcaption',
    );
    for (const el of Array.from(proofNodes)) {
      if (!usable(el)) continue;
      push('social-proof', el.textContent ?? '', el, cfg.bodyTruncateWords);
    }

    const DIFFERENTIATOR_HEADING = /why\s+(us|choose|we)|what\s+makes|our\s+(approach|difference|promise)/i;
    for (const h of Array.from(document.querySelectorAll('h1, h2, h3'))) {
      if (!usable(h)) continue;
      if (!DIFFERENTIATOR_HEADING.test(h.textContent ?? '')) continue;
      const headingTop = h.getBoundingClientRect().top + window.scrollY;
      const body = blocks
        .filter((b) => b.top > headingTop && b.words >= 5)
        .sort((a, b) => a.top - b.top)[0];
      if (body) push('differentiator', body.text, body.el, cfg.bodyTruncateWords);
    }

    const FIRST_PERSON_CLAIM = /\b(we|our|we're|we've)\s+\w+/i;
    for (const b of blocks) {
      if (b.words < cfg.minProseWords) continue;
      if (!FIRST_PERSON_CLAIM.test(b.text)) continue;
      push('value-prop', b.text, b.el, cfg.bodyTruncateWords);
    }

    const CLAIM_PATTERN =
      /\b(best|fastest|largest|leading|only|first|#1|no\.?\s?1|most|world['’]s|\d+x|\d{2,}[%+]|trusted by|used by|award[- ]winning)\b/i;
    for (const b of blocks) {
      if (b.words < 3) continue;
      if (!CLAIM_PATTERN.test(b.text)) continue;
      push('claim', b.text, b.el, cfg.bodyTruncateWords);
    }

    for (const h of headings) {
      const headingTop = h.getBoundingClientRect().top + window.scrollY;
      const lede = blocks
        .filter((b) => b.top > headingTop && b.words >= cfg.minProseWords)
        .sort((a, b) => a.top - b.top)[0];
      if (lede) push('section-body-lede', lede.text, lede.el, cfg.bodyTruncateWords);
    }

    for (const el of Array.from(document.querySelectorAll('label'))) {
      if (!usable(el)) continue;
      push('form-label', el.textContent ?? '', el);
    }

    for (const el of Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]'))) {
      if (!usable(el)) continue;
      push('form-placeholder', el.getAttribute('placeholder') ?? '', el);
    }

    const footer = document.querySelector('footer');
    if (footer) {
      const legal = Array.from(footer.querySelectorAll('p, span, div, small')).find(
        (el) =>
          usable(el) &&
          /©|copyright|all rights reserved|\bOy\b|\bAb\b|\bInc\b|\bLtd\b|\bGmbH\b/i.test(el.textContent ?? ''),
      );
      if (legal) push('footer-legal', legal.textContent ?? '', legal, cfg.bodyTruncateWords);
    }

    return out;
  }, config);
}
