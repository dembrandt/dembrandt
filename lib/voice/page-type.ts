/**
 * Coarse page classification. Sets the word budget and role weights only; it
 * never changes which roles are attempted.
 */
import type { VoicePageType } from '../types.js';

export interface PageTypeSignals {
  url: string;
  headingCount: number;
  formCount: number;
  hasArticle: boolean;
}

const PATH_PATTERNS: ReadonlyArray<[RegExp, VoicePageType]> = [
  [/\/(docs?|documentation|guide|api|reference|help|support|kb)(\/|$)/i, 'docs'],
  [/\/(contact|yhteystiedot|get-in-touch|careers|jobs)(\/|$)/i, 'contact'],
  [/\/(blog|news|articles?|press|insights|uutiset)(\/|$)/i, 'news'],
  [/\/(product|products|services|solutions|pricing|features|palvelut)(\/|$)/i, 'product'],
];

export function classifyPageType(signals: PageTypeSignals): VoicePageType {
  let pathname = '/';
  try {
    pathname = new URL(signals.url).pathname;
  } catch {
    pathname = signals.url;
  }

  const isRoot = pathname === '/' || pathname === '';
  if (isRoot) return 'landing';

  for (const [pattern, type] of PATH_PATTERNS) {
    if (pattern.test(pathname)) return type;
  }

  if (signals.hasArticle && signals.headingCount <= 3) return 'news';
  if (signals.formCount > 0 && signals.headingCount <= 2) return 'contact';

  return 'other';
}
