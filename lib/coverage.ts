/**
 * Token coverage across a crawl.
 *
 * A merged multi-page extraction says a token exists. Coverage says how much of
 * the site agrees with it, which is what separates a design system from one
 * page's improvisation.
 */

export type TokenScope = 'site' | 'section' | 'page';

export interface CoverageEntry {
  family: string;
  token: string;
  pages: number;
  coverage: number;
  scope: TokenScope;
}

export interface CoverageSummary {
  totalPages: number;
  score: number;
  byFamily: Record<string, { tokens: number; meanCoverage: number; pageLocal: number }>;
  outliers: CoverageEntry[];
}

/** A token every page uses is site-wide; one page only is page-local. */
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
    coverage: totalPages > 0 ? bounded / totalPages : 0,
    scope: scopeOf(bounded, totalPages),
  };
}

const MAX_OUTLIERS = 20;

/**
 * Mean coverage per family, then averaged across families, so a site with two
 * hundred colours and four radii is not scored on its colours alone. Counted,
 * not weighted by opinion.
 */
export function summarizeCoverage(entries: CoverageEntry[], totalPages: number): CoverageSummary | null {
  if (totalPages <= 1 || entries.length === 0) return null;

  const byFamily: CoverageSummary['byFamily'] = {};
  for (const entry of entries) {
    const family = (byFamily[entry.family] ??= { tokens: 0, meanCoverage: 0, pageLocal: 0 });
    family.tokens++;
    family.meanCoverage += entry.coverage;
    if (entry.scope === 'page') family.pageLocal++;
  }

  const families = Object.values(byFamily);
  for (const family of families) {
    family.meanCoverage = round(family.meanCoverage / family.tokens);
  }

  const score = Math.round(
    (families.reduce((sum, f) => sum + f.meanCoverage, 0) / families.length) * 100
  );

  const outliers = entries
    .filter(e => e.scope === 'page')
    .sort((a, b) => a.family.localeCompare(b.family) || a.token.localeCompare(b.token))
    .slice(0, MAX_OUTLIERS);

  return { totalPages, score, byFamily, outliers };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
