import type { Dictionary } from '../i18n';
import {
  collectionProgress,
  COLLECTION_ENGRAVINGS,
  engravedOn,
  ROUND_ENGRAVINGS,
  type EngravingContext,
  type EngravingId,
  type Engravings,
} from '../state/engravings';
import type { WatchId } from '../watches';

/**
 * What the caseback on show carries and could, one line each: the watch's
 * own engravings, then, past a rule, the collection's. Shown on the title
 * in place of the variants while the watch is turned over.
 */
export function CasebackPanel({
  t,
  watch,
  name,
  engravings,
  context,
}: {
  t: Dictionary;
  watch: WatchId;
  name: string;
  engravings: Engravings;
  context: EngravingContext;
}) {
  const engraved = new Set(engravedOn(engravings, watch));
  const progress = collectionProgress(context);
  const row = (
    id: EngravingId,
    counted: { now: number; of: number } | null
  ) => {
    const done = engraved.has(id);
    return (
      <li
        key={id}
        data-testid="engraving-row"
        data-engraving={id}
        data-done={done}
        className="flex items-baseline gap-2"
      >
        {/* Engraved or not is told by the mark's shape, not its colour. */}
        <span
          aria-hidden="true"
          className={done ? 'text-accent' : 'text-ink-3'}
        >
          {done ? '✓' : '○'}
        </span>
        <span lang="en" className="shrink-0 text-ink">
          {t.engravings.names[id]}
        </span>
        <span className="sr-only">
          {done ? `, ${t.engravings.done}:` : ':'}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-ink-3">
          {t.engravings.rules[id]}
        </span>
        {!done && counted && (
          <span className="shrink-0 text-ink-2 tabular-nums">
            {t.engravings.progress(counted.now, counted.of)}
          </span>
        )}
      </li>
    );
  };
  return (
    <section
      data-testid="caseback-panel"
      aria-labelledby="caseback-heading"
      className="mx-auto mt-2 w-full max-w-xs text-[0.7rem] leading-5"
    >
      <h3 id="caseback-heading" className="sr-only">
        {t.engravings.heading(name)}
      </h3>
      <p className="mb-1 text-center text-ink-3">{t.engravings.intro}</p>
      <ul aria-label={t.engravings.onThisWatch}>
        {ROUND_ENGRAVINGS.map(id => row(id, null))}
      </ul>
      <ul
        aria-label={t.engravings.onEvery}
        className="mt-1 border-t border-ink/10 pt-1"
      >
        {COLLECTION_ENGRAVINGS.map(id => row(id, progress[id]))}
      </ul>
    </section>
  );
}
