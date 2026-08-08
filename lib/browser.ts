/**
 * Lazy loader for the playwright-core browser engines.
 *
 * playwright-core (the driver, ~10MB, no browser download) is a regular
 * dependency, so the import resolves on a plain install without pulling the
 * ~150MB browser binaries onto every consumer — library-only importers
 * (drift, types, normalize, dtcg) and Vercel/CI installs stay lean. The actual
 * browser binary is fetched on demand (`npx playwright install chromium` or
 * `npm run install-browser`), so only callers that really extract pay for it.
 * The import is still routed through here and guarded so a missing engine
 * surfaces a clear instruction; dynamic `import()` defers resolution to use.
 */

export class PlaywrightMissingError extends Error {
  /**
   * Names the engine in the recovery command. `install-browser` defaults to
   * chromium, so a bare hint sends a `--browser firefox` user to a command that
   * reinstalls chromium and leaves them on the identical error.
   */
  constructor(engine = 'chromium') {
    super(`browser engine not available, run: dembrandt install-browser ${engine}`);
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
