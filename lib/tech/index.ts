import type { Framework, IconSystem } from '../types.js';
import { codePatterns, detectTech, probes, type DetectedTech, type TechRule } from './model.js';
import { BUILDER_RULES } from './rules/builders.js';
import { CSS_RULES } from './rules/css.js';
import { ERA_RULES } from './rules/era.js';
import { ICON_RULES } from './rules/icons.js';
import { JS_RULES } from './rules/js.js';
import { UI_RULES } from './rules/ui.js';
import { WEB_COMPONENT_RULES } from './rules/web-components.js';
import { META_RULES } from './rules/meta.js';
import { collectTechSignals, type Probes, type TechSignals } from './signals.js';
import { sourceFacts, watchSources } from './sources.js';

export const TECH_RULES: TechRule[] = [...JS_RULES, ...META_RULES, ...BUILDER_RULES, ...CSS_RULES, ...UI_RULES, ...WEB_COMPONENT_RULES, ...ERA_RULES, ...ICON_RULES];
export const PROBES: Probes = {
  ...probes(),
  roots: TECH_RULES.filter((rule) => rule.mount).map((rule) => ({ key: rule.name, props: rule.mount?.props ?? [], selector: rule.mount?.selector })),
};
export const CODE_PATTERNS = codePatterns();

export const detectAll = (signals: TechSignals): DetectedTech[] => detectTech(signals, TECH_RULES);

export function toFrameworks(detected: DetectedTech[]): Framework[] {
  return detected
    .filter((tech) => tech.category !== 'icon-set')
    .map(({ name, confidence, evidence, category, version, coverage }) => ({
      name, confidence, evidence, category, ...(version ? { version } : {}), ...(coverage !== undefined ? { coverage } : {}),
    }));
}

export function toIconSystems(detected: DetectedTech[]): IconSystem[] {
  return detected
    .filter((tech) => tech.category === 'icon-set')
    .map(({ name, iconType, version }) => ({ name, type: iconType ?? 'svg', ...(version ? { version } : {}) }));
}

type TechPage = Parameters<typeof collectTechSignals>[0] & Parameters<typeof sourceFacts>[0];

const perPage = new WeakMap<TechPage, Promise<DetectedTech[]>>();

/** Call before navigation so the files the page loads can be read for banners and version constants. */
export const watchTechSources = (page: TechPage): Promise<void> => watchSources(page, CODE_PATTERNS);

export async function readTechSignals(page: TechPage): Promise<TechSignals> {
  const [signals, facts] = await Promise.all([collectTechSignals(page, PROBES), sourceFacts(page, CODE_PATTERNS)]);
  return { ...signals, ...facts };
}

function detectOnPage(page: TechPage): Promise<DetectedTech[]> {
  let detected = perPage.get(page);
  if (!detected) {
    detected = readTechSignals(page).then(detectAll);
    perPage.set(page, detected);
  }
  return detected;
}

export const detectFrameworks = async (page: TechPage): Promise<Framework[]> => toFrameworks(await detectOnPage(page));
export const detectIconSystem = async (page: TechPage): Promise<IconSystem[]> => toIconSystems(await detectOnPage(page));

export { collectTechSignals };
