/** Brain HUD palette: always dark, arc-reactor cyan with amber for things that need attention. */
export const HUD = {
  bg: '#03060b',
  cyan: '#67e8f9',
  cyanDeep: '#22d3ee',
  ice: '#e0faff',
  amber: '#fbbf24',
  navy: '#04121f',
  font: '"Orbitron Variable", ui-monospace, "SFMono-Regular", Menlo, monospace',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  emoji: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
} as const;

/** "#rrggbb" + alpha → "rgba(...)". */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

export type CoreActivity = 'idle' | 'thinking' | 'speaking';
