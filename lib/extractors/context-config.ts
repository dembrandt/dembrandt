/**
 * Pure parsing of CLI-supplied browser-context inputs (cookies, headers, screen
 * size, locale) into Playwright context configuration. Split out of the
 * extraction orchestrator so the untrusted-input surface is unit-testable and
 * malformed input degrades to safe defaults instead of producing broken values.
 *
 * Written strict-clean (no implicit any, no null leaks) per the per-module
 * strict ratchet, even though the global tsconfig is strict:false.
 */
import type { ExtractOptions } from '../types.js';

export interface ParsedCookie {
  readonly name: string;
  readonly value: string;
  readonly url: string;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export type ColorScheme = 'light' | 'dark' | 'no-preference';

/**
 * The subset of Playwright's BrowserContextOptions that we set. Declared
 * explicitly (rather than `Record<string, any>`) so the config the extraction
 * engine depends on is type-checked at the one call site where `browser` is an
 * untyped handle.
 */
export interface ContextOptions {
  viewport: ScreenSize;
  screen: ScreenSize;
  userAgent: string;
  locale: string;
  timezoneId: string;
  extraHTTPHeaders: Record<string, string>;
  colorScheme: ColorScheme;
  permissions?: string[];
}

export const DEFAULT_SCREEN: ScreenSize = Object.freeze({ width: 1920, height: 1080 });
export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

/**
 * Parse a "Name=value; Name2=value2" cookie string. Pairs without an "=" are
 * skipped rather than emitted with a truncated name and the whole token as the
 * value (the previous behavior). Empty names are also dropped.
 */
export function parseCookies(cookie: string | undefined, url: string): ParsedCookie[] {
  if (!cookie) return [];
  const out: ParsedCookie[] = [];
  for (const raw of cookie.split(';')) {
    const c = raw.trim();
    if (!c) continue;
    const eq = c.indexOf('=');
    if (eq < 1) continue; // no "=", or "=value" with an empty name
    out.push({ name: c.slice(0, eq).trim(), value: c.slice(eq + 1).trim(), url });
  }
  return out;
}

/**
 * Parse a single "Name: value" header. Returns {} when absent or when no colon
 * is present (an invalid header is ignored rather than guessed at).
 */
export function parseHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const colon = header.indexOf(':');
  if (colon < 1) return {};
  const name = header.slice(0, colon).trim();
  if (!name) return {};
  return { [name]: header.slice(colon + 1).trim() };
}

/**
 * Parse a "WIDTHxHEIGHT" screen size. Falls back to the default when either
 * dimension is missing, non-numeric, or non-positive, so a typo never produces
 * a NaN viewport that silently breaks layout-dependent extraction. Returns a
 * fresh object so callers can never mutate the shared default.
 */
export function parseScreenSize(screenSize: string | undefined): ScreenSize {
  if (!screenSize) return { width: DEFAULT_SCREEN.width, height: DEFAULT_SCREEN.height };
  const parts = screenSize.split('x');
  if (parts.length !== 2) return { width: DEFAULT_SCREEN.width, height: DEFAULT_SCREEN.height };
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: DEFAULT_SCREEN.width, height: DEFAULT_SCREEN.height };
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Derive the Accept-Language header. An explicit value wins; otherwise it is
 * built from the locale, weighting the locale and its base language ahead of
 * English.
 */
export function deriveAcceptLanguage(locale: string, explicit?: string): string {
  if (explicit) return explicit;
  const base = locale.split('-')[0];
  return `${locale},${base};q=0.9,en;q=0.8`;
}

/**
 * Build the Playwright context options from CLI options. Pure: no browser
 * access, no mutation of the input. Cookies and init scripts are applied
 * separately by the caller because they are side effects on a live context.
 */
export function buildContextOptions(options: ExtractOptions, browserName: string): ContextOptions {
  const locale = options.locale || DEFAULT_LOCALE;
  const size = parseScreenSize(options.screenSize);
  const extraHTTPHeaders: Record<string, string> = {
    'Accept-Language': deriveAcceptLanguage(locale, options.acceptLanguage),
    ...parseHeader(options.header),
  };

  const contextOptions: ContextOptions = {
    viewport: { width: size.width, height: size.height },
    screen: { width: size.width, height: size.height },
    userAgent: options.userAgent || DEFAULT_USER_AGENT,
    locale,
    timezoneId: options.timezoneId || DEFAULT_TIMEZONE,
    extraHTTPHeaders,
    colorScheme: 'light',
  };

  if (browserName === 'chromium') {
    contextOptions.permissions = ['clipboard-read', 'clipboard-write'];
  }

  return contextOptions;
}
