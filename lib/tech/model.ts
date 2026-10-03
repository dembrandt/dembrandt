import type { Confidence, TechCategory } from '../types.js';
import type { ExpandoProbe, TechSignals } from './signals.js';
import type { CodePattern } from './sources.js';

/** Returns what it matched, worded for the evidence line, or null. */
export type Sign = (signals: TechSignals) => string | null;

export type VersionProbe = (signals: TechSignals) => string | undefined;

/**
 * One strong sign is proof on its own; weak signs are shapes other tools also
 * produce, so two are needed and the result is reported as medium.
 */
export interface TechRule {
  name: string;
  category: TechCategory;
  strong?: Sign[];
  weak?: Sign[];
  /** Tried in order; put the most precise source first. */
  version?: VersionProbe[];
  /** Names of technologies that must also be present. */
  requires?: string[];
  /** Dropped when any of these is present: a fork or superset that leaves the same marks. */
  yieldsTo?: string[];
  iconType?: IconType | ((signals: TechSignals) => IconType);
  /** Where the framework attaches to the page: expando names on the mount element, or a selector for it. */
  mount?: { props?: string[]; selector?: string };
}

export type IconType = 'icon-font' | 'svg';

export interface DetectedTech {
  name: string;
  category: TechCategory;
  confidence: Confidence;
  evidence: string;
  version?: string;
  iconType?: IconType;
  /** Share of the page's elements under this framework's mount points, 0 to 1. */
  coverage?: number;
}

type Pattern = RegExp | string;
const matches = (pattern: Pattern, value: string) => (typeof pattern === 'string' ? value === pattern : pattern.test(value));
const firstKey = (keys: string[], pattern: Pattern) => keys.find((key) => matches(pattern, key));
const counted = (record: Record<string, number>, pattern: Pattern, min: number, word: string): string | null => {
  const hits = Object.entries(record).filter(([key]) => matches(pattern, key));
  const sum = hits.reduce((n, [, count]) => n + count, 0);
  return sum >= min && hits.length ? `${word} ${hits[0][0]}${sum > 1 ? ` x${sum}` : ''}` : null;
};
const listed = (values: string[], pattern: Pattern, word: string): string | null => {
  const hit = firstKey(values, pattern);
  return hit === undefined ? null : `${word}${/[#=]$/.test(word) ? '' : ' '}${hit}`.trim();
};

const VERSION = /^v?(\d+(?:\.\d+){0,2}(?:-(?:alpha|beta|rc|next|canary|dev)[\w.]*)?)/;

const sheetProbes = new Set<string>();
const varProbes = new Set<string>();
const pathProbes = new Set<string>();
const expandoProbes: ExpandoProbe[] = [];
const codeProbes: CodePattern[] = [];
export const probes = () => ({ classes: [...sheetProbes], vars: [...varProbes], paths: [...pathProbes], expandos: [...expandoProbes] });
export const codePatterns = (): CodePattern[] => [...codeProbes];

export const cls = (pattern: Pattern, min = 1): Sign => (s) => counted(s.classes, pattern, min, 'class');
export const attr = (pattern: Pattern, min = 1): Sign => (s) => counted(s.attrs, pattern, min, 'attribute');
export const tag = (pattern: Pattern, min = 1): Sign => (s) => counted(s.tags, pattern, min, 'element');
export const svg = (pattern: Pattern, min = 1): Sign => (s) => counted(s.svgs, pattern, min, 'inline svg');
export const attrValue = (name: string, pattern: Pattern): Sign => (s) => listed(s.attrValues[name] ?? [], pattern, `${name}=`);
export const id = (pattern: Pattern): Sign => (s) => listed(s.ids, pattern, '#');
export const prop = (pattern: Pattern): Sign => (s) => listed(s.props, pattern, 'DOM property');
export const comment = (pattern: Pattern): Sign => (s) => listed(s.comments, pattern, 'comment');
export const script = (pattern: Pattern): Sign => (s) => listed(s.scripts, pattern, 'inline script');
export const generator = (pattern: RegExp): Sign => (s) => listed(s.generators, pattern, 'generator');
export const resource = (pattern: RegExp): Sign => (s) => {
  const hit = s.resources.find((url) => pattern.test(url));
  return hit ? `resource ${hit.split(/[?#]/)[0].split('/').slice(-2).join('/').slice(0, 60)}` : null;
};
/**
 * A library's own file or package in a URL: `/bootstrap.min.css`, `/npm/bootstrap@5.3.8/`, `/ajax/libs/bootstrap/5.3.8/`.
 * Anchored to a whole path segment so `the-react-foundation.json` is not Foundation.
 */
export const asset = (file: string, ext = 'js|css', pkg = file): Sign =>
  resource(new RegExp(`(?:^|/)(?:${file})(?:[.-]\\d[\\d.]*)?(?:[.-](?:min|slim|bundle|esm|umd|prod|global|all))*\\.(?:${ext})(?:[?#]|$)|/(?:${pkg})@\\d|/ajax/libs/(?:${pkg})/\\d`, 'i'));
