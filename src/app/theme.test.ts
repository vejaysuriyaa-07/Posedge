import { describe, expect, it } from 'vitest';
import { applyTheme, storedTheme } from './theme';

describe('theme', () => {
  it('toggles the dark class and persists the choice', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(storedTheme()).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(storedTheme()).toBe('dark');
  });
});
