/**
 * Cookie-file / storageState / HTTP Basic parsing for authenticated extraction.
 * File I/O is behind loadAuthSession so tests inject a reader.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

export interface SessionCookie {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface LocalStorageEntry {
  name: string;
  value: string;
}

export interface StorageOrigin {
  origin: string;
  localStorage: LocalStorageEntry[];
}

export interface StorageState {
  cookies: SessionCookie[];
  origins: StorageOrigin[];
}

export interface SessionStorageOrigin {
  origin: string;
  sessionStorage: LocalStorageEntry[];
}

export interface AuthSession {
  cookies: SessionCookie[];
  /** Set when the file was Playwright storageState; null for cookies-only. */
  storageState: StorageState | null;
  /** Our extension of storageState: sign-in tokens many single-page apps keep per tab. */
  sessionStorage: SessionStorageOrigin[];
}

export interface HttpCredentials {
  username: string;
  password: string;
}

export type FileReader = (path: string) => string;

/** Netscape cookies.txt. `#HttpOnly_<domain>` is a real cookie, not a comment. */
export function parseNetscapeCookies(text: string, targetUrl: string): SessionCookie[] {
  const cookies: SessionCookie[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') && !/^#HttpOnly_/i.test(line)) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domainRaw, , path, secure, expires, name, value] = parts;
    if (!name) continue;
    const httpOnly = /^#HttpOnly_/i.test(domainRaw);
    const domain = domainRaw.replace(/^#HttpOnly_/i, '');
    const cookie: SessionCookie = {
      name,
      value: value ?? '',
      domain,
      path: path || '/',
      secure: secure === 'TRUE',
      httpOnly,
    };
    const exp = Number(expires);
    if (Number.isFinite(exp) && exp > 0) cookie.expires = exp;
    if (!cookie.domain) cookie.url = targetUrl;
    cookies.push(cookie);
  }
  return cookies;
}

export function normalizeSessionCookie(
  raw: Record<string, unknown>,
  targetUrl: string,
): SessionCookie | null {
  if (typeof raw.name !== 'string' || !raw.name) return null;
  if (typeof raw.value !== 'string') return null;
  const cookie: SessionCookie = { name: raw.name, value: raw.value };
  if (typeof raw.url === 'string' && raw.url) cookie.url = raw.url;
  if (typeof raw.domain === 'string' && raw.domain) cookie.domain = raw.domain;
  if (typeof raw.path === 'string' && raw.path) cookie.path = raw.path;
  if (typeof raw.expires === 'number' && Number.isFinite(raw.expires)) cookie.expires = raw.expires;
  if (typeof raw.httpOnly === 'boolean') cookie.httpOnly = raw.httpOnly;
  if (typeof raw.secure === 'boolean') cookie.secure = raw.secure;
  if (raw.sameSite === 'Strict' || raw.sameSite === 'Lax' || raw.sameSite === 'None') {
    cookie.sameSite = raw.sameSite;
  }
  if (!cookie.url && !cookie.domain) cookie.url = targetUrl;
  if (cookie.domain && !cookie.path) cookie.path = '/';
  return cookie;
}

function normalizeCookieList(list: unknown[], targetUrl: string): SessionCookie[] {
  const out: SessionCookie[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const c = normalizeSessionCookie(item as Record<string, unknown>, targetUrl);
    if (c) out.push(c);
  }
  return out;
}

function normalizeEntries(list: unknown): LocalStorageEntry[] {
  if (!Array.isArray(list)) return [];
  const entries: LocalStorageEntry[] = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const row = e as Record<string, unknown>;
    if (typeof row.name !== 'string' || typeof row.value !== 'string') continue;
    entries.push({ name: row.name, value: row.value });
  }
  return entries;
}

function normalizeOriginList<K extends 'localStorage' | 'sessionStorage'>(
  list: unknown[],
  key: K,
): Array<{ origin: string } & Record<K, LocalStorageEntry[]>> {
  const out: Array<{ origin: string } & Record<K, LocalStorageEntry[]>> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.origin !== 'string' || !o.origin) continue;
    out.push({ origin: o.origin, [key]: normalizeEntries(o[key]) } as { origin: string } & Record<K, LocalStorageEntry[]>);
  }
  return out;
}

function normalizeOrigins(list: unknown[]): StorageOrigin[] {
  return normalizeOriginList(list, 'localStorage');
}

/** Cookie array or `{ cookies, origins }` storageState. */
export function parseCookieFileJson(text: string, targetUrl: string): AuthSession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('cookie file: invalid JSON');
  }

  if (Array.isArray(parsed)) {
    return { cookies: normalizeCookieList(parsed, targetUrl), storageState: null, sessionStorage: [] };
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { cookies?: unknown }).cookies)) {
    const obj = parsed as { cookies: unknown[]; origins?: unknown[]; sessionStorage?: unknown[] };
    const cookies = normalizeCookieList(obj.cookies, targetUrl);
    const origins = Array.isArray(obj.origins) ? normalizeOrigins(obj.origins) : [];
    const sessionStorage = Array.isArray(obj.sessionStorage) ? normalizeOriginList(obj.sessionStorage, 'sessionStorage') : [];
    return {
      cookies,
      storageState: { cookies, origins },
      sessionStorage,
    };
  }

  throw new Error('cookie file: JSON must be a cookie array or Playwright storageState');
}