export const glob = (pattern: Pattern): Sign => (s) => {
  const hit = firstKey(Object.keys(s.globals), pattern);
  return hit === undefined ? null : `window.${hit}`;
};
export const versioned = (name: string): Sign => (s) => (VERSION.test(s.globals[name] ?? '') ? `window.${name} ${s.globals[name]}` : null);
export const cssVar = (prefix: string, min = 1): Sign => (s) => ((s.cssVars[prefix] ?? 0) >= min ? `CSS variables ${prefix}*` : null);
export const cssVarNamed = (name: string): Sign => {
  varProbes.add(name);
  return (s) => (s.cssVarNames.includes(name) ? `CSS variable ${name}` : null);
};
export const layer = (...names: string[]): Sign => (s) => (names.every((name) => s.cssLayers.includes(name)) ? `@layer ${names.join(', ')}` : null);
export const font = (pattern: RegExp): Sign => (s) => listed(s.fontFaces, pattern, 'font');
export const sheet = (...classNames: string[]): Sign => {
  classNames.forEach((name) => sheetProbes.add(name));
  return (s) => (classNames.every((name) => s.cssClasses.includes(name)) ? `stylesheet .${classNames.join(' .')}` : null);
};
/** Quotes the name and version only: the rest of a banner line is free text written by the page. */
export const banner = (pattern: RegExp): Sign => (s) => {
  const line = s.banners.find((b) => pattern.test(b));
  return line === undefined ? null : `banner ${line.match(/^.{0,60}?\bv?\d+\.\d+(\.\d+)?/)?.[0] ?? line.slice(0, 40)}`;
};
export const any = (...signs: Sign[]): Sign => (s) => signs.map((sign) => sign(s)).find((hit) => hit !== null) ?? null;
export const all = (...signs: Sign[]): Sign => (s) => {
  const found = signs.map((sign) => sign(s));
  return found.every((hit) => hit !== null) ? found.filter(Boolean).join(' + ') : null;
};
export const not = (sign: Sign): Sign => (s) => (sign(s) === null ? '' : null);

const clean = (raw: string | undefined) => raw?.match(VERSION)?.[1];

export const globalVersion = (name: string): VersionProbe => (s) => clean(s.globals[name]);
export const attrVersion = (name: string): VersionProbe => (s) => (s.attrValues[name] ?? []).map(clean).find(Boolean);
export const generatorVersion = (pattern: RegExp): VersionProbe => (s) => s.generators.map((g) => clean(g.match(pattern)?.[1])).find(Boolean);
/** Matches `name@1.2.3/`, `/name/1.2.3/`, `name-1.2.3.min.js` and `name.min.js?ver=1.2.3`; `name` is a regex source for the package segment. */
export const urlVersion = (name: string): VersionProbe => {
  const version = '(\\d+\\.\\d+(?:\\.\\d+)?(?:-(?:alpha|beta|rc|next)[\\w.]*)?)';
  const inPath = new RegExp(`(?:^|[/_.-])(?:${name})(?:@|/|-|\\.|/v)v?${version}(?=[/.?-]|$)`, 'i');
  const inQuery = new RegExp(`/(?:${name})(?:[.-]min)?\\.(?:js|css)\\?ver=${version}$`, 'i');
  return (s) => s.resources.map((url) => (url.match(inPath) ?? url.match(inQuery))?.[1]).find(Boolean);
};
export const pathVersion = (path: string): VersionProbe => {
  pathProbes.add(path);
  return (s) => clean(s.globals[path]);
};
export const classVersion = (pattern: RegExp): VersionProbe => (s) => Object.keys(s.classes).map((c) => c.match(pattern)?.[1]).find(Boolean);
export const propVersion = (pattern: RegExp): VersionProbe => (s) => s.props.map((p) => p.match(pattern)?.[1]).find(Boolean);
export const bannerVersion = (pattern: RegExp): VersionProbe => (s) => s.banners.map((b) => clean(b.match(pattern)?.[1])).find(Boolean);
/** A version constant that survives minification; `pattern` captures it from the file text. */
export const codeVersion = (key: string, pattern: RegExp): VersionProbe => {
  codeProbes.push({ key, pattern });
  return (s) => clean(s.code[key]);
};
/** A version reachable from a framework's own object on its mount element. */
export const expandoVersion = (key: string, prop: string, path: string): VersionProbe => {
  expandoProbes.push({ key, prop, path });
  return (s) => clean(s.globals[key]);
};
export const resourceVersion = (pattern: RegExp): VersionProbe => (s) => s.resources.map((url) => url.match(pattern)?.[1]).find(Boolean);
export const when = (sign: Sign, version: string): VersionProbe => (s) => (sign(s) !== null ? version : undefined);

/** Evidence quotes the page, so it is cut to printable ASCII before it can reach a terminal or a model. */
const printable = (text: string) => text.replace(/[^\x20-\x7E]/g, '').slice(0, 80);

export function detectTech(signals: TechSignals, rules: TechRule[]): DetectedTech[] {
  const found = new Map<string, DetectedTech>();
  for (const rule of rules) {
    const strong = (rule.strong ?? []).map((sign) => sign(signals)).filter((hit): hit is string => hit !== null);
    const weak = (rule.weak ?? []).map((sign) => sign(signals)).filter((hit): hit is string => hit !== null);
    if (strong.length === 0 && weak.length < 2) continue;
    let version: string | undefined;
    for (const probe of rule.version ?? []) {
      version = probe(signals);
      if (version) break;
    }
    found.set(rule.name, {
      name: rule.name,
      category: rule.category,
      confidence: strong.length > 0 ? 'high' : 'medium',
      evidence: [...strong, ...weak].slice(0, 2).map(printable).join(', '),
      ...(version ? { version } : {}),
      ...(rule.iconType ? { iconType: typeof rule.iconType === 'function' ? rule.iconType(signals) : rule.iconType } : {}),
      ...(signals.roots[rule.name] !== undefined ? { coverage: signals.roots[rule.name] } : {}),
    });
  }
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const rule of rules) {
      const orphaned = (rule.requires ?? []).some((name) => !found.has(name));
      if (found.has(rule.name) && (orphaned || (rule.yieldsTo ?? []).some((name) => found.has(name)))) {
        found.delete(rule.name);
        pruned = true;
      }
    }
  }
  return [...found.values()];
}
