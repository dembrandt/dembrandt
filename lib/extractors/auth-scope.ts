import type { BrowserContext, Page, Response, Route } from 'playwright';

/** The origins a run's credentials may reach: the requested site, with or without www, and its https upgrade. */
export function authOrigins(authUrl: string): string[] {
  const u = new URL(authUrl);
  const named = /^[^.]+\..*[a-z]/i.test(u.hostname);
  const bare = u.hostname.replace(/^www\./, '');
  const hosts = named ? [bare, `www.${bare}`] : [u.hostname];
  const port = u.port ? `:${u.port}` : '';
  const schemes = u.protocol === 'http:' && !port ? ['http:', 'https:'] : [u.protocol];
  return schemes.flatMap((s) => hosts.map((h) => new URL(`${s}//${h}${port}`).origin));
}

export function inAuthScope(requestUrl: string, origins: readonly string[]): boolean {
  try {
    return origins.includes(new URL(requestUrl).origin);
  } catch {
    return false;
  }
}

/** Where cookies without a domain belong: the page itself while it is on the site, otherwise the site. */
export function credentialUrlFor(pageUrl: string, authUrl: string): string {
  return inAuthScope(pageUrl, authOrigins(authUrl)) ? pageUrl : authUrl;
}

// Playwright's route.continue() carries header overrides across redirects to any host, so Chromium decides per hop over CDP.
async function scopePage(page: Page, scoped: Record<string, string>, origins: readonly string[]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Fetch.requestPaused', (e) => {
    const headers = inAuthScope(e.request.url, origins)
      && Object.entries({ ...e.request.headers, ...scoped }).map(([name, value]) => ({ name, value }));
    cdp.send('Fetch.continueRequest', { requestId: e.requestId, ...(headers && { headers }) })
      .catch(() => cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'Failed' }))
      .catch(() => {});
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
}

const MAX_REDIRECTS = 20;
const REDIRECTS = [301, 302, 303, 307, 308];

interface Entry {
  page: Page | null;
  next: string | null;
}

// Without CDP the response is fetched and fulfilled here, because a redirect the browser follows carries no override.
async function fulfilScoped(route: Route, scoped: Record<string, string>, origins: readonly string[], entry: Entry): Promise<void> {
  const request = route.request();
  const streams = ['media', 'eventsource'].includes(request.resourceType());
  if (streams || !inAuthScope(request.url(), origins)) return route.continue();
  try {
    const response = await route.fetch({ headers: { ...request.headers(), ...scoped }, maxRedirects: 0, timeout: 0 });
    const opening = entry.page !== null && request.isNavigationRequest() && request.frame() === entry.page.mainFrame();
    const { location } = response.headers();
    const next = location && REDIRECTS.includes(response.status()) ? new URL(location, request.url()).href : null;
    if (next && opening && inAuthScope(next, origins)) {
      entry.next = next;
      return await route.abort();
    }
    // A fulfilled redirect never counts as finished, so the page would not go idle.
    if (next && !request.isNavigationRequest() && request.method() === 'GET') return await route.continue();
    await route.fulfill({ response });
  } catch {
    await route.abort().catch(() => {});
  }
}

export type Goto = (page: Page, url: string, options: { timeout: number; waitUntil: 'domcontentloaded' }) => Promise<Response | null>;

/**
 * Sends the headers to the given origins only, on every page the context opens. Returns how to open a page:
 * where the engine cannot set them per redirect, each redirect within the site is opened as its own request.
 */
export async function scopeHeaders(
  context: BrowserContext,
  scoped: Record<string, string>,
  origins: readonly string[],
  browserName: string,
): Promise<Goto> {
  if (Object.keys(scoped).length === 0) return (page, url, options) => page.goto(url, options);
  if (browserName === 'chromium') {
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      await scopePage(page, scoped, origins);
      return page;
    };
    return (page, url, options) => page.goto(url, options);
  }
  const entry: Entry = { page: null, next: null };
  await context.route('**/*', (route) => fulfilScoped(route, scoped, origins, entry));
  return async (page, url, { timeout, waitUntil }) => {
    const deadline = Date.now() + timeout;
    let current = url;
    try {
      for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
        entry.page = page;
        entry.next = null;
        try {
          return await page.goto(current, { timeout: Math.max(1, deadline - Date.now()), waitUntil });
        } catch (err) {
          if (!entry.next) throw err;
          const next = new URL(entry.next);
          next.hash ||= new URL(current).hash;
          current = next.href;
        }
      }
      throw new Error(`too many redirects from ${url}`);
    } finally {
      entry.page = null;
    }
  };
}

export function authScopeWarning(finalUrl: string, origins: readonly string[], hasScopedAuth: boolean): string | null {
  if (!hasScopedAuth || !/^https?:/.test(finalUrl) || inAuthScope(finalUrl, origins)) return null;
  return `--header and --basic-auth are sent to the requested site only; run against ${new URL(finalUrl).origin} to send them there`;
}
