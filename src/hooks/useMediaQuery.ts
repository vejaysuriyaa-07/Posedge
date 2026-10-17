import { useCallback, useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, kept live (false where matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener?.('change', cb);
      return () => mq?.removeEventListener?.('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => !!window.matchMedia?.(query).matches,
    () => false,
  );
}
