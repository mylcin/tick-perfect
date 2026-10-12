import { useRef, useState, type KeyboardEvent } from 'react';

import { FOCUS } from '../components/buttons';
import { LockIcon } from '../components/icons';
import type { Dictionary } from '../i18n';
import type { Progress } from '../state/progress';
import {
  isVariantEarned,
  shownVariant,
  variantScore,
  type VariantChoices,
} from '../state/variants';
import {
  VARIANTS,
  WATCHES,
  withVariant,
  type VariantId,
  type WatchId,
  type WatchSpec,
  type WatchVariant,
} from '../watches';

/** Arrow keys and Home/End step through the swatches, wrapping round. */
const STEPS: Readonly<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/**
 * A swatch's colours: the dial in the middle, ringed by what frames it on
 * the wrist (the bezel insert, or else the strap or bracelet).
 */
function swatchOf(spec: WatchSpec): { face: string; ring: string } {
  const { bezel, strap } = spec;
  const face = spec.dial.color;
  switch (bezel.type) {
    case 'gmt24':
      // Night over the top half, as the bezel wears it.
      return {
        face,
        ring: `conic-gradient(from -90deg, ${bezel.nightColor} 0 50%, ${bezel.dayColor} 0)`,
      };
    case 'diveTimer':
    case 'minutes60':
      return { face, ring: bezel.insertColor };
    default:
      return {
        face,
        ring: 'color' in strap ? strap.color : spec.case.metal.color,
      };
  }
}

/**
 * The colourways of an unlocked watch as a row of swatches: a radio group,
 * so the arrows move along it (and not through the collection). Ones not
 * yet earned can be looked at but not picked, and say what earns them.
 */
export function VariantPicker({
  t,
  watch,
  progress,
  choices,
  onChoose,
}: {
  t: Dictionary;
  watch: WatchId;
  progress: Progress;
  choices: VariantChoices;
  onChoose: (variant: VariantId) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  /** The swatch under the pointer or focus, captioned in place of the pick. */
  const [active, setActive] = useState<VariantId | null>(null);
  const variants = VARIANTS[watch];
  const shown = shownVariant(progress, choices, watch);
  const requirement = (variant: WatchVariant) =>
    variant.earnedBy
      ? t.variants.requirement(
          t.certificates[variant.earnedBy],
          variantScore(variant)
        )
      : '';
  const captioned = variants.find(({ id }) => id === active) ?? shown;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    if (!step || event.ctrlKey || event.altKey || event.metaKey) return;
    // Kept from the title, whose arrows would browse the collection.
    event.preventDefault();
    event.stopPropagation();
    const buttons = [
      ...(group.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []),
    ];
    const index = buttons.findIndex(
      button => button === document.activeElement
    );
    const next = step(Math.max(index, 0), buttons.length);
    buttons[next]?.focus();
    const variant = variants[next];
    if (variant && isVariantEarned(progress, watch, variant)) {
      onChoose(variant.id);
    }
  };

  // The swatches sit on the column's centre line, the caption beside them.
  return (
    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <span aria-hidden="true" />
      <div
        ref={group}
        role="radiogroup"
        aria-label={t.variants.label}
        data-testid="variant-picker"
        className="flex gap-3"
        onKeyDown={onKeyDown}
      >
        {variants.map(variant => {
          const earned = isVariantEarned(progress, watch, variant);
          const checked = variant.id === shown.id;
          const { face, ring } = swatchOf(
            withVariant(WATCHES[watch], variant.id)
          );
          const describedBy = `variant-requirement-${variant.id}`;
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={!earned}
              aria-label={t.variants.names[variant.id]}
              aria-describedby={earned ? undefined : describedBy}
              tabIndex={checked ? 0 : -1}
              data-testid="variant-swatch"
              data-variant={variant.id}
              data-earned={earned}
              // 32 px to the eye, 44 px to a finger.
              className={`relative size-8 rounded-full border-2 p-0.5 after:absolute after:-inset-1.5 after:content-[''] ${FOCUS} ${
                checked
                  ? 'border-ink'
                  : 'border-transparent hover:border-ink/30'
              } ${earned ? '' : 'cursor-not-allowed'}`}
              onClick={() => {
                if (earned) onChoose(variant.id);
              }}
              onFocus={() => {
                setActive(variant.id);
              }}
              onBlur={() => {
                setActive(null);
              }}
              onPointerEnter={() => {
                setActive(variant.id);
              }}
              onPointerLeave={event => {
                // A lifted finger leaves too: a tapped swatch keeps its
                // caption, as iOS doesn't focus what is tapped.
                if (event.pointerType === 'mouse') setActive(null);
              }}
            >
              <span
                aria-hidden="true"
                // A hairline keeps a swatch the backdrop's colour clear of it.
                className="block size-full rounded-full p-[3px] inset-ring inset-ring-ink/22"
                style={{ background: ring }}
              >
                <span
                  className="block size-full rounded-full"
                  style={{ background: face }}
                />
              </span>
              {!earned && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0.5 grid place-items-center rounded-full bg-surface/45 text-ink [&_svg]:size-3.5"
                >
                  <LockIcon />
                </span>
              )}
              {!earned && (
                <span id={describedBy} hidden>
                  {requirement(variant)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* What the swatch in view is, and what earns it; the radios say
          the same to screen readers. Every caption is laid in one cell, so
          the row keeps the widest one's width and the swatches stay put. */}
      <p
        aria-hidden="true"
        data-testid="variant-caption"
        className="grid min-w-0 justify-self-start text-left text-xs text-ink-3 short:hidden compact:hidden"
      >
        {variants.map(variant => (
          <span
            key={variant.id}
            className={`flex h-8 flex-col justify-center [grid-area:1/1] ${
              variant.id === captioned.id ? '' : 'invisible'
            }`}
          >
            <span className="text-ink-2">{t.variants.names[variant.id]}</span>
            {!isVariantEarned(progress, watch, variant) && (
              <span className="text-[0.7rem]">{requirement(variant)}</span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
