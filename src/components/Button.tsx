import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:brightness-110 shadow-card',
  secondary: 'border border-border bg-surface text-fg hover:bg-elevated shadow-card',
  ghost: 'text-muted hover:bg-elevated hover:text-fg',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-8 pointer-coarse:min-h-10 px-2.5 text-[13px] gap-1.5',
  md: 'min-h-10 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});

/** Square icon button with an accessible label. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }
>(function IconButton({ label, size = 'md', className = '', type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-grid shrink-0 place-items-center rounded-lg text-muted transition hover:bg-elevated hover:text-fg disabled:opacity-50 ${size === 'sm' ? 'size-8 pointer-coarse:size-10' : 'size-10'} ${className}`}
      {...rest}
    />
  );
});
