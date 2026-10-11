import { convertColor, deltaE2000 } from './colors.js';
import type { BrandingResult } from './types.js';

export type TokenKind = 'color' | 'dimension';

export interface DesignToken {
  name: string;
  kind: TokenKind;
  /** Lowercase hex for a colour, pixels for a dimension. */
  value: string | number;
  source: string;
}

export type ConformanceCategory = 'color' | 'radius' | 'fontSize';

export interface OffTokenValue {
  category: ConformanceCategory;
  value: string;
  count: number;
  nearest: { name: string; value: string } | null;
  /** ΔE2000 for colours, pixels for dimensions. */
  distance: number | null;
}

export interface CategoryConformance {
  checked: number;
  offToken: number;
}

export interface ConformanceReport {
  checkedAt: string;
  url: string;
  commit: string | null;
  tokenSources: string[];
  tokens: Record<TokenKind, number>;
  categories: Record<ConformanceCategory, CategoryConformance>;
  offToken: OffTokenValue[];
}

/** A rendered colour within this ΔE2000 of a token counts as that token. */
export const COLOR_MATCH_DELTA_E = 2.3;
const ALIAS_DEPTH = 16;
const ROOT_FONT_PX = 16;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

function isObject(v: Json | undefined): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseDimensionPx(value: Json | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const m = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|rem)?$/);
    if (!m) return null;
    return m[2] === 'rem' ? Number(m[1]) * ROOT_FONT_PX : Number(m[1]);
  }
  if (isObject(value) && typeof value.value === 'number') {
    return value.unit === 'rem' ? value.value * ROOT_FONT_PX : value.value;
  }
  return null;
}

function parseColorHex(value: Json | undefined): string | null {
  if (typeof value === 'string') return convertColor(value)?.hex ?? null;
  if (!isObject(value)) return null;
  if (typeof value.hex === 'string') return convertColor(value.hex)?.hex ?? null;
  const c = value.components;
  if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every((n) => typeof n === 'number')) {
    const to255 = (n: Json) => Math.round(Math.min(1, Math.max(0, n as number)) * 255);
    return convertColor(`rgb(${to255(c[0])}, ${to255(c[1])}, ${to255(c[2])})`)?.hex ?? null;
  }
  return null;
}

interface RawToken { path: string; type: string | null; value: Json }

function collectTokens(node: JsonObject, path: string[], inheritedType: string | null, out: RawToken[]): void {
  const type = typeof node.$type === 'string' ? node.$type : inheritedType;
  if ('$value' in node) {
    out.push({ path: path.join('.'), type, value: node.$value });
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$') || !isObject(child)) continue;
    collectTokens(child, [...path, key], type, out);
  }
}

function resolveAlias(value: Json, byPath: Map<string, RawToken>, depth = 0): { value: Json; type: string | null } {
  if (typeof value !== 'string' || !/^\{.+\}$/.test(value) || depth > ALIAS_DEPTH) return { value, type: null };
  const target = byPath.get(value.slice(1, -1));
  if (!target) return { value, type: null };
  const inner = resolveAlias(target.value, byPath, depth + 1);
  return { value: inner.value, type: inner.type ?? target.type };
}

/**
 * Flatten a DTCG document into colour and dimension tokens. Groups pass their
 * `$type` down, `{group.token}` aliases resolve through the whole file, and a
 * typography composite contributes its `fontSize`. Anything else is skipped.
 */
export function readTokenDocument(doc: Json, source: string): DesignToken[] {
  if (!isObject(doc)) return [];
  const raw: RawToken[] = [];
  collectTokens(doc, [], null, raw);
  const byPath = new Map(raw.map((t) => [t.path, t]));
  const tokens: DesignToken[] = [];
  for (const t of raw) {
    const resolved = resolveAlias(t.value, byPath);
    const type = t.type ?? resolved.type;
    if (type === 'typography' && isObject(resolved.value)) {
      const px = parseDimensionPx(resolveAlias(resolved.value.fontSize, byPath).value);
      if (px !== null) tokens.push({ name: `${t.path}.fontSize`, kind: 'dimension', value: px, source });
      continue;
    }
    if (type === 'color') {
      const hex = parseColorHex(resolved.value);
      if (hex) tokens.push({ name: t.path, kind: 'color', value: hex, source });
    } else if (type === 'dimension' || type === 'fontSize') {
      const px = parseDimensionPx(resolved.value);
      if (px !== null) tokens.push({ name: t.path, kind: 'dimension', value: px, source });
    }
  }
  return tokens;
}

export function parseTokenFile(text: string, source: string): DesignToken[] {
  let doc: Json;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error(`${source}: not valid JSON`);
  }
  const tokens = readTokenDocument(doc, source);
  if (tokens.length === 0) throw new Error(`${source}: no colour or dimension tokens found`);
  return tokens;
}

