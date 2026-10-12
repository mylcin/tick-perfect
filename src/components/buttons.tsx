import type { ComponentPropsWithRef, ReactNode } from 'react';

type NativeButton = Omit<ComponentPropsWithRef<'button'>, 'type'>;

/** The one focus ring, on every control. */
export const FOCUS =
  'outline-none focus-visible:ring-[1.5px] focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** The same ring on a label, for the visually hidden input it holds. */
export const FOCUS_WITHIN =
  'has-focus-visible:ring-[1.5px] has-focus-visible:ring-accent/80 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-surface';

// No backdrop blur anywhere: over a canvas that redraws every frame it
// would cost a full-screen blur per frame on phones.
const VARIANTS = {
  // Polished steel: the one action that matters on a screen. In ink, so it
  // is the strongest thing on either studio, with a soft glow (dark) or
  // shadow (light) of the same.
  primary:
    'bg-ink text-surface shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--ink)_45%,transparent)] hover:bg-ink/90',
  secondary:
    'border border-ink/15 bg-surface/70 text-ink hover:border-ink/30 hover:bg-ink/10',
  quiet: 'text-ink-3 hover:text-ink',
} as const;

export function Button({
  variant = 'secondary',
  className = '',
  icon,
  children,
  ...props
}: NativeButton & {
  variant?: keyof typeof VARIANTS;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium tracking-[0.08em] whitespace-nowrap transition-[color,background-color,border-color,opacity,box-shadow] duration-300 aria-disabled:cursor-wait aria-disabled:opacity-60 ${VARIANTS[variant]} ${FOCUS} ${className}`}
      {...props}
    >
      {/* Icons step aside on small phones, upright or sideways, where the
          label needs the room. */}
      {icon && (
        <span className="contents short:hidden compact:hidden">{icon}</span>
      )}
      {children}
    </button>
  );
}

/** A round button with only an icon; `label` is its accessible name. */
export function IconButton({
  label,
  className = '',
  children,
  ...props
}: NativeButton & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-11 place-items-center rounded-full border border-ink/10 bg-surface/50 text-ink-2 transition-colors hover:border-ink/25 hover:text-ink active:border-ink/35 active:bg-ink/10 disabled:opacity-40 ${FOCUS} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
