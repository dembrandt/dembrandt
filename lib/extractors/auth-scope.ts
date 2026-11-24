import type { BrowserContext, Page, Route } from 'playwright';

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

const MAX_REDIRECTS = 10;

function siteRedirect(status: number, location: string | undefined, from: string, origins: readonly string[]): string | null {
  if (status < 300 || status > 399 || !location) return null;
  const next = new URL(location, from).href;
  return inAuthScope(next, origins) ? next : null;
}

// Without CDP the response is fetched and fulfilled here, because a redirect the browser follows carries no override.
async function fulfilScoped(route: Route, scoped: Record<string, string>, origins: readonly string[]): Promise<void> {
  const request = route.request();
  if (!inAuthScope(request.url(), origins)) return route.continue();
  const headers = { ...request.headers(), ...scoped };
  const follow = request.method() === 'GET' && !request.isNavigationRequest();
  try {
    let url = request.url();
    let response = await route.fetch({ headers, maxRedirects: 0 });
    for (let hop = 0; follow && hop < MAX_REDIRECTS; hop++) {
      const next = siteRedirect(response.status(), response.headers().location, url, origins);
      if (!next) break;
      url = next;
      response = await route.fetch({ url, headers, maxRedirects: 0 });
    }
    await route.fulfill({ response });
  } catch {
    await route.abort().catch(() => {});
  }
}

/** The URL to open: past the redirects that stay on the site, where the browser would follow them without the headers. */
export async function resolveEntry(
  context: BrowserContext,
  url: string,
  scoped: Record<string, string>,
  origins: readonly string[],
  browserName: string,
  timeout: number,
): Promise<string> {
  if (browserName === 'chromium' || Object.keys(scoped).length === 0 || !inAuthScope(url, origins)) return url;
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const response = await context.request.get(current, { headers: scoped, maxRedirects: 0, timeout }).catch(() => null);
    const next = response && siteRedirect(response.status(), response.headers().location, current, origins);
    await response?.dispose();
    if (!next) break;
    current = next;
  }
  return current;
}

/** Sends the headers to the given origins only, on every page the context opens. */
export async function scopeHeaders(
  context: BrowserContext,
  scoped: Record<string, string>,
  origins: readonly string[],
  browserName: string,
): Promise<void> {
  if (Object.keys(scoped).length === 0) return;
  if (browserName !== 'chromium') {
    await context.route('**/*', (route) => fulfilScoped(route, scoped, origins));
    return;
  }
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    await scopePage(page, scoped, origins);
    return page;
  };
}

export function authScopeWarning(finalUrl: string, origins: readonly string[], hasScopedAuth: boolean): string | null {
  if (!hasScopedAuth || inAuthScope(finalUrl, origins)) return null;
  return `--header and --basic-auth are sent to the requested site only; run against ${new URL(finalUrl).origin} to send them there`;
}
