import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { IconButton } from './Button';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
}

/** Side sheet on desktop, bottom sheet on phones. Traps focus and closes on Escape. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-end bg-black/45 backdrop-blur-[2px] md:items-stretch"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`animate-sheet-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl outline-none md:max-h-none md:rounded-none md:border-y-0 md:border-r-0 ${width === 'lg' ? 'md:max-w-2xl' : 'md:max-w-md'}`}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base">
              {title}
            </h2>
            {subtitle ? <div className="mt-1 text-[13px] text-muted">{subtitle}</div> : null}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2">
            <X size={16} />
          </IconButton>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="safe-bottom flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
