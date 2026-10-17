import { useState } from 'react';

import { FOCUS_WITHIN, IconButton } from '../components/buttons';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/modal';
import type { Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { useAppState } from '../state/app';
import {
  collectionSummary,
  masteryOf,
  type CollectionSummary,
  type Mastery,
} from '../state/atelier';
import { isUnlocked } from '../state/progress';
import { useSession } from '../state/session';
import { WATCH_ORDER, WATCHES, type WatchId } from '../watches';

/**
 * The atelier: how much of the collection is done, then, for each watch
 * the collection has opened, the real complication its rule comes from and
 * what is left to master on it. Watches still locked stay out, to be found.
 * Opened from the title, under How to play.
 */
export function AtelierDialog() {
  const t = useT();
  const open = useSession(state => state.atelierOpen);
  const setOpen = useSession(state => state.setAtelierOpen);
  const close = () => {
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      labelledBy="atelier-heading"
      onCancel={close}
      testId="atelier-dialog"
    >
      <div className="absolute inset-0 bg-surface/60" onClick={close} />
      <div className="absolute inset-y-0 left-0 flex w-full animate-rise flex-col overflow-y-auto border-r border-ink/10 bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pr-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] sm:max-w-sm">
        <div className="flex items-center justify-between">
          <h2
            id="atelier-heading"
            className="text-xs tracking-[0.4em] text-ink-2 uppercase"
          >
            {t.atelier.title}
          </h2>
          <IconButton
            label={t.atelier.close}
            data-testid="atelier-close"
            data-autofocus
            onClick={close}
          >
            <CloseIcon />
          </IconButton>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3 short:hidden">
          {t.atelier.intro}
        </p>
        <Ledger t={t} />
      </div>
    </Modal>
  );
}

/** Mounted afresh each time the panel opens, on the watch on show. */
function Ledger({ t }: { t: Dictionary }) {
  const progress = useAppState(state => state.progress);
  const engravings = useAppState(state => state.engravings);
  const shown = useSession(state => state.watch);
  const watches = WATCH_ORDER.filter(id => isUnlocked(progress, id));
  const [picked, setPicked] = useState<WatchId>(() =>
    watches.includes(shown) ? shown : (watches[0] ?? 'diver')
  );

  return (
    <>
      <Summary t={t} summary={collectionSummary(progress, engravings)} />

      <fieldset className="mt-6 border-t border-ink/10 pt-4">
        <legend className="sr-only">{t.atelier.watches}</legend>
        <div className="flex flex-wrap gap-1.5">
          {watches.map(id => (
            <label
              key={id}
              lang="en"
              className={`relative cursor-pointer rounded-full border border-ink/10 px-3 py-1.5 text-xs tracking-[0.08em] text-ink-3 transition-colors hover:text-ink has-checked:border-transparent has-checked:bg-ink has-checked:text-surface ${FOCUS_WITHIN}`}
            >
              <input
                type="radio"
                name="atelier-watch"
                value={id}
                checked={picked === id}
                onChange={() => {
                  setPicked(id);
                }}
                className="sr-only"
              />
              {WATCHES[id].name}
            </label>
          ))}
        </div>
      </fieldset>

      <WatchPage
        t={t}
        watch={picked}
        mastery={masteryOf(picked, progress, engravings)}
      />
    </>
  );
}

/** The collection as a whole: how much is done, and of what. */
function Summary({
  t,
  summary,
}: {
  t: Dictionary;
  summary: CollectionSummary;
}) {
  const tallies = [
    ['watches', summary.watches],
    ['certificates', summary.certificates],
    ['variants', summary.variants],
    ['achievements', summary.achievements],
  ] as const;
  return (
    <section
      aria-labelledby="atelier-collection"
      data-testid="atelier-summary"
      className="mt-5"
    >
      <div className="flex items-baseline justify-between">
        <h3
          id="atelier-collection"
          className="text-[0.65rem] tracking-[0.3em] text-ink-3 uppercase"
        >
          {t.atelier.collection}
        </h3>
        <p
          data-testid="atelier-complete"
          className="text-xs text-ink-2 tabular-nums"
        >
          {t.atelier.complete(summary.share)}
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${String(Math.round(summary.share * 100))}%` }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {tallies.map(([key, tally]) => (
          <div key={key}>
            <dt className="text-[0.6rem] tracking-[0.1em] text-ink-3 uppercase">
              {t.atelier.tallies[key]}
            </dt>
            <dd
              data-testid="atelier-tally"
              data-tally={key}
              className="mt-0.5 text-base font-light text-ink tabular-nums"
            >
              {t.atelier.tally(tally.done, tally.of)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One goal: done or not, said in words for screen readers. */
function Goal({
  t,
  done,
  name,
  detail,
}: {
  t: Dictionary;
  done: boolean;
  name: string;
  detail: string;
}) {
  return (
    <li
      data-testid="atelier-goal"
      data-done={done}
      className="flex items-start gap-2.5 py-1.5"
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rotate-45 border ${
          done ? 'border-accent bg-accent' : 'border-ink/30'
        }`}
      />
      <span className="min-w-0">
        <span className="text-sm text-ink" lang="en">
          {name}
        </span>
        <span className="sr-only">
          {', '}
          {done ? t.atelier.done : t.atelier.todo}
        </span>
        <span className="block text-xs text-ink-3">{detail}</span>
      </span>
    </li>
  );
}

/** A watch's story, and what is left to master on it. */
function WatchPage({
  t,
  watch,
  mastery,
}: {
  t: Dictionary;
  watch: WatchId;
  mastery: Mastery;
}) {
  const story = t.atelier.complications[watch];
  return (
    <article data-testid="atelier-watch" data-watch={watch} className="mt-4">
      <h3 className="text-base text-ink">{story.name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{story.text}</p>
      <p className="mt-3 text-xs text-ink-3">
        <span className="tracking-[0.2em] uppercase">{t.atelier.inGame}</span>
        {' · '}
        {t.rules[watch]}
      </p>

      <div className="mt-5 flex items-baseline justify-between border-t border-ink/10 pt-4">
        <h4
          data-testid="atelier-mastery"
          className="text-[0.65rem] tracking-[0.3em] text-ink-3 uppercase"
        >
          {t.atelier.mastery(mastery.done, mastery.of)}
        </h4>
        <p className="text-xs text-ink-2 tabular-nums">
          {t.atelier.best(mastery.best)}
        </p>
      </div>
      <ul className="mt-2">
        {mastery.certificates.map(goal => (
          <Goal
            key={goal.tier}
            t={t}
            done={goal.done}
            name={t.certificates[goal.tier]}
            detail={t.atelier.certificateGoal(goal.score)}
          />
        ))}
        {mastery.variants.map(goal => (
          <Goal
            key={goal.id}
            t={t}
            done={goal.done}
            name={t.variants.names[goal.id]}
            detail={t.atelier.variantGoal(t.certificates[goal.tier])}
          />
        ))}
        {mastery.engravings.map(goal => (
          <Goal
            key={goal.id}
            t={t}
            done={goal.done}
            name={t.engravings.names[goal.id]}
            detail={t.engravings.rules[goal.id]}
          />
        ))}
      </ul>
    </article>
  );
}
