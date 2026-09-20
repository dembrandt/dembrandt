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
 * Account-side rows. Types only: this module owns the shape, the store that
 * persists them lives in the App.
 *
 * They are exported from here rather than declared in the App because a stored
 * row points at an extraction, and the extraction's contract moves. Two copies
 * of the shape drift the moment SCHEMA_VERSION does, and the divergence is
 * silent — the App keeps reading a field the CLI stopped writing, or compares
 * against a reference recorded under a contract that no longer means the same
 * thing. One declaration, one place to change.
 *
 * None of this enters an extraction. `Identity` says what a snapshot is about;
 * these say who may see it, what it is judged against, and when.
 */

/**
 * A pointer to a stored snapshot that remembers which contract produced it.
 *
 * The version is the point. A reference or a waiver recorded under schema
 * 1.14.0 and read under 1.15.0 may be comparing values the extractor now
 * derives differently, and `checkSchemaCompatibility` can only say so if the
 * producing version travelled with the pointer.
 */
export interface SnapshotRef {
  snapshotId: string;
  /** meta.schemaVersion of the snapshot, as written. Null for pre-contract data. */
  schemaVersion: string | null;
  takenAt: string;
}

/** The measurable coordinate a row attaches to. */
export interface VariantKey {
  siteId: string;
  market: string | null;
  environment: string;
  profile: string;
}

/** Ownership axis. A role and a policy attach to one of these, never to a variant. */
export type ScopeRef =
  | { kind: 'account'; id: string }
  | { kind: 'client'; id: string }
  | { kind: 'brand'; id: string }
  | { kind: 'site'; id: string };

export type Role = 'owner' | 'editor' | 'viewer';

export interface Grant {
  userId: string;
  scope: ScopeRef;
  role: Role;
  grantedAt: string;
}

/**
 * Thresholds, inherited down the ownership axis rather than copied. A team that
 * owns its repo keeps them in `.dembrandtrc` beside the code; an agency owns
 * none of its clients' repos and needs one standard across them.
 */
export interface Policy {
  scope: ScopeRef;
  thresholds: Record<string, number>;
  validFrom: string;
}

/** What reaches a person, as opposed to what they may see. */
export interface Subscription {
  userId: string;
  scope: ScopeRef;
  events: string[];
}

/**
 * What a run is compared against: an earlier snapshot, or a document such as a
 * brand guideline. Same key, same role, different source.
 *
 * `validFrom` is what makes "was this right at the time" answerable. Without
 * it, accepting a new baseline overwrites the reason every earlier run passed.
 */
export type Reference = VariantKey & {
  validFrom: string;
  source: { kind: 'snapshot'; ref: SnapshotRef } | { kind: 'document'; documentId: string };
};

/**
 * An accepted deviation. The author and the expiry are not metadata: without an
 * author it is a mute button rather than an approval, and without an expiry it
 * outlives the campaign it was granted for.
 */
export type Waiver = VariantKey & {
  findingId: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
  reason: string;
};

/**
 * Whether a stored reference can still be compared against a fresh run, and
 * what to say when it cannot.
 *
 * A document reference is never invalidated by a contract change: it states
 * intent and has no producing version. A snapshot reference does, and it is
 * the case that fails quietly — the comparison still runs, the numbers still
 * look like numbers, and a value the extractor now derives differently reads
 * as drift the site never had. Schema 1.14.0 moved spacing, rem and the
 * palette; 1.15.0 moved the scoring underneath.
 *
 * The comparison itself is `checkSchemaCompatibility`, not a second copy of
 * it. Re-deriving "is this contract close enough" here is how the App's own
 * version check diverged from the CLI's before, and a private semver parse in
 * this module would be the same mistake with a different name. This adds only
 * the part that is specific to a reference: a document has no version, and a
 * pointer with no version at all is worse than an old one.
 *
 * Deliberately advisory. The caller decides whether to warn, re-baseline or
 * refuse; refusing here would break a comparison the user may still want.
 */
export function referenceComparability(
  reference: Pick<Reference, 'source'>,
): { comparable: boolean; reason: string | null } {
  if (reference.source.kind === 'document') return { comparable: true, reason: null };

  const compat = checkSchemaCompatibility({
    meta: { schemaVersion: reference.source.ref.schemaVersion ?? undefined },
  });

  // 'legacy' and 'unknown' both mean the contract cannot be established, which
  // for a baseline is worse than an old contract: nothing says what it measured.
  if (compat.status === 'legacy' || compat.status === 'unknown') {
    return {
      comparable: false,
      reason:
        'The baseline carries no readable schema version, so what it measured cannot be established. ' +
        'Re-baseline before reading a comparison against it.',
    };
  }

  return { comparable: compat.compatible, reason: compat.message };
}
