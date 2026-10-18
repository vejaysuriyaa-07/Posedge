import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/** Scroll offsets by history entry, so back and forward return to where you were. */
const positions = new Map<string, number>();
/** Frames to wait for a page to grow tall enough to restore into (lazy routes, live queries). */
const RESTORE_FRAMES = 45;

/** Opens each newly visited page at the top; back and forward restore the previous offset. */
export function useScrollReset(): void {
  const { pathname, key } = useLocation();
  const type = useNavigationType();
  const keyRef = useRef(key);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const onScroll = () => positions.set(keyRef.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    keyRef.current = key;
    const target = type === 'POP' ? (positions.get(key) ?? 0) : 0;
    window.scrollTo(0, target);
    if (target <= 0) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= target || ++frames > RESTORE_FRAMES) {
        window.scrollTo(0, target);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Only a change of page counts; key and type describe the navigation that changed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}
