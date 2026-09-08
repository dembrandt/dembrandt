/**
 * Pill radii in computed styles.
 *
 * `border-radius: 9999px` and Tailwind's `rounded-full` both resolve to
 * Chromium's maximum length, which serializes as `3.35544e+07px`. Passed through
 * verbatim it reaches every output as scientific notation and outranks the real
 * radius scale, because it sorts as a 33-million-pixel value.
 */

export const PILL_RADIUS = '9999px';

/** Any authored radius at or above this is a pill, not a scale step. */
const PILL_THRESHOLD = 9999;

export interface RadiusValue {
  value: string;
  count: number;
  elements: string[];
  confidence: string;
  numericValue: number;
}

/** Collapse pill-sized components to a readable `9999px`. Percentages pass through. */
export function normalizeRadius(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.includes('%')) return raw;

  const parts = raw.split(/\s+/).map((part) => {
    const n = parseFloat(part);
    // Infinity is the far end of the same case, not an exception to it.
    return Number.isNaN(n) || n < PILL_THRESHOLD ? part : PILL_RADIUS;
  });

  return parts.every((part) => part === PILL_RADIUS) ? PILL_RADIUS : parts.join(' ');
}

/** Normalize and re-merge: two raw values can collapse to the same one. */
export function normalizeRadiusValues(values: RadiusValue[]): RadiusValue[] {
  const merged = new Map<string, RadiusValue & { contexts: Set<string> }>();

  for (const entry of values ?? []) {
    const value = normalizeRadius(entry.value);
    const existing = merged.get(value);

    if (existing) {
      existing.count += entry.count ?? 0;
      for (const context of entry.elements ?? []) existing.contexts.add(context);
      continue;
    }

    merged.set(value, {
      ...entry,
      value,
      count: entry.count ?? 0,
      contexts: new Set(entry.elements ?? []),
      elements: [],
      numericValue: parseFloat(value) || 0,
    });
  }

  return [...merged.values()]
    .map(({ contexts, ...entry }) => ({
      ...entry,
      elements: [...contexts].slice(0, 5),
      confidence: entry.count > 10 ? 'high' : entry.count > 3 ? 'medium' : 'low',
    }))
    .sort((a, b) => {
      if (a.value.includes('%') && !b.value.includes('%')) return 1;
      if (!a.value.includes('%') && b.value.includes('%')) return -1;
      return a.numericValue - b.numericValue;
    });
}
