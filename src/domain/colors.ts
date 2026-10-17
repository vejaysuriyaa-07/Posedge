import type { ColorKey } from '../db/types';

/**
 * Tailwind palette shades used for project colors (sRGB hex values of the Tailwind palette).
 * Accent: 400 in dark mode, 600 in light mode. Tint: accent at 14% over the surface.
 * Text on tint: 200 in dark mode, 800 in light mode (keeps WCAG AA, see colors.test.ts).
 */
export const PALETTE: Record<ColorKey, Record<200 | 300 | 400 | 600 | 700 | 800, string>> = {
  violet: {
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
  },
  sky: {
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
  },
  emerald: {
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
  },
  amber: {
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
  },
  rose: {
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    600: '#e11d48',
    700: '#be123c',
    800: '#9f1239',
  },
  teal: {
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
  },
  indigo: {
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
  },
  orange: {
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
  },
  lime: {
    200: '#d9f99d',
    300: '#bef264',
    400: '#a3e635',
    600: '#65a30d',
    700: '#4d7c0f',
    800: '#3f6212',
  },
  fuchsia: {
    200: '#f5d0fe',
    300: '#f0abfc',
    400: '#e879f9',
    600: '#c026d3',
    700: '#a21caf',
    800: '#86198f',
  },
};

export const COLOR_LABELS: Record<ColorKey, string> = {
  violet: 'Violet',
  sky: 'Sky',
  emerald: 'Emerald',
  amber: 'Amber',
  rose: 'Rose',
  teal: 'Teal',
  indigo: 'Indigo',
  orange: 'Orange',
  lime: 'Lime',
  fuchsia: 'Fuchsia',
};

export type Mode = 'dark' | 'light';

/** Theme surfaces from SPEC section 8. */
export const SURFACES: Record<Mode, { bg: string; surface: string; elevated: string }> = {
  dark: { bg: '#0b0d12', surface: '#141821', elevated: '#1b2030' },
  light: { bg: '#f7f8fa', surface: '#ffffff', elevated: '#ffffff' },
};

export const TINT_ALPHA = 0.14;

export function accentHex(color: ColorKey, mode: Mode): string {
  return PALETTE[color][mode === 'dark' ? 400 : 600];
}

export function textOnTintHex(color: ColorKey, mode: Mode): string {
  return PALETTE[color][mode === 'dark' ? 200 : 800];
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Alpha-composites `fg` at `alpha` over the opaque `bg`. */
export function compositeOver(fg: string, alpha: number, bg: string): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex(
    [0, 1, 2].map((i) => f[i]! * alpha + b[i]! * (1 - alpha)) as [number, number, number],
  );
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The opaque tint color as rendered over a given surface. */
export function tintOver(color: ColorKey, mode: Mode, surface: string): string {
  return compositeOver(accentHex(color, mode), TINT_ALPHA, surface);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 * CSS that exposes each project color as variables on `[data-pc="<color>"]`:
 * `--pc` accent, `--pc-tint` translucent tint, `--pc-fg` AA-safe text on tint.
 * Generated from PALETTE so there is a single source of truth.
 */
export function projectColorCss(): string {
  const rules: string[] = [];
  for (const key of Object.keys(PALETTE) as ColorKey[]) {
    for (const mode of ['light', 'dark'] as const) {
      const sel = mode === 'dark' ? `.dark [data-pc="${key}"]` : `[data-pc="${key}"]`;
      rules.push(
        `${sel}{--pc:${accentHex(key, mode)};--pc-tint:${rgba(accentHex(key, mode), TINT_ALPHA)};--pc-fg:${textOnTintHex(key, mode)}}`,
      );
    }
  }
  return rules.join('\n');
}
