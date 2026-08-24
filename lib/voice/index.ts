import type { Page } from 'playwright';
import type { Voice, VoiceFragment, VoiceSkipReason } from '../types.js';
import { DEFAULT_VOICE_CONFIG, extractVoice } from '../extractors/voice.js';
import { applyBudget, computeMetrics, totalWords, WORD_FLOOR } from './metrics.js';
import { classifyPageType, type PageTypeSignals } from './page-type.js';

export interface VoiceResult {
  voice: Voice | null;
  voiceSkipped?: VoiceSkipReason;
}

/** Fixed and unroutable: a random path would churn on 404s that echo it back. */
const PROBE_PATH = '/dembrandt-voice-probe-404-2f8a1c';

async function readSignals(page: Page): Promise<PageTypeSignals & { lang: string }> {
  return await page.evaluate(() => ({
    url: window.location.href,
    headingCount: document.querySelectorAll('h1, h2').length,
    formCount: document.querySelectorAll('form').length,
    hasArticle: document.querySelector('article') !== null,
    lang: document.documentElement.getAttribute('lang') ?? '',
  }));
}

/** Non-fatal: on failure the main page's fragments still stand. */
async function probeErrorPage(page: Page, url: string, timeout: number): Promise<VoiceFragment[]> {
  // A separate page: navigating the caller's would drop its hydration state.
  let probe: Page | null = null;
  try {
    const { origin } = new URL(url);
    probe = await page.context().newPage();
    await probe.goto(`${origin}${PROBE_PATH}`, { waitUntil: 'domcontentloaded', timeout });
    return await extractVoice(probe, { ...DEFAULT_VOICE_CONFIG, errorPageOnly: true });
  } catch {
    return [];
  } finally {
    await probe?.close().catch(() => {});
  }
}

export interface CollectVoiceOptions {
  probe404?: boolean;
  probeTimeout?: number;
}

export async function collectVoice(
  page: Page,
  url: string,
  options: CollectVoiceOptions = {},
): Promise<VoiceResult> {
  const { probe404 = true, probeTimeout = 15000 } = options;

  const signals = await readSignals(page);
  const pageType = classifyPageType(signals);

  const fragments = await extractVoice(page);
  if (fragments.length === 0) return { voice: null, voiceSkipped: 'no-text' };

  const errorFragments = probe404 ? await probeErrorPage(page, url, probeTimeout) : [];
  const all = [...fragments, ...errorFragments];

  if (totalWords(all) < WORD_FLOOR) return { voice: null, voiceSkipped: 'below-word-floor' };

  const budgeted = applyBudget(all, pageType);
  return { voice: { fragments: budgeted, metrics: computeMetrics(budgeted, signals.lang), pageType } };
}
