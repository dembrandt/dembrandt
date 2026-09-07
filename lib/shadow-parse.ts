/**
 * box-shadow parsing.
 *
 * A shadow is a comma-separated list of layers, and a layer carries its colour
 * either first (computed styles) or last (authored CSS), so position alone does
 * not identify a component.
 */

export interface ShadowLayer {
  inset: boolean;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string | null;
}

/** Split a comma-separated CSS list, ignoring commas inside colour functions. */
export function splitShadowLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of String(value ?? '')) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      if (current.trim()) layers.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) layers.push(current.trim());
  return layers;
}

/** Split a layer into whitespace-separated tokens, keeping colour functions whole. */
function tokenize(layer: string): string[] {
  return layer.match(/[a-z-]+\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s]+/gi) ?? [];
}

const LENGTH = /^[+-]?(\d*\.)?\d+(px|rem|em|%|pt|vh|vw|ch|ex)?$/i;

export function parseShadowLayer(layer: string): ShadowLayer | null {
  const tokens = tokenize(layer);
  const inset = tokens.some(t => t.toLowerCase() === 'inset');
  const rest = tokens.filter(t => t.toLowerCase() !== 'inset');

  const lengths = rest.filter(t => LENGTH.test(t));
  if (lengths.length < 2) return null;

  const color = rest.find(t => !LENGTH.test(t)) ?? null;
  const [offsetX, offsetY, blur = '0px', spread = '0px'] = lengths;
  return { inset, offsetX, offsetY, blur, spread, color };
}

export function parseShadow(value: string): ShadowLayer[] {
  return splitShadowLayers(value)
    .map(parseShadowLayer)
    .filter((l): l is ShadowLayer => l !== null);
}

const px = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

/**
 * How high a shadow lifts its element, for ordering an elevation ladder. Blur
 * dominates, vertical offset carries the rest; a single layer's blur is not
 * comparable across multi-layer shadows because the layers stack.
 */
export function shadowDepth(value: string): number {
  const layers = parseShadow(value);
  if (!layers.length) return 0;
  return Math.max(
    ...layers.map(l => px(l.blur) + Math.abs(px(l.offsetY)) + Math.max(0, px(l.spread)))
  );
}
