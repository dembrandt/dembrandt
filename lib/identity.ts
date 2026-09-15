/**
 * Who an extraction is about: brand, site, environment.
 *
 * Identity is the only block in the output a human writes. Everything else is
 * measured. It is therefore stated, never inferred from the hostname beyond the
 * `derived` fallback, and `source` says which of the two produced it.
 */

export type IdentitySource = 'config' | 'flag' | 'derived';

export interface Identity {
  brand: string | null;
  site: string;
  environment: string;
  /** Null when the run declared no profile: it is then its own one-off. */
  profile: string | null;
  source: IdentitySource;
  /** Stable key for storage and baselines. Names are labels and may be edited. */
  siteId: string;
}

export interface SiteConfig {
  name: string;
  id?: string;
  brand?: string;
  /**
   * Origins and origin+path prefixes this site owns, e.g. "acme.com/app". A
   * leading `*.` covers every subdomain, so one design system spanning
   * app/docs/www is one entry; a named subdomain elsewhere still wins over it.
   */
  scope: string[];
  /** Defaults to "production" when a scope match does not name one. */
  environment?: string;
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
  /** Paths to extract, relative to the site's scope. Defaults to the entry URL. */
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
}

function normalizeScope(entry: string): Scope | null {
  let trimmed = entry.trim();
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
    };
  } catch {
    return null;
  }
}

/**
 * Specificity of `entry` against `url`, or -1 for no match. An exact host outranks
 * any wildcard, and among equals the longer path prefix wins.
 */
function scopeMatch(entry: string, url: string): number {
  const scope = normalizeScope(entry);
  if (!scope) return -1;
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

/**
 * The site whose scope matches `url` most specifically. Longest path prefix wins,
 * so a site owning `acme.com/app` beats one owning `acme.com`.
 */
export function matchSite(config: IdentityConfig | null, url: string): SiteConfig | null {
  if (!config?.sites?.length) return null;
  let best: SiteConfig | null = null;
  let bestLength = -1;
  for (const site of config.sites) {
    for (const entry of site.scope || []) {
      const length = scopeMatch(entry, url);
      if (length > bestLength) {
        bestLength = length;
        best = site;
      }
    }
  }
  return best;
}

/**
 * Resolve the identity to stamp on a run. Flags beat config so an ad hoc run can
 * override a repo's committed identity; config beats derivation.
 */
export function resolveIdentity(
  url: string,
  overrides: IdentityOverrides = {},
  config: IdentityConfig | null = null,
): Identity {
  const matched = overrides.site
    ? config?.sites?.find(s => s.name === overrides.site) ?? null
    : matchSite(config, url);

  const site = overrides.site ?? matched?.name ?? siteKeyOf(url);
  const environment =
    overrides.environment ?? matched?.environment ?? DEFAULT_ENVIRONMENT;
  const brand = overrides.brand ?? matched?.brand ?? config?.brand ?? null;

  let source: IdentitySource = 'derived';
  if (overrides.site || overrides.environment || overrides.brand) source = 'flag';
  else if (matched) source = 'config';

  return {
    brand,
    site,
    environment,
    profile: overrides.profile ?? null,
    source,
    siteId: matched?.id ?? siteKeyOf(url),
  };
}

/**
 * A `--site` naming no configured site is an error, not a new site: a typo would
 * otherwise start an empty baseline history and report zero drift.
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
