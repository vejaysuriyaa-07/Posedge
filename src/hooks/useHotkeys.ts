import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** True while the user is typing in a field, so single-key shortcuts stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Registers single-key shortcuts ("n", "?", "1", " ", "mod+k"). Keys are matched on
 * `event.key` (lowercased). Ignored while typing, except "mod+" combos. Disabled when
 * `enabled` is false or a modal dialog is open (unless `allowInDialog`).
 */
export function useHotkeys(
  map: HotkeyMap,
  { enabled = true, allowInDialog = false }: { enabled?: boolean; allowInDialog?: boolean } = {},
): void {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = (mod ? 'mod+' : '') + e.key.toLowerCase();
      const handler = ref.current[key];
      if (!handler) return;
      if (!mod && (e.altKey || isTypingTarget(e.target))) return;
      if (!allowInDialog && !mod && document.querySelector('[aria-modal="true"]')) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, allowInDialog]);
}
