/**
 * Who an extraction is about: brand, site, market, environment.
 *
 * Site is the stable baseline identity; a name is presentation. Storage and
 * baselines key on `siteId`, which never changes, so renaming a site in the UI
 * can never move blobs or orphan its drift history.
 *
 * Identity is the only block in the output a human writes. Everything else is
 * measured. It is therefore stated, never inferred beyond the `derived` fallback,
 * and `source` says per field which of the two produced it.
 */

import { checkSchemaCompatibility } from './version.js';

/** `unset` marks a field nothing supplied, which only `brand` can be. */
export type IdentitySource = 'flag' | 'config' | 'derived' | 'unset';

/**
 * Where each field came from. Per field, not per identity: a run can take its
 * site from config and its environment from a flag, and one summary value would
 * have to lie about one of them.
 */
export interface IdentitySources {
  brand: IdentitySource;
  site: IdentitySource;
  market: IdentitySource;
  environment: IdentitySource;
}

export interface Identity {
  brand: string | null;
  site: string;
  /** Country or language edition, null when the site has only one. */
  market: string | null;
  environment: string;
  /** Null when the run declared no profile: it is then its own one-off. */
  profile: string | null;
  source: IdentitySources;
  /** Stable key for storage and baselines. Names are labels and may be edited. */
  siteId: string;
}

/**
 * One region of URL space a site owns, and the variant coordinates it implies.
 *
 * A bare string is the common case. The object form is what makes country sites
 * expressible: `acme.de` and `acme.fr` are one site because they must be
 * comparable to each other, but they hold separate baselines because they drift
 * apart on their own. Market and environment are independent, since a country
 * site has a staging of its own.
 */
export type ScopeEntry =
  | string
  | { pattern: string; market?: string; environment?: string };

export interface SiteConfig {
  name: string;
  id?: string;
  brand?: string;
  /**
   * Origins and origin+path prefixes this site owns, e.g. "acme.com/app". A
   * leading `*.` covers every subdomain, so one design system spanning
   * app/docs/www is one entry; a named subdomain elsewhere still wins over it.
   */
  scope: ScopeEntry[];
}

/**
 * A named, repeatable way of measuring a site: which pages, which flags.
 *
 * Not part of identity. Identity is what the extraction is about, a profile is
 * how it was made, and two runs made differently are not comparable, so each
 * profile carries its own baseline. The name is what a portfolio shows; the
 * declared flags are what a run is checked against.
 */
export interface RunProfile {
  name: string;
  /** Paths to extract, which must fall inside the site's scope. */
  paths?: string[];
  /** Flags the run is expected to carry, e.g. { crawl: 5, voice: true }. */
  flags?: Record<string, unknown>;
}

export interface IdentityConfig {
  brand?: string;
  sites: SiteConfig[];
  profiles?: RunProfile[];
}

export interface IdentityOverrides {
  brand?: string;
  site?: string;
  market?: string;
  environment?: string;
  profile?: string;
}

const DEFAULT_ENVIRONMENT = 'production';

/** Rank offset that makes any exact-host match outrank any wildcard match. */
const HOST_EXACT = 1000;

/**
 * The canonical host key: hostname without `www.`, 'unknown' when unparseable.
 * Every surface that keys by host calls this, so a run cannot be filed under one
 * key by the CLI and a different one by a formatter.
 */
export function siteKeyOf(url: string | null | undefined): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

interface Scope {
  host: string;
  path: string;
  wildcard: boolean;
  market: string | null;
  environment: string | null;
}

function normalizeScope(entry: ScopeEntry): Scope | null {
  const { pattern, market = null, environment = null } =
    typeof entry === 'string' ? { pattern: entry } as { pattern: string; market?: string; environment?: string } : entry;

  let trimmed = (pattern || '').trim();
  if (!trimmed) return null;
  const wildcard = trimmed.startsWith('*.');
  if (wildcard) trimmed = trimmed.slice(2);
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return {
      host: u.hostname.replace(/^www\./, ''),
      path: u.pathname.replace(/\/+$/, ''),
      wildcard,
      market,
      environment,
    };
  } catch {
    return null;
  }
}

/**
 * Specificity of `scope` against `url`, or -1 for no match. An exact host
 * outranks any wildcard, and among equals the longer path prefix wins. A path
 * matches only on a segment boundary, so `/app` does not claim `/application`.
 */
