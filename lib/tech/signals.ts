export interface TechSignals {
  classes: Record<string, number>;
  attrs: Record<string, number>;
  attrValues: Record<string, string[]>;
  tags: Record<string, number>;
  /** Inline SVG shapes as `viewBox|stroke-width|fill|stroke`, plus `class~icon` for SVGs classed as icons. */
  svgs: Record<string, number>;
  ids: string[];
  props: string[];
  comments: string[];
  scripts: string[];
  generators: string[];
  resources: string[];
  globals: Record<string, string>;
  cssVars: Record<string, number>;
  cssClasses: string[];
  cssVarNames: string[];
  cssLayers: string[];
  fontFaces: string[];
  /** Share of the page's elements under each framework's mount points, 0 to 1. */
  roots: Record<string, number>;
  shadowRoots: number;
  /** Licence banners and version constants read from the loaded files; filled outside the page. */
  banners: string[];
  code: Record<string, string>;
}

export function emptySignals(): TechSignals {
  return {
    classes: {}, attrs: {}, attrValues: {}, tags: {}, svgs: {}, ids: [], props: [], comments: [], scripts: [],
    generators: [], resources: [], globals: {}, cssVars: {}, cssClasses: [], cssVarNames: [], cssLayers: [], fontFaces: [], roots: {}, shadowRoots: 0, banners: [], code: {},
  };
}

interface Evaluator {
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}

export interface RootProbe { key: string; props: string[]; selector?: string }
export interface ExpandoProbe { key: string; prop: string; path: string }

/** Things only worth reading when a rule asks for them. */
export interface Probes {
  classes: string[];
  vars: string[];
  paths: string[];
  roots: RootProbe[];
  expandos: ExpandoProbe[];
}