function pxOf(size: string | undefined): number | null {
  const m = String(size ?? '').match(/(-?\d+(?:\.\d+)?)\s*px/);
  return m ? Number(m[1]) : null;
}

interface Rendered { value: string; count: number }

function renderedColors(result: BrandingResult): Rendered[] {
  const rows = result.colors?.detected?.length ? result.colors.detected : (result.colors?.palette ?? []);
  const byHex = new Map<string, number>();
  for (const r of rows) {
    const hex = convertColor(r.normalized ?? r.color)?.hex;
    if (hex) byHex.set(hex, (byHex.get(hex) ?? 0) + (r.count ?? 1));
  }
  return [...byHex].map(([value, count]) => ({ value, count }));
}

function renderedRadii(result: BrandingResult): Rendered[] {
  return (result.borderRadius?.values ?? [])
    .filter((v) => pxOf(v.value) !== null)
    .map((v) => ({ value: `${pxOf(v.value)}px`, count: v.count ?? 1 }));
}

function renderedFontSizes(result: BrandingResult): Rendered[] {
  const bySize = new Map<string, number>();
  for (const s of result.typography?.styles ?? []) {
    const px = pxOf(s.size);
    if (px !== null) bySize.set(`${px}px`, (bySize.get(`${px}px`) ?? 0) + (s.count ?? 1));
  }
  return [...bySize].map(([value, count]) => ({ value, count }));
}

function nearestColor(hex: string, tokens: DesignToken[]) {
  let best: { token: DesignToken; distance: number } | null = null;
  for (const t of tokens) {
    const d = deltaE2000(hex, String(t.value));
    if (!best || d < best.distance) best = { token: t, distance: d };
  }
  return best;
}

function nearestDimension(px: number, tokens: DesignToken[]) {
  let best: { token: DesignToken; distance: number } | null = null;
  for (const t of tokens) {
    const d = Math.abs(px - Number(t.value));
    if (!best || d < best.distance) best = { token: t, distance: d };
  }
  return best;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ConformanceOptions {
  colorDeltaE?: number;
  checkedAt?: string;
  commit?: string | null;
}

/**
 * Every rendered colour, radius and font size against the token set. A colour
 * matches within ΔE2000; a dimension matches on the pixel value. Off-token
 * values carry the nearest token and how far it is, worst offenders first.
 */
export function checkConformance(result: BrandingResult, tokens: DesignToken[], options: ConformanceOptions = {}): ConformanceReport {
  const colorTokens = tokens.filter((t) => t.kind === 'color');
  const dimensionTokens = tokens.filter((t) => t.kind === 'dimension');
  const maxDeltaE = options.colorDeltaE ?? COLOR_MATCH_DELTA_E;
  const offToken: OffTokenValue[] = [];
  const categories: Record<ConformanceCategory, CategoryConformance> = {
    color: { checked: 0, offToken: 0 },
    radius: { checked: 0, offToken: 0 },
    fontSize: { checked: 0, offToken: 0 },
  };

  for (const r of renderedColors(result)) {
    categories.color.checked++;
    const near = nearestColor(r.value, colorTokens);
    if (near && near.distance <= maxDeltaE) continue;
    categories.color.offToken++;
    offToken.push({
      category: 'color', value: r.value, count: r.count,
      nearest: near ? { name: near.token.name, value: String(near.token.value) } : null,
      distance: near ? round(near.distance) : null,
    });
  }

  const dimensionRows: Array<[ConformanceCategory, Rendered[]]> = [
    ['radius', renderedRadii(result)],
    ['fontSize', renderedFontSizes(result)],
  ];
  for (const [category, rows] of dimensionRows) {
    for (const r of rows) {
      categories[category].checked++;
      const near = nearestDimension(Number.parseFloat(r.value), dimensionTokens);
      if (near && near.distance === 0) continue;
      categories[category].offToken++;
      offToken.push({
        category, value: r.value, count: r.count,
        nearest: near ? { name: near.token.name, value: `${near.token.value}px` } : null,
        distance: near ? round(near.distance) : null,
      });
    }
  }

  offToken.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category) || a.value.localeCompare(b.value));
  return {
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    url: result.url,
    commit: options.commit ?? null,
    tokenSources: [...new Set(tokens.map((t) => t.source))],
    tokens: { color: colorTokens.length, dimension: dimensionTokens.length },
    categories,
    offToken,
  };
}

/** The commit a pipeline is checking, from the variables CI systems set. */
export function commitFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.GITHUB_SHA || env.BUILD_SOURCEVERSION || env.CI_COMMIT_SHA || env.BITBUCKET_COMMIT || null;
}