function scopeMatch(scope: Scope, url: string): number {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return -1;
  }
  const host = target.hostname.replace(/^www\./, '');
  const exact = host === scope.host;
  if (!exact && !(scope.wildcard && host.endsWith('.' + scope.host))) return -1;

  const targetPath = target.pathname.replace(/\/+$/, '');
  if (scope.path && targetPath !== scope.path && !targetPath.startsWith(scope.path + '/')) return -1;

  return (exact ? HOST_EXACT : 0) + scope.path.length;
}

export interface SiteMatch {
  site: SiteConfig;
  /** The winning scope entry, which carries the market and environment. */
  scope: Scope;
  specificity: number;
  /** Other sites tying at the same specificity. Non-empty means the config is
   *  ambiguous for this url; `site` is still the first one configured. */
  ambiguous: SiteConfig[];
}

/**
 * The site whose scope matches `url` most specifically, ranked by exact host,
 * then longest path prefix, then configuration order. A tie between two sites is
 * reported rather than silently broken.
 */
export function matchSite(config: IdentityConfig | null, url: string): SiteMatch | null {
  if (!config?.sites?.length) return null;

  let best: SiteMatch | null = null;
  const tied: SiteConfig[] = [];

  for (const site of config.sites) {
    for (const entry of site.scope || []) {
      const scope = normalizeScope(entry);
      if (!scope) continue;
      const specificity = scopeMatch(scope, url);
      if (specificity < 0) continue;

      if (!best || specificity > best.specificity) {
        best = { site, scope, specificity, ambiguous: [] };
        tied.length = 0;
      } else if (specificity === best.specificity && site !== best.site && !tied.includes(site)) {
        tied.push(site);
      }
    }
  }

  if (best) best.ambiguous = tied;
  return best;
}

/**
 * Resolve the identity to stamp on a run. Precedence is per field: a flag beats
 * config, config beats derivation, and each field is decided on its own.
 */
export function resolveIdentity(
  url: string,
  overrides: IdentityOverrides = {},
  config: IdentityConfig | null = null,
): Identity {
  const matched = overrides.site
    ? matchByName(config, overrides.site)
    : matchSite(config, url);

  const pick = <T>(flag: T | undefined, fromConfig: T | null | undefined, derived: T | null) =>
    flag !== undefined
      ? ([flag, 'flag'] as const)
      : fromConfig != null
        ? ([fromConfig, 'config'] as const)
        : ([derived, derived == null ? 'unset' : 'derived'] as const);

  const [site, siteSource] = pick(overrides.site, matched?.site.name, siteKeyOf(url));
  const [market, marketSource] = pick(overrides.market, matched?.scope.market, null);
  const [environment, environmentSource] = pick(
    overrides.environment, matched?.scope.environment, DEFAULT_ENVIRONMENT);
  const [brand, brandSource] = pick(
    overrides.brand, matched?.site.brand ?? config?.brand, null);

  return {
    brand,
    site: site as string,
    market,
    environment: environment as string,
    profile: overrides.profile ?? null,
    source: {
      brand: brandSource,
      site: siteSource,
      market: marketSource,
      environment: environmentSource,
    },
    siteId: matched?.site.id ?? siteKeyOf(url),
  };
}

/** A named site still needs a scope entry, for the market it implies. */
function matchByName(config: IdentityConfig | null, name: string): SiteMatch | null {
  const site = config?.sites?.find(s => s.name === name);
  if (!site) return null;
  const scope = (site.scope || []).map(normalizeScope).find((s): s is Scope => s !== null);
  return scope ? { site, scope, specificity: -1, ambiguous: [] } : null;
}

/**
 * A `--site` naming no configured site is an error, not a new site. A typo would
 * otherwise silently start an empty baseline history and report zero drift.
 */
export function validateOverrides(
  config: IdentityConfig | null,
  overrides: IdentityOverrides,
): string | null {
  if (overrides.site && config?.sites?.length && !config.sites.some(s => s.name === overrides.site)) {
    return `Unknown site "${overrides.site}". Configured sites: ${config.sites.map(s => s.name).join(', ')}`;
  }
  if (overrides.profile && config?.profiles?.length && !config.profiles.some(p => p.name === overrides.profile)) {
    return `Unknown profile "${overrides.profile}". Configured profiles: ${config.profiles.map(p => p.name).join(', ')}`;
  }
  return null;
}

