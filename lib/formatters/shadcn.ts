/**
 * shadcn/ui theme block. A slot is written only when the page supplied a value;
 * an omitted slot keeps shadcn's own default rather than an invention that
 * reads as measured once it is in the file.
 */
import { convertColor, relativeLuminance } from '../colors.js';
import type { Colors, PaletteColor } from '../types.js';

export const SHADCN_SLOTS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
] as const;

export type ShadcnSlot = (typeof SHADCN_SLOTS)[number];

export interface ShadcnInput {
  url?: string;
  colors?: Colors;
  borders?: { combinations?: { color?: string; count?: number }[] };
  borderRadius?: { values?: { value?: string; confidence?: string; count?: number }[] };
  components?: {
    badges?: { all?: { backgroundColor?: string; color?: string }[] };
    inputs?: Record<string, { states?: { default?: Record<string, string>; focus?: Record<string, string> } }[]>;
  };
  meta?: { darkMode?: boolean };
}

export interface ShadcnOptions {
  version?: string;
  dark?: boolean;
  format?: 'oklch' | 'hex' | 'rgb';
}

function onColorOf(palette: PaletteColor[], value?: string | null): string | null {
  if (!value) return null;
  const entry = palette.find((p) => p.color === value || p.normalized === value);
  return entry?.onColor ?? null;
}

function firstInputStates(input: ShadcnInput): { default?: Record<string, string>; focus?: Record<string, string> } | null {
  const groups = Object.values(input.components?.inputs ?? {});
  for (const group of groups) {
    for (const entry of group ?? []) {
      if (entry?.states?.default) return entry.states;
    }
  }
  return null;
}

function ringFrom(boxShadow?: string): string | null {
  return /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(boxShadow ?? '')?.[1] ?? null;
}

/** shadcn's --radius is one length, never a multi-corner shorthand. */
function baseRadius(input: ShadcnInput): string | null {
  const values = input.borderRadius?.values ?? [];
  // values arrive sorted by length, so the first is the smallest, not the one
  // the page actually uses.
  const usable = values
    .filter((v) => v.confidence !== 'low' && v.value && !v.value.trim().includes(' '))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return usable[0]?.value ?? null;
}

export function collectShadcnSlots(input: ShadcnInput): Partial<Record<ShadcnSlot, string>> {
  const semantic = input.colors?.semantic ?? {};
  const palette = input.colors?.palette ?? [];
  const surfaces = palette.filter((p) => p.role === 'surface');
  const badge = input.components?.badges?.all?.[0];
  const states = firstInputStates(input);
  const border = input.borders?.combinations?.[0];

  const slots: Partial<Record<ShadcnSlot, string>> = {};
  const set = (slot: ShadcnSlot, value?: string | null) => {
    if (value) slots[slot] = value;
  };

  set('background', semantic.background);
  set('foreground', semantic.text);
  set('primary', semantic.primary);
  set('primary-foreground', onColorOf(palette, semantic.primary));
  set('secondary', semantic.secondary);
  set('secondary-foreground', onColorOf(palette, semantic.secondary));
  set('accent', semantic.accent);
  set('accent-foreground', onColorOf(palette, semantic.accent));

  const card = cardOf(surfaces, semantic.background);
  set('card', card?.color);
  set('card-foreground', card?.onColor);

  set('muted', badge?.backgroundColor);
  set('muted-foreground', badge?.color);
  set('border', border?.color);
  set('input', states?.default?.borderColor ?? borderColorOf(states?.default?.border));
  set('ring', ringFrom(states?.focus?.boxShadow));

  return slots;
}

/** A raised surface sits near the page in lightness; anything else puts white cards on a dark page. */
function cardOf(surfaces: PaletteColor[], background?: string | null): PaletteColor | null {
  const candidates = surfaces.filter((s) => s.color && s.color !== background);
  const pageL = background ? luminance(background) : null;
  if (pageL === null) return candidates[0] ?? null;
  return candidates
    .map((s) => ({ s, distance: Math.abs((luminance(s.color as string) ?? 1) - pageL) }))
    .filter((x) => x.distance <= 0.25)
    .sort((a, b) => a.distance - b.distance)[0]?.s ?? null;
}

function luminance(value: string): number | null {
  const hex = convertColor(value)?.hex;
  return hex ? relativeLuminance(hex) : null;
}

function borderColorOf(shorthand?: string): string | null {
  if (!shorthand) return null;
  return /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(shorthand)?.[1] ?? null;
}

export function generateShadcnTheme(input: ShadcnInput, options: ShadcnOptions = {}): string {
  const dark = options.dark ?? input.meta?.darkMode ?? false;
  const selector = dark ? '.dark' : ':root';
  const format = options.format ?? 'oklch';
  const translucent = (value: string) => /rgba?\([^)]*,\s*0?\.\d+\s*\)/.test(value) ||
    /^#[0-9a-f]{8}$/i.test(value.trim());
  const slots = collectShadcnSlots(input);
  const radius = baseRadius(input);

  const render = (value: string): string => {
    if (translucent(value)) return value;
    const converted = convertColor(value);
    if (format === 'oklch' && converted?.oklch) return converted.oklch;
    if (format === 'hex' && converted?.hex) return converted.hex;
    return value;
  };

  const written = SHADCN_SLOTS.filter((slot) => slots[slot]);
  const missing = SHADCN_SLOTS.filter((slot) => !slots[slot]);

  const lines: string[] = [];
  lines.push('/* shadcn/ui theme, measured from ' + (input.url ?? 'the page') + '.');
  lines.push(' * Written by dembrandt' + (options.version ? ' ' + options.version : '') + '.');
  lines.push(' * ' + written.length + ' of ' + SHADCN_SLOTS.length + ' slots were observed on the page.');
  if (missing.length) {
    lines.push(' * Not observed, so left to shadcn defaults: ' + missing.join(', ') + '.');
  }
  lines.push(' */');
  lines.push('');
  lines.push(selector + ' {');
  for (const slot of written) lines.push('  --' + slot + ': ' + render(slots[slot] as string) + ';');
  if (radius) lines.push('  --radius: ' + radius + ';');
  lines.push('}');
  lines.push('');

  // Required under Tailwind v4: without it the file looks complete and does nothing.
  lines.push('@theme inline {');
  for (const slot of written) lines.push('  --color-' + slot + ': var(--' + slot + ');');
  if (radius) {
    // max() keeps the ladder valid on a small base: calc(1px - 4px) is a
    // negative radius, which the browser drops.
    lines.push('  --radius-sm: max(0px, calc(var(--radius) - 4px));');
    lines.push('  --radius-md: max(0px, calc(var(--radius) - 2px));');
    lines.push('  --radius-lg: var(--radius);');
    lines.push('  --radius-xl: calc(var(--radius) + 4px);');
  }
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
