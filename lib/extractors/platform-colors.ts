/**
 * Platform-specific brand color hints extracted from HTML meta / link tags.
 *
 * All sources documented with real-world prevalence notes so priority decisions
 * are auditable without researching specs from scratch.
 *
 * Sources covered:
 *   theme-color          W3C / Chrome Android, Safari 15+, Edge — most common
 *   theme-color (dark)   Same tag with media="(prefers-color-scheme: dark)"
 *   mask-icon color      Safari pinned tab — explicit brand hex, high signal
 *   msapplication-*      IE11 / Windows pinned tiles — legacy but widespread
 *   apple-mobile-web-app-status-bar-style  iOS Safari — value is black|default|#hex
 *   og:image             Not a color, skip
 */

export interface PlatformColorHint {
  value: string;
  source: string;
  scheme?: 'light' | 'dark';
}

/**
 * Snapshot of the DOM fields we need. Passed in so the logic is pure and
 * unit-testable without a browser page object.
 */
export interface DomColorSnapshot {
  /** All <meta> elements serialized as { name, property, content, media } */
  metas: Array<{ name?: string; property?: string; content?: string; media?: string }>;
  /** All <link> elements serialized as { rel, href, color } */
  links: Array<{ rel?: string; href?: string; color?: string }>;
}

/** Run inside page.evaluate() to produce the snapshot. */
export const DOM_COLOR_SNAPSHOT_SCRIPT = `(() => {
  const metas = Array.from(document.querySelectorAll('meta')).map(m => ({
    name: m.getAttribute('name') || undefined,
    property: m.getAttribute('property') || undefined,
    content: m.getAttribute('content') || undefined,
    media: m.getAttribute('media') || undefined,
  }));
  const links = Array.from(document.querySelectorAll('link')).map(l => ({
    rel: l.getAttribute('rel') || undefined,
    href: l.getAttribute('href') || undefined,
    color: l.getAttribute('color') || undefined,
  }));
  return { metas, links };
})()`;

/**
 * Returns color hints ordered by trust: manifest (already handled upstream) >
 * explicit hex sources > inferred. Only includes entries with a non-empty value
 * that looks like a color (hex, rgb, named). Does NOT normalize — caller normalizes
 * via page.evaluate so CSS named colors resolve correctly.
 */
export function extractPlatformColors(snap: DomColorSnapshot): PlatformColorHint[] {
  const hints: PlatformColorHint[] = [];

  const addMeta = (name: string, source: string, scheme?: 'light' | 'dark') => {
    for (const m of snap.metas) {
      if (m.name?.toLowerCase() !== name.toLowerCase()) continue;
      const val = m.content?.trim();
      if (!val || val === 'yes' || val === 'no') continue;

      // For theme-color: respect media queries to distinguish light/dark
      if (name === 'theme-color' && m.media) {
        const media = m.media.toLowerCase();
        if (media.includes('dark')) {
          hints.push({ value: val, source, scheme: 'dark' });
        } else if (media.includes('light')) {
          hints.push({ value: val, source, scheme: 'light' });
        } else {
          hints.push({ value: val, source });
        }
      } else {
        hints.push({ value: val, source, ...(scheme ? { scheme } : {}) });
      }
    }
  };

  // 1. theme-color — covers all media variants in one pass
  addMeta('theme-color', 'meta:theme-color');

  // 2. Safari pinned tab — <link rel="mask-icon" color="#hex"> — explicit, high trust
  for (const l of snap.links) {
    if (l.rel?.toLowerCase().includes('mask-icon') && l.color?.trim()) {
      hints.push({ value: l.color.trim(), source: 'link:mask-icon' });
    }
  }

  // 3. Windows tile color
  addMeta('msapplication-TileColor', 'meta:msapplication-TileColor');
  addMeta('msapplication-navbutton-color', 'meta:msapplication-navbutton-color');

  // 4. iOS status bar — value is usually "black", "default", or "black-translucent",
  //    but some sites set a hex. Skip non-hex values — they carry no color information.
  for (const m of snap.metas) {
    if (m.name?.toLowerCase() !== 'apple-mobile-web-app-status-bar-style') continue;
    const val = m.content?.trim();
    if (val && /^#[0-9a-f]{3,8}$/i.test(val)) {
      hints.push({ value: val, source: 'meta:apple-status-bar' });
    }
  }

  return hints;
}

/**
 * Collapse hints into { themeColor, darkThemeColor, backgroundColor } using source
 * priority. Manifest values (already in manifestMeta upstream) take precedence — pass
 * them as `existing` so this function only fills gaps.
 */
export function resolvePlatformColors(
  hints: PlatformColorHint[],
  existing: { themeColor?: string; backgroundColor?: string },
): { themeColor?: string; darkThemeColor?: string; backgroundColor?: string } {
  const result: { themeColor?: string; darkThemeColor?: string; backgroundColor?: string } = {};

  // Priority order for light/unschemed theme color:
  // meta:theme-color (light/none) > link:mask-icon > msapplication-navbutton-color
  const lightOrder = ['meta:theme-color', 'link:mask-icon', 'meta:msapplication-navbutton-color'];
  const bgOrder = ['meta:msapplication-TileColor'];

  if (!existing.themeColor) {
    for (const src of lightOrder) {
      const match = hints.find(h => h.source === src && h.scheme !== 'dark');
      if (match) { result.themeColor = match.value; break; }
    }
  }

  // Dark variant — always populate if present, no upstream equivalent
  const darkMatch = hints.find(h => h.scheme === 'dark' && h.source === 'meta:theme-color');
  if (darkMatch) result.darkThemeColor = darkMatch.value;

  if (!existing.backgroundColor) {
    for (const src of bgOrder) {
      const match = hints.find(h => h.source === src);
      if (match) { result.backgroundColor = match.value; break; }
    }
  }

  return result;
}
