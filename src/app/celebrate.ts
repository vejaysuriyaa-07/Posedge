import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

/**
 * Confetti, reserved for: milestone done, all Big 3 done, level up, weekly review done,
 * and review sessions of 10+ cards. Respects settings.confetti and prefers-reduced-motion.
 */
export function celebrate(enabled: boolean): void {
  if (!enabled || prefersReducedMotion()) return;
  void confetti({
    particleCount: 110,
    spread: 75,
    startVelocity: 38,
    origin: { y: 0.72 },
    colors: ['#a78bfa', '#38bdf8', '#fde68a', '#34d399', '#f0abfc'],
    disableForReducedMotion: true,
  });
}