export function parseCookieFileText(text: string, targetUrl: string): AuthSession {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseCookieFileJson(text, targetUrl);
  }
  return { cookies: parseNetscapeCookies(text, targetUrl), storageState: null, sessionStorage: [] };
}

/** Playwright's storageState plus our sessionStorage block, as the file --save-storage-state writes. */
export function serializeStorageState(state: StorageState, sessionStorage: SessionStorageOrigin[]): string {
  const kept = sessionStorage.filter((o) => o.sessionStorage.length > 0);
  return JSON.stringify(kept.length ? { ...state, sessionStorage: kept } : state, null, 2) + '\n';
}

/** Runs in the page: the tab's sessionStorage as name/value rows. */
export function readSessionStorage(): LocalStorageEntry[] {
  const out: LocalStorageEntry[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const name = sessionStorage.key(i);
    if (name === null) continue;
    out.push({ name, value: sessionStorage.getItem(name) ?? '' });
  }
  return out;
}

/**
 * Init script that seeds a tab's sessionStorage for its origin before any
 * page script runs. Existing keys win, so an app that has already refreshed
 * its tokens is never rolled back to the saved ones.
 */
export function sessionStorageInitScript(origins: readonly SessionStorageOrigin[]): string {
  const byOrigin: Record<string, LocalStorageEntry[]> = {};
  for (const o of origins) {
    if (o.sessionStorage.length) byOrigin[o.origin] = o.sessionStorage;
  }
  return `(() => {
  const saved = ${JSON.stringify(byOrigin)}[location.origin];
  if (!saved) return;
  for (const { name, value } of saved) {
    if (sessionStorage.getItem(name) === null) sessionStorage.setItem(name, value);
  }
})();`;
}

/** A saved session whose dated cookies have all lapsed will only reach the sign-in page again. */
export function expiredSessionWarning(session: AuthSession, now = Date.now()): string | null {
  const dated = session.cookies.filter((c) => typeof c.expires === 'number' && c.expires > 0);
  if (dated.length === 0 || dated.some((c) => c.expires! * 1000 > now)) return null;
  const last = new Date(Math.max(...dated.map((c) => c.expires! * 1000)));
  return `every dated cookie in the saved session expired, the last on ${last.toISOString()}; run --login again`;
}

/** A run that carried a session but landed on another host was sent back to sign in. */
export function sessionRedirectWarning(finalUrl: string, targetUrl: string, hasSession: boolean): string | null {
  if (!hasSession || !isOffTarget(finalUrl, targetUrl)) return null;
  return `the saved session was not accepted: ${new URL(targetUrl).host} redirected to ${new URL(finalUrl).host}; sign in again with --login`;
}

/** True when the browser has left the host the run was asked for, as it does mid sign-in. */
export function isOffTarget(currentUrl: string, targetUrl: string): boolean {
  try {
    return new URL(currentUrl).host !== new URL(targetUrl).host;
  } catch {
    return false;
  }
}

export function loadAuthSession(
  filePath: string,
  targetUrl: string,
  read: FileReader = (p) => readFileSync(p, 'utf8'),
): AuthSession {
  if (!filePath || !filePath.trim()) return emptyAuthSession();
  const absolute = resolve(filePath);
  let text: string;
  try {
    text = read(absolute);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cookie file: cannot read ${absolute}: ${msg}`, { cause: err });
  }
  return parseCookieFileText(text, targetUrl);
}

/** Later entries win on name+domain (or name+url). */
export function mergeSessionCookies(
  earlier: readonly SessionCookie[],
  later: readonly SessionCookie[],
): SessionCookie[] {
  const seen = new Map<string, SessionCookie>();
  for (const c of [...earlier, ...later]) {
    if (!c?.name) continue;
    const key = `${c.name}|${c.domain || c.url || ''}`;
    seen.set(key, c);
  }
  return [...seen.values()];
}

/** First colon splits user from password (password may contain colons). */
export function parseBasicAuth(value: string | undefined): HttpCredentials | null {
  if (value === undefined || value === '') return null;
  const colon = value.indexOf(':');
  if (colon < 1) {
    throw new Error('--basic-auth must be user:password');
  }
  return { username: value.slice(0, colon), password: value.slice(colon + 1) };
}

export function waitForEnter(
  stdin: Readable & { isTTY?: boolean } = process.stdin,
  stderr: Writable = process.stderr,
  message = 'Log in in the browser window, then press Enter to continue extraction…\n',
): Promise<void> {
  if (!stdin.isTTY) {
    return Promise.reject(new Error('--login needs an interactive terminal (stdin is not a TTY)'));
  }
  stderr.write(message);
  return new Promise((resolvePromise, reject) => {
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      if (text.includes('\n') || text.includes('\r')) {
        cleanup();
        resolvePromise();
      }
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('--login: stdin closed before Enter'));
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.off('end', onEnd);
      if (typeof (stdin as NodeJS.ReadStream).setRawMode === 'function'
        && (stdin as NodeJS.ReadStream).isRaw) {
        try { (stdin as NodeJS.ReadStream).setRawMode(false); } catch { /* ignore */ }
      }
      stdin.pause();
    };
    stdin.resume();
    stdin.on('data', onData);
    stdin.on('end', onEnd);
  });
}

export function emptyAuthSession(): AuthSession {
  return { cookies: [], storageState: null, sessionStorage: [] };
}

