import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'default' | 'success' | 'xp' | 'warn';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  toast: (t: ToastInput | string) => void;
  /** Screen-reader-only announcement (aria-live polite). */
  announce: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {}, announce: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TONE: Record<ToastTone, string> = {
  default: '',
  success: 'text-ok',
  xp: 'text-brand font-semibold tabular',
  warn: 'text-warn',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput | string) => {
      const t = typeof input === 'string' ? { message: input } : input;
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.duration ?? (t.action ? 6000 : 3500));
    },
    [dismiss],
  );

  const announce = useCallback((message: string) => {
    // Toggle content so repeated identical messages are re-announced.
    setAnnouncement('');
    setTimeout(() => setAnnouncement(message), 30);
  }, []);

  const api = useMemo(() => ({ toast, announce }), [toast, announce]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              role="status"
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-elevated px-4 py-2.5 text-sm shadow-xl"
            >
              <span className={TONE[t.tone ?? 'default']}>{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  className="min-h-8 rounded-md px-2 font-semibold text-brand hover:bg-brand/10"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss"
                className="-mr-1 grid size-7 place-items-center rounded-md text-muted hover:text-fg"
                onClick={() => dismiss(t.id)}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
