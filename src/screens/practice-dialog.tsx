import { useEffect, useRef, useState } from 'react';

import { Button, FOCUS_WITHIN } from '../components/buttons';
import { RetryIcon } from '../components/icons';
import { Modal } from '../components/modal';
import { PRACTICE_PACES, type PracticePace } from '../game';
import type { Dictionary } from '../i18n';
import { wholeRate, type TimingStats } from '../state/timegrapher';
import { useTextTop } from './use-text-top';

/** How a practice set went: nothing of it is saved. */
export interface PracticeResult {
  /** Targets in the set. */
  readonly of: number;
  readonly hits: number;
  readonly perfects: number;
  readonly misses: number;
  readonly bestStreak: number;
  /** The hits' rate and spread; null with too few to say. */
  readonly timing: TimingStats | null;
  readonly pace: PracticePace;
}

/** Keys pressed this soon after the results open are left from the set. */
const ARM_MS = 500;

/**
 * The end of a practice set: how many targets were hit, Perfect and
 * missed, the best streak and the timing, then another set (at either
 * pace) or the title.
 */
export function PracticeDialog({
  t,
  result,
  onAgain,
  onMenu,
}: {
  t: Dictionary;
  result: PracticeResult | null;
  onAgain: (pace: PracticePace) => void;
  onMenu: () => void;
}) {
  // The results stay in the dialog as it fades out after Again.
  const [kept, keep] = useState(result);
  if (result !== null && result !== kept) keep(result);
  return (
    <Modal
      open={result !== null}
      labelledBy="practice-heading"
      describedBy="practice-summary"
      testId="practice-dialog"
      onCancel={onMenu}
    >
      {kept && (
        <PracticePanel
          // Afresh for every set, so the pace starts on the one just played.
          key={`${String(kept.hits)}-${String(kept.misses)}-${kept.pace}`}
          t={t}
          result={kept}
          onAgain={onAgain}
          onMenu={onMenu}
        />
      )}
    </Modal>
  );
}

function PracticePanel({
  t,
  result,
  onAgain,
  onMenu,
}: {
  t: Dictionary;
  result: PracticeResult;
  onAgain: (pace: PracticePace) => void;
  onMenu: () => void;
}) {
  const [pace, setPace] = useState(result.pace);
  const [armed, setArmed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useTextTop(panel);
  useEffect(() => {
    const timer = setTimeout(() => {
      setArmed(true);
    }, ARM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const readouts = [
    ['perfects', t.practice.perfects, String(result.perfects)],
    ['misses', t.practice.misses, String(result.misses)],
    ['bestStreak', t.practice.bestStreak, String(result.bestStreak)],
    [
      'rate',
      t.practice.rate,
      result.timing
        ? t.timegrapher.rateValue(wholeRate(result.timing.rate))
        : '–',
    ],
    [
      'spread',
      t.practice.spread,
      result.timing
        ? t.timegrapher.spreadValue(Math.round(result.timing.spread))
        : '–',
    ],
  ] as const;

  return (
    <div
      ref={panel}
      className="absolute inset-x-0 bottom-0 flex max-h-dvh animate-rise flex-col items-center overflow-y-auto pt-16 pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] wide:inset-x-auto wide:inset-y-0 wide:right-0 wide:w-[45%] wide:justify-center-safe wide:bg-linear-to-l wide:from-studio wide:from-35% wide:to-transparent wide:pt-6 wide:pb-6 short:w-[56%] short:pt-3 short:pr-[max(1rem,env(safe-area-inset-right))] short:pb-3 short:pl-4 compact:pb-[max(1rem,env(safe-area-inset-bottom))] upright:shade"
      onKeyDown={event => {
        if (
          (event.key === ' ' || event.key === 'Enter') &&
          (!armed || event.repeat)
        ) {
          event.preventDefault();
        }
      }}
    >
      <h2
        id="practice-heading"
        className="text-xs tracking-[0.5em] text-ink-2 uppercase"
      >
        {t.practice.title}
      </h2>
      <p
        id="practice-summary"
        data-testid="practice-hits"
        className="mt-3 text-3xl font-light text-ink tabular-nums short:mt-2 short:text-2xl"
      >
        {t.practice.hits(result.hits, result.of)}
      </p>

      <dl className="mt-4 grid w-full max-w-sm grid-cols-3 gap-x-4 gap-y-3 text-center short:mt-3 short:grid-cols-5 short:gap-x-2">
        {readouts.map(([key, label, value]) => (
          <div key={key}>
            <dt className="text-[0.6rem] tracking-[0.25em] text-ink-3 uppercase short:tracking-[0.1em]">
              {label}
            </dt>
            <dd
              data-testid="practice-readout"
              data-readout={key}
              className="mt-0.5 text-base font-light text-ink tabular-nums"
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <fieldset className="mt-5 short:mt-3">
        <legend className="sr-only">{t.practice.pace}</legend>
        <div className="flex gap-1.5">
          {PRACTICE_PACES.map(option => (
            <label
              key={option}
              className={`relative cursor-pointer rounded-full border border-ink/10 px-4 py-1.5 text-xs tracking-[0.08em] text-ink-3 transition-colors hover:text-ink has-checked:border-transparent has-checked:bg-ink has-checked:text-surface ${FOCUS_WITHIN}`}
            >
              <input
                type="radio"
                name="practice-pace"
                value={option}
                checked={pace === option}
                onChange={() => {
                  setPace(option);
                }}
                className="sr-only"
              />
              {t.practice.paces[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-3 short:mt-3 short:flex short:max-w-none short:justify-center short:gap-2">
        <Button
          variant="primary"
          data-autofocus
          icon={<RetryIcon />}
          className="short:px-4"
          onClick={() => {
            onAgain(pace);
          }}
        >
          {t.practice.again}
        </Button>
        <Button variant="quiet" className="short:px-4" onClick={onMenu}>
          {t.practice.menu}
        </Button>
      </div>
      <p className="mt-4 max-w-xs text-center text-[0.7rem] text-balance text-ink-3 short:hidden">
        {t.practice.note}
      </p>
    </div>
  );
}
