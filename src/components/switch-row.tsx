import { useId } from 'react';

import { FOCUS } from './buttons';

/**
 * A labelled on/off switch with a short description. The thumb's position
 * and the track's fill both show the state, not colour alone. On a phone
 * held sideways the description is left to screen readers, so every row
 * fits on screen.
 */
export function SwitchRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 short:py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.95rem] text-ink">
          {label}
        </label>
        {description && (
          <p
            id={`${id}-description`}
            className="mt-0.5 text-xs text-ink-3 short:sr-only"
          >
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        className={`group relative h-7 w-12 shrink-0 rounded-full border border-ink/15 bg-ink/[0.06] transition-colors disabled:opacity-40 aria-checked:border-accent/60 aria-checked:bg-accent/25 ${FOCUS}`}
      >
        <span className="absolute top-1/2 left-1 size-5 -translate-y-1/2 rounded-full bg-ink-3 shadow transition-transform group-aria-checked:translate-x-5 group-aria-checked:bg-ink" />
      </button>
    </div>
  );
}
