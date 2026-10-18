import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Counts up to `target` once (instant under reduced motion). */
export function useCountUp(target: number, duration = 900): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const base = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - k) ** 3;
      setValue(Math.round(base + (target - base) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return reduced ? target : value;
}
