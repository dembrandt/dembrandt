// Pure, DOM-free control geometry. Same contract as logo-heuristics: self-contained,
// serialized into page.evaluate, never throws on values that crossed the DOM boundary.

/** The rendered box of a button or input, as the control-height rule needs it. */
export interface ControlBox {
  /** Rendered height in px, rounded to the nearest pixel. */
  height: number;
  boxSizing: string;
  lineHeight: string;
  minHeight: string;
  /** line-height + vertical padding + vertical border: what the box is when nothing sets height. */
  derivedHeight: number | null;
}

export function controlBox(computed: unknown, rectHeight: unknown): ControlBox | null {
  const height = typeof rectHeight === 'number' && isFinite(rectHeight) ? Math.round(rectHeight) : NaN;
  if (!(height > 0)) return null;
  const c = (computed && typeof computed === 'object' ? computed : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const px = (k: string) => { const n = parseFloat(str(k)); return isFinite(n) ? n : 0; };
  const fontSize = px('fontSize');
  const lineHeight = str('lineHeight');
  // 'normal' has no px value; browsers resolve it near 1.2em
  const line = lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(lineHeight);
  const derived = isFinite(line) && line > 0
    ? Math.round(line + px('paddingTop') + px('paddingBottom') + px('borderTopWidth') + px('borderBottomWidth'))
    : null;
  return {
    height,
    boxSizing: str('boxSizing') || 'content-box',
    lineHeight: lineHeight || 'normal',
    minHeight: str('minHeight') || 'auto',
    derivedHeight: derived,
  };
}

export const CONTROL_BOX_SOURCE: string = controlBox.toString();
