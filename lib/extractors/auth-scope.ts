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

function without(headers: Record<string, string>, names: readonly string[]): Record<string, string> {
  const drop = new Set(names.map((n) => n.toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([n]) => !drop.has(n.toLowerCase())));
}

// Playwright's route.continue() carries header overrides across redirects to any host, so Chromium decides per hop over CDP.
async function scopePage(page: Page, scoped: Record<string, string>, origins: readonly string[]): Promise<void> {
  const names = Object.keys(scoped);
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Fetch.requestPaused', (e) => {
    const headers = inAuthScope(e.request.url, origins)
      && Object.entries({ ...without(e.request.headers, names), ...scoped }).map(([name, value]) => ({ name, value }));
    cdp.send('Fetch.continueRequest', { requestId: e.requestId, ...(headers && { headers }) })
      .catch(() => cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'Failed' }))
      .catch(() => {});
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
}

// Without CDP the response is fetched and fulfilled here; a redirected hop then goes out without the headers.
async function fulfilScoped(route: Route, scoped: Record<string, string>, origins: readonly string[]): Promise<void> {
  const request = route.request();
  if (!inAuthScope(request.url(), origins)) return route.continue();
  const headers = { ...without(request.headers(), Object.keys(scoped)), ...scoped };
  try {
    await route.fulfill({ response: await route.fetch({ headers, maxRedirects: 0 }) });
  } catch {
    await route.abort().catch(() => {});
  }
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
