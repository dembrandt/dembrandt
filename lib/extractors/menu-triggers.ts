// Pure helpers for the reveal pass. Kept browser-free so the
// navigation-guard contract can be unit-tested without spinning up a browser.
// The selector and predicate below are the single source of truth; the inline
// page.evaluate in index.ts mirrors isSafeMenuTrigger exactly.

/**
 * Elements that toggle a panel via JS (megamenus, dropdowns) rather than pure
 * CSS :hover. Pure :hover menus close when the pointer leaves and cannot be held
 * open for a batch re-scan, so they are deliberately excluded.
 */
export const MENU_TRIGGER_SELECTOR =
  '[aria-haspopup="true"], [aria-haspopup="menu"], [aria-expanded="false"], ' +
  'button[class*="menu"], button[class*="dropdown"], [class*="dropdown-toggle"], ' +
  '[class*="has-submenu"] > button, nav button';

/**
 * "Next" controls of common carousel/slider libraries. Clicking these advances
 * the carousel so lazily-rendered or off-screen slides mount and their colours
 * become visible to a re-scan. Labelled brand colours were observed inside
 * `swiper-slide` elements, so carousel internals carry real brand identity.
 * Covers Swiper, Slick, Bootstrap, Splide, Glide, Flickity and ARIA carousels.
 */
export const CAROUSEL_NEXT_SELECTOR =
  '.swiper-button-next, .slick-next, .carousel-control-next, .splide__arrow--next, ' +
  '.flickity-button.next, [data-glide-dir=">"], ' +
  '[aria-roledescription="carousel"] button[aria-label*="next" i], ' +
  'button[class*="carousel"][class*="next"], button[class*="slider"][class*="next"]';

/**
 * True when clicking the element is safe — it will not navigate away and
 * destroy the page execution context. Anchors with a real href navigate; a
 * missing href, "#", or an in-page fragment ("#section") does not.
 *
 * @param {string} tagName lowercased or uppercased tag name
 * @param {string | null | undefined} href the href attribute, if any
 * @returns {boolean}
 */
export function isSafeMenuTrigger(tagName: string, href: string | null | undefined): boolean {
  const isFragment = !href || href === "#" || href.startsWith("#");
  if (!isFragment) return false; // any element with a real href navigates on click
  if (tagName.toLowerCase() === "a" && href && href !== "#" && !href.startsWith("#")) return false;
  return true;
}
