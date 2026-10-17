import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { IconButton } from './Button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Hide the visible title (still announced). */
  hideTitle?: boolean;
  /** Top-aligned (command palette style). */
  top?: boolean;
}

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideTitle,
  top,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 p-4 backdrop-blur-[2px] ${top ? 'items-start pt-[12vh]' : 'items-end sm:items-center'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`flex max-h-[88dvh] w-full ${WIDTHS[size]} flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl outline-none`}
      >
        <div className={`flex items-start gap-3 px-5 pt-4 ${hideTitle ? 'sr-only' : ''}`}>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-[13px] text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2">
            <X size={16} />
          </IconButton>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
