export type TokenScope = 'site' | 'section' | 'page';

export interface CoverageEntry {
  family: string;
  token: string;
  pages: number;
  coverage: number;
  scope: TokenScope;
}

export interface CoverageFamily {
  tokens: number;
  meanCoverage: number;
  pageLocal: number;
}

export interface CoverageSummary {
  totalPages: number;
  score: number;
  byFamily: Record<string, CoverageFamily>;
  outliers: CoverageEntry[];
}

export const OUTLIERS_PER_FAMILY = 5;
const FAMILY_ORDER = ['color', 'typography', 'spacing', 'radius', 'border', 'shadow'];
const familyRank = (f: string) => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? FAMILY_ORDER.length : i; };

/** Every page is site-wide, one page is page-local, anything between is a section. */
export function scopeOf(pages: number, totalPages: number): TokenScope {
  if (totalPages <= 1 || pages >= totalPages) return 'site';
  return pages <= 1 ? 'page' : 'section';
}

export function coverageEntry(family: string, token: string, pages: number, totalPages: number): CoverageEntry {
  const bounded = Math.max(0, Math.min(pages, totalPages));
  return {
    family,
    token,
    pages: bounded,
    coverage: totalPages > 0 ? round(bounded / totalPages) : 0,
    scope: scopeOf(bounded, totalPages),
  };
}

/**
 * The score is the mean of family means, so two hundred colours cannot drown
 * four radii. Outliers are the page-local tokens, capped per family so one
 * literal-keyed family such as borders cannot fill the list.
 */
export function summarizeCoverage(entries: CoverageEntry[], totalPages: number): CoverageSummary | null {
  if (totalPages <= 1 || entries.length === 0) return null;

  const byFamily: Record<string, CoverageFamily> = {};
  for (const entry of entries) {
    const family = (byFamily[entry.family] ??= { tokens: 0, meanCoverage: 0, pageLocal: 0 });
    family.tokens++;
    family.meanCoverage += entry.coverage;
    if (entry.scope === 'page') family.pageLocal++;
  }
  const families = Object.values(byFamily);
  for (const family of families) family.meanCoverage = round(family.meanCoverage / family.tokens);
  const score = Math.round((families.reduce((sum, f) => sum + f.meanCoverage, 0) / families.length) * 100);

  const perFamily = new Map<string, number>();
  const outliers = entries
    .filter((e) => e.scope === 'page')
    .sort((a, b) => familyRank(a.family) - familyRank(b.family) || a.family.localeCompare(b.family) || a.token.localeCompare(b.token))
    .filter((e) => {
      const n = (perFamily.get(e.family) ?? 0) + 1;
      perFamily.set(e.family, n);
      return n <= OUTLIERS_PER_FAMILY;
    });

  return { totalPages, score, byFamily, outliers };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
