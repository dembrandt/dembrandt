import type { Page } from 'playwright';

export interface MutationSample {
  type: string;
  attributeName?: string | null;
}

export type SettleEnd = 'quiet' | 'cap' | 'error';

export interface ReadinessPhase {
  ms: number;
  networkIdle: boolean;
  fontsReady: boolean;
  endedBy: SettleEnd;
}

// Serialized into the page by source, so it must stay self-contained: no imports, no outer references.
export function isContentMutation(m: MutationSample): boolean {
  if (m.type !== 'attributes') return true;
  return ['class', 'src', 'href', 'hidden', 'data-theme'].includes(m.attributeName ?? '');
}

function settleInPage(isContent: (m: MutationSample) => boolean, quietMs: number, remaining: number): Promise<SettleEnd> {
  return new Promise((resolve) => {
    const target = document.body || document.documentElement;
    if (!target) return resolve('error');
    let quiet: ReturnType<typeof setTimeout>;
    const finish = (end: SettleEnd) => {
      try { obs.disconnect(); } catch {}
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve(end);
    };
    const arm = () => { clearTimeout(quiet); quiet = setTimeout(() => finish('quiet'), quietMs); };
    const obs = new MutationObserver((records) => { if (records.some(isContent)) arm(); });
    obs.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
    arm();
    const cap = setTimeout(() => finish('cap'), remaining);
  });
}

export function settleScript(quietMs: number, remaining: number): string {
  return `(${settleInPage.toString()})(${isContentMutation.toString()}, ${quietMs}, ${remaining})`;
}

/**
 * Resolves once the network is idle, web fonts are loaded and the DOM stops changing content,
 * or at capMs. Every error is swallowed: readiness is best-effort and must never abort extraction.
 */
export async function waitForSettled(page: Page, capMs: number, quietMs = 500): Promise<ReadinessPhase> {
  const start = Date.now();
  const left = () => Math.max(250, capMs - (Date.now() - start));
  let networkIdle = false;
  let fontsReady = false;
  let endedBy: SettleEnd = 'error';
  try { await page.waitForLoadState('networkidle', { timeout: capMs }); networkIdle = true; } catch {}
  // fonts.ready can hang on a stalled font request, so it races the remaining budget.
  try {
    fontsReady = await Promise.race([
      page.evaluate(() => Promise.resolve(document.fonts?.ready).then(() => true)),
      new Promise<boolean>((r) => setTimeout(() => r(false), left())),
    ]);
  } catch {}
  try { endedBy = await page.evaluate(settleScript(quietMs, left())) as SettleEnd; } catch {}
  return { ms: Date.now() - start, networkIdle, fontsReady, endedBy };
}
