import { describe, expect, it } from 'vitest';
import { COLOR_KEYS } from '../db/types';
import {
  compositeOver,
  contrastRatio,
  projectColorCss,
  relativeLuminance,
  SURFACES,
  textOnTintHex,
  tintOver,
} from './colors';

describe('colors', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('composites a translucent color over a surface', () => {
    expect(compositeOver('#ffffff', 0.5, '#000000')).toBe('#808080');
    expect(compositeOver('#ff0000', 0, '#123456')).toBe('#123456');
  });

  for (const mode of ['dark', 'light'] as const) {
    for (const surfaceName of ['bg', 'surface', 'elevated'] as const) {
      it(`text on tint passes AA for every color on the ${mode} ${surfaceName}`, () => {
        const surface = SURFACES[mode][surfaceName];
        for (const color of COLOR_KEYS) {
          const ratio = contrastRatio(textOnTintHex(color, mode), tintOver(color, mode, surface));
          expect(ratio, `${color} in ${mode} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it('emits light and dark variables for every color', () => {
    const css = projectColorCss();
    for (const color of COLOR_KEYS) {
      expect(css).toContain(`[data-pc="${color}"]{--pc:`);
      expect(css).toContain(`.dark [data-pc="${color}"]{--pc:`);
    }
  });
});