/**
 * A profile's paths must fall inside its site's scope. Both list paths, so both
 * can disagree, and a profile pointing outside its site would file a measurement
 * of one site under another.
 */
export function validateProfilePaths(site: SiteConfig, profile: RunProfile): string[] {
  const scopes = (site.scope || []).map(normalizeScope).filter((s): s is Scope => s !== null);
  if (!scopes.length) return [];

  return (profile.paths || [])
    .filter(path => !scopes.some(scope => {
      const host = scope.wildcard ? 'sub.' + scope.host : scope.host;
      const target = `https://${host}${path.startsWith('/') ? path : '/' + path}`;
      return scopeMatch(scope, target) >= 0;
    }))
    .map(path => `profile "${profile.name}" targets ${path}, outside site "${site.name}" scope.`);
}

/**
 * Flags a run actually carried versus the ones its profile declares. A mismatch
 * makes the run incomparable to the profile's baseline, the same false-drift
 * problem `drift.ts` already warns about for --dark-mode and --mobile.
 */
export function profileFlagMismatch(
  profile: RunProfile | null | undefined,
  actual: Record<string, unknown> = {},
): string[] {
  if (!profile?.flags) return [];
  return Object.entries(profile.flags)
    .filter(([flag, want]) => String(actual[flag] ?? '') !== String(want))
    .map(([flag, want]) =>
      `profile "${profile.name}" declares ${flag}=${String(want)}, run has ` +
      `${flag}=${String(actual[flag] ?? 'unset')}; this run is not comparable to its baseline.`);
}

/**
 * The link between a saved baseline and the extraction it came from.
 *
 * This is the only part of the account model the CLI needs. Who may see a
 * site, who approved a deviation and which thresholds apply are the App's
 * data: the CLI never reads or writes them, and a public package should not
 * ship the shape of an account. Those are specified in `docs/identity.md`.
 *
 * What does belong here is the schema link. A baseline points at an
 * extraction, so the schema version that produced it has to travel with the
 * pointer, and the rule for reading that version has to sit next to
 * SCHEMA_VERSION instead of being rewritten downstream.
 */

/** A saved snapshot, plus the schema version that produced it. */
export interface SnapshotRef {
  snapshotId: string;
  /** meta.schemaVersion as written. Null for snapshots older than the contract. */
  schemaVersion: string | null;
  takenAt: string;
}

/**
 * What a run is compared against: an earlier snapshot, or a document such as a
 * brand guideline. A snapshot answers "did it change". A document answers "is
 * it right".
 */
export type ReferenceSource =
  | { kind: 'snapshot'; ref: SnapshotRef }
  | { kind: 'document'; documentId: string };

/**
 * Can this baseline still be compared against a fresh run?
 *
 * A document is always comparable. It states intent and has no schema version.
 *
 * A snapshot has one, and this is where it goes wrong quietly. The comparison
 * runs, the numbers look like numbers, and a value the extractor now measures
 * differently shows up as drift that never happened. Schema 1.14.0 moved
 * spacing, rem and the palette. 1.15.0 moved the scoring under them.
 *
 * The version check is `checkSchemaCompatibility`, not a copy of it here. Two
 * copies of that rule is how the App's version check drifted from the CLI's
 * before. This only adds what is specific to a baseline: a missing version is
 * worse than an old one, because nothing says what was measured.
 *
 * It reports, it does not decide. Blocking here would break a comparison the
 * user may still want to see.
 */
export function referenceComparability(
  reference: { source: ReferenceSource },
): { comparable: boolean; reason: string | null } {
  if (reference.source.kind === 'document') return { comparable: true, reason: null };

  const compat = checkSchemaCompatibility({
    meta: { schemaVersion: reference.source.ref.schemaVersion ?? undefined },
  });

  if (compat.status === 'legacy' || compat.status === 'unknown') {
    return {
      comparable: false,
      reason:
        'This baseline has no readable schema version, so there is no way to tell what it measured. ' +
        'Take a new baseline before reading a comparison against it.',
    };
  }

  return { comparable: compat.compatible, reason: compat.message };
}
