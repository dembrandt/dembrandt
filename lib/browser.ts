/**
 * Lazy loader for the playwright-core browser engines.
 *
 * playwright is an optional peer dependency: consumers that use only the pure
 * exports (drift, types, normalize, dtcg) are not forced to install the
 * browser stack. Anything that actually drives a browser routes its import
 * through here, so a missing install surfaces a clear instruction instead of
 * a raw ERR_MODULE_NOT_FOUND at startup. Static `import` would fail at module
 * load, before any guard could run; dynamic `import()` defers it to use.
 */

export class PlaywrightMissingError extends Error {
  constructor() {
    super('playwright not installed, run: npm i playwright');
    this.name = 'PlaywrightMissingError';
  }
}

export async function loadBrowserEngines(): Promise<typeof import('playwright-core')> {
  try {
    return await import('playwright-core');
  } catch {
    throw new PlaywrightMissingError();
  }
}