export async function collectTechSignals(page: Evaluator, probeList: Probes): Promise<TechSignals> {
  return await page.evaluate((probes: Probes): TechSignals => {
    const MAX_ELEMENTS = 20000;
    const bump = (rec: Record<string, number>, key: string) => { rec[key] = (rec[key] ?? 0) + 1; };
    const classes: Record<string, number> = {};
    const attrs: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const svgs: Record<string, number> = {};
    const attrValues: Record<string, Set<string>> = {};
    const ids = new Set<string>();
    const props = new Set<string>();
    const scripts = new Set<string>();

    const elements: Element[] = [];
    const shadows: ShadowRoot[] = [];
    const walk = (root: ParentNode) => {
      for (const el of root.querySelectorAll('*')) {
        if (elements.length >= MAX_ELEMENTS) return;
        elements.push(el);
        if (el.shadowRoot) {
          shadows.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);

    const stem = (key: string) => key.replace(/(?<=\w)\$.*$/, '$').replace(/^(jQuery\d{3})\d+$/, '$1').replace(/^(_reactListening).+$/, '$1').replace(/\d{6,}$/, '');
    const dig = (from: unknown, path: string) => path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | null | undefined)?.[key], from);
    const globals: Record<string, string> = {};
    const mounts: Record<string, Element[]> = {};
    const wholeDocument = new Set<string>();
    const documentProps = Object.getOwnPropertyNames(document).map(stem);
    for (const probe of probes.roots) {
      if (probe.props.some((prop) => documentProps.includes(prop))) wholeDocument.add(probe.key);
    }

    elements.forEach((el, index) => {
      bump(tags, el.localName);
      if (el.localName === 'svg') {
        const get = (name: string) => el.getAttribute(name) ?? '';
        if (Object.keys(svgs).length < 24) bump(svgs, `${get('viewBox')}|${get('stroke-width')}|${get('fill')}|${get('stroke')}`);
        if (get('class').includes('icon')) bump(svgs, 'class~icon');
      }
      for (const token of el.classList) bump(classes, token);
      if (el.id && ids.size < 300) ids.add(el.id.slice(0, 48));
      for (const attr of el.attributes) {
        if (attr.name === 'class' || attr.name === 'style') continue;
        bump(attrs, attr.name);
        if (/^(data-|ng-|q:)/.test(attr.name) && attr.value.length <= 32) {
          const seen = (attrValues[attr.name] ??= new Set());
          if (seen.size < 24) seen.add(attr.value);
        }
      }
      if (el.localName === 'script' && !el.hasAttribute('src')) {
        const type = el.getAttribute('type') ?? '';
        if (el.id || (type && !/javascript|module|ld\+json/.test(type))) scripts.add(`${el.id}|${type}`);
      }
      if (el.localName === 'form') return;
      let own: string[];
      try { own = Object.getOwnPropertyNames(el); } catch { return; }
      if (own.length === 0) return;
      const stems = own.map(stem);
      if ((index < 400 || el.id) && props.size < 80) stems.forEach((key) => props.add(key));
      for (const probe of probes.roots) {
        if (probe.props.some((prop) => stems.includes(prop))) (mounts[probe.key] ??= []).push(el);
      }
      for (const probe of probes.expandos) {
        const at = own[stems.indexOf(probe.prop)];
        if (at === undefined || globals[probe.key]) continue;
        try {
          const value = dig((el as unknown as Record<string, unknown>)[at], probe.path);
          if (typeof value === 'string') globals[probe.key] = value.slice(0, 24);
        } catch {}
      }
    });

    const roots: Record<string, number> = {};
    for (const probe of probes.roots) {
      const found = [...(mounts[probe.key] ?? [])];
      if (probe.selector) {
        try { found.push(...document.querySelectorAll(probe.selector)); } catch {}
      }
      if (wholeDocument.has(probe.key)) { roots[probe.key] = 1; continue; }
      if (found.length === 0) continue;
      const set = new Set(found);
      let covered = 0;
      for (const el of set) {
        let inside = false;
        for (let up = el.parentElement; up; up = up.parentElement) {
          if (set.has(up)) { inside = true; break; }
        }
        if (!inside) covered += el.querySelectorAll('*').length + 1;
      }
      roots[probe.key] = Math.min(1, Math.round((covered / Math.max(1, document.querySelectorAll('body *').length)) * 100) / 100);
    }

    const comments = new Set<string>();
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    for (let i = 0; i < 5000 && comments.size < 60 && walker.nextNode(); i++) {
      comments.add((walker.currentNode.nodeValue ?? '').slice(0, 24));
    }

    const resources = new Set<string>();
    for (const el of document.querySelectorAll('script[src], link[href]')) {
      resources.add((el as HTMLScriptElement).src || (el as HTMLLinkElement).href);
    }
    for (const entry of performance.getEntriesByType('resource')) resources.add(entry.name);

    const win = window as unknown as Record<string, unknown>;
    const readVersion = (value: unknown): string => {
      try {
        const v = value as { version?: unknown; VERSION?: unknown; Version?: unknown; v?: unknown; fn?: { jquery?: unknown } } | null;
        if (typeof value === 'string' && /^\d+(\.\d+){0,3}$/.test(value)) return value;
        if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return '';
        if (v.v instanceof Set) return [...v.v].join(',').slice(0, 24);
        const raw = v.fn?.jquery ?? v.version ?? v.VERSION ?? v.Version;
        if (typeof raw === 'string') return raw.slice(0, 24);
        const full = (raw as { full?: unknown } | undefined)?.full;
        if (typeof full === 'string') return full.slice(0, 24);
        const { major, minor, patch } = (raw ?? {}) as { major?: unknown; minor?: unknown; patch?: unknown };
        if (typeof major === 'number') return `${major}.${minor ?? 0}.${patch ?? 0}`;
        if (Array.isArray(value) && value.every((x) => typeof x === 'string')) return value.join(',').slice(0, 24);
        for (const key of Object.keys(v).slice(0, 40)) {
          const member = (v as Record<string, { VERSION?: unknown } | null>)[key];
          if (member && typeof member.VERSION === 'string') return member.VERSION.slice(0, 24);
        }
        return '';
      } catch { return ''; }
    };
    let baseline: Set<string> | null = null;
    try {
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      document.documentElement.appendChild(frame);
      if (frame.contentWindow) baseline = new Set(Object.getOwnPropertyNames(frame.contentWindow));
      frame.remove();
    } catch {}
    if (baseline) {
      for (const name of Object.getOwnPropertyNames(window)) {
        if (baseline.has(name) || /^\d+$/.test(name) || /^jQuery\d{6,}$/.test(name) || Object.keys(globals).length >= 400) continue;
        const stem = name.replace(/^(__zone_symbol__|__sveltekit_|webpackChunk|webpackJsonp).*$/, '$1');
        try { globals[stem] ||= readVersion(win[name]); } catch {}
      }
    }

    for (const path of probes.paths) {
      try {
        const value = dig(win, path);
        if (typeof value === 'string') globals[path] = value.slice(0, 24);
      } catch {}
    }
    try {
      const hook = win.__REACT_DEVTOOLS_GLOBAL_HOOK__ as { renderers?: Map<unknown, { rendererPackageName?: unknown; version?: unknown }> } | undefined;
      for (const renderer of hook?.renderers?.values() ?? []) {
        const name = typeof renderer.rendererPackageName === 'string' ? renderer.rendererPackageName : 'react-dom';
        if (typeof renderer.version === 'string') globals[`renderer:${name}`] ||= renderer.version.slice(0, 24);
      }
    } catch {}

    const cssVars: Record<string, number> = {};
    const fontFaces = new Set<string>();
    const sheetClasses = new Set<string>();
    const wanted = new Set(probes.classes);
    const wantedVars = new Set(probes.vars);
    const varNames = new Set<string>();
    const layers = new Set<string>();
    const noteVar = (prop: string) => {
      if (wantedVars.has(prop)) varNames.add(prop);
      return prop.match(/^--_?[a-zA-Z0-9]+-?/)?.[0] ?? prop;
    };
    let budget = 60000;
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (budget-- <= 0) return;
        if (rule instanceof CSSFontFaceRule) {
          fontFaces.add(rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim());
        } else if (rule instanceof CSSStyleRule) {
          for (const match of rule.selectorText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
            if (wanted.has(match[1])) sheetClasses.add(match[1]);
          }
          for (const prop of rule.style) {
            if (prop.startsWith('--')) bump(cssVars, noteVar(prop));
          }
        } else if (typeof CSSLayerBlockRule === 'function' && rule instanceof CSSLayerBlockRule) {
          if (rule.name) layers.add(rule.name);
        } else if (typeof CSSLayerStatementRule === 'function' && rule instanceof CSSLayerStatementRule) {
          rule.nameList.forEach((name) => layers.add(name));
        } else if (typeof CSSPropertyRule === 'function' && rule instanceof CSSPropertyRule) {
          bump(cssVars, noteVar(rule.name));
          bump(cssVars, '@property');
        }
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested?.length) visit(nested);
      }
    };
    const sheets: CSSStyleSheet[] = [];
    for (const scope of [document, ...shadows]) {
      try { sheets.push(...scope.styleSheets, ...scope.adoptedStyleSheets); } catch {}
    }
    for (const sheet of new Set(sheets)) {
      try { visit(sheet.cssRules); } catch {}
    }
    try {
      for (const [prop] of document.documentElement.computedStyleMap()) {
        if (prop.startsWith('--')) cssVars[noteVar(prop)] ??= 1;
      }
    } catch {}
    try {
      for (const face of document.fonts) fontFaces.add(face.family.replace(/["']/g, '').trim());
    } catch {}

    return {
      classes, attrs, tags, svgs,
      attrValues: Object.fromEntries(Object.entries(attrValues).map(([k, v]) => [k, [...v]])),
      ids: [...ids], props: [...props], comments: [...comments], scripts: [...scripts],
      generators: Array.from(document.querySelectorAll('meta[name="generator" i]'), (m) => (m.getAttribute('content') ?? '').slice(0, 80)),
      resources: [...resources].slice(0, 600),
      globals, cssVars, cssClasses: [...sheetClasses], cssVarNames: [...varNames], cssLayers: [...layers].slice(0, 60),
      roots, shadowRoots: shadows.length, banners: [], code: {}, fontFaces: [...fontFaces].slice(0, 80),
    };
  }, probeList);
}
