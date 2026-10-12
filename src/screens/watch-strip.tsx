import { useEffect, useRef } from 'react';

import { FOCUS } from '../components/buttons';
import { CertificatePips } from '../components/certificate-pips';
import { WithEnglishNames } from '../components/english';
import { LockIcon } from '../components/icons';
import type { Dictionary } from '../i18n';
import { certificateFor } from '../state/certificates';
import { bestScore, isUnlocked, type Progress } from '../state/progress';
import { shownVariant, type VariantChoices } from '../state/variants';
import { thumbnailUrl } from '../three/thumbnails';
import { STANDARD, WATCH_ORDER, type WatchId } from '../watches';
import { displayName, watchSummary } from './watch-status';

/**
 * A card's picture: the watch in the variant it is worn in, or the
 * standard's silhouette while it is locked.
 */
function thumbnailOf(
  watch: WatchId,
  unlocked: boolean,
  progress: Progress,
  variants: VariantChoices
): string {
  return thumbnailUrl(
    watch,
    unlocked ? shownVariant(progress, variants, watch).id : STANDARD
  );
}

/**
 * The collection as a row of cards, one per watch: a radio group, so arrow
 * keys move along it and the picked watch is announced. Locked watches show
 * as silhouettes with what unlocks them.
 */
export function WatchStrip({
  t,
  progress,
  variants,
  focused,
  reducedMotion,
  onFocus,
}: {
  t: Dictionary;
  progress: Progress;
  variants: VariantChoices;
  focused: WatchId;
  reducedMotion: boolean;
  onFocus: (watch: WatchId) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Keep the picked card in view (straight there on arrival, gliding after),
  // and keyboard focus on it if it was on the strip, as in a radio group.
  useEffect(() => {
    const card = list.current?.querySelector<HTMLElement>(
      `[data-watch="${focused}"]`
    );
    if (!card) return;
    card.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reducedMotion || !scrolled.current ? 'auto' : 'smooth',
    });
    scrolled.current = true;
    if (list.current?.contains(document.activeElement)) card.focus();
  }, [focused, reducedMotion]);

  return (
    <div
      ref={list}
      role="radiogroup"
      aria-label={t.collection.label}
      data-testid="watch-list"
      // Edge to edge, the picked card centred. Padding percentages count
      // the parent's width, so on a phone (3rem wider than its parent) half
      // a card less half that extra width centres it. Beside the watch the
      // strip ends inside a column, so its ends fade instead of cutting.
      className="-mx-6 flex w-[calc(100%+3rem)] snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto px-[calc(50%-1.5rem)] py-1 wide:mx-0 wide:w-full wide:[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)] wide:px-[calc(50%-3rem)]"
    >
      {WATCH_ORDER.map(id => {
        const unlocked = isUnlocked(progress, id);
        const tier = certificateFor(bestScore(progress, id));
        const checked = id === focused;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-testid="watch-card"
            data-watch={id}
            data-locked={!unlocked}
            className={`relative flex w-24 shrink-0 snap-center flex-col items-center gap-1 rounded-2xl border px-1 pt-1 pb-2 transition-colors ${FOCUS} ${
              checked
                ? 'border-ink/40 bg-ink/[0.07]'
                : 'border-ink/[0.08] bg-transparent hover:border-ink/20'
            }`}
            onClick={() => {
              onFocus(id);
            }}
          >
            {/* Heard as one sentence, its names marked as English. Held
                inside the card (relative), or the hidden text of cards
                scrolled off the strip would widen the page. */}
            <span className="sr-only">
              <WithEnglishNames>
                {watchSummary(t, id, progress)}
              </WithEnglishNames>
            </span>
            <img
              src={thumbnailOf(id, unlocked, progress, variants)}
              alt=""
              width={80}
              height={80}
              loading="lazy"
              decoding="async"
              draggable={false}
              // A silhouette's rim keeps it clear of the dark studios.
              className={`size-16 object-contain ${
                unlocked
                  ? 'brightness-(--thumbnail-brightness)'
                  : 'brightness-0 drop-shadow-[0_0_1px_var(--rim)]'
              }`}
            />
            <span
              lang="en"
              aria-hidden="true"
              className="w-full truncate text-center text-[0.6rem] tracking-[0.08em] text-ink-2 uppercase"
            >
              {displayName(t, id)}
            </span>
            {unlocked ? (
              <span aria-hidden="true">
                <CertificatePips
                  tier={tier}
                  label={
                    tier ? t.certificates[tier] : t.collection.noCertificate
                  }
                />
              </span>
            ) : (
              <span className="text-ink-4" aria-hidden="true">
                <LockIcon />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
