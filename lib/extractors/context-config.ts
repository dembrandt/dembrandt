/**
 * Pure parsing of CLI-supplied browser-context inputs (cookies, headers, screen
 * size, locale) into Playwright context configuration. Split out of the
 * extraction orchestrator so the untrusted-input surface is unit-testable and
 * malformed input degrades to safe defaults instead of producing broken values.
 */
import type { ExtractOptions } from '../types.js';

export interface ParsedCookie {
  name: string;
  value: string;
  url: string;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export const DEFAULT_SCREEN: ScreenSize = { width: 1920, height: 1080 };
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
    if (eq < 1) continue; // no "=", or "=value" with empty name
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
 * a NaN viewport that silently breaks layout-dependent extraction.
 */
export function parseScreenSize(screenSize: string | undefined): ScreenSize {
  if (!screenSize) return { ...DEFAULT_SCREEN };
  const parts = screenSize.split('x');
  if (parts.length !== 2) return { ...DEFAULT_SCREEN };
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...DEFAULT_SCREEN };
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
 * access. Cookies and init scripts are applied separately by the caller because
 * they are side effects on a live context.
 */
export function buildContextOptions(options: ExtractOptions, browserName: string): Record<string, any> {
  const locale = options.locale || DEFAULT_LOCALE;
  const timezoneId = options.timezoneId || DEFAULT_TIMEZONE;
  const { width, height } = parseScreenSize(options.screenSize);
  const extraHeaders: Record<string, string> = {
    'Accept-Language': deriveAcceptLanguage(locale, options.acceptLanguage),
    ...parseHeader(options.header),
  };

  const contextOptions: Record<string, any> = {
    viewport: { width, height },
    screen: { width, height },
    userAgent: options.userAgent || DEFAULT_USER_AGENT,
    locale,
    timezoneId,
    extraHTTPHeaders: extraHeaders,
    colorScheme: 'light',
  };

  if (browserName === 'chromium') {
    contextOptions.permissions = ['clipboard-read', 'clipboard-write'];
  }

  return contextOptions;
}
