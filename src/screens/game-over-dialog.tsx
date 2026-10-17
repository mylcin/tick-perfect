import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/buttons';
import { WithEnglishNames } from '../components/english';
import { RetryIcon } from '../components/icons';
import { LevelMeter } from '../components/level-meter';
import { Modal } from '../components/modal';
import { ReserveGauge } from '../components/reserve-gauge';
import type { MissReason, NearMiss } from '../game';
import type { Dictionary } from '../i18n';
import { listOf } from '../i18n/format';
import { useStorageWorks } from '../state/app';
import { nextDailyAfter, type DailyOutcome } from '../state/daily';
import type { BeatStatus } from '../state/modes';
import type { ScoreRecord } from '../state/progress';
import type { EngravingId } from '../state/engravings';
import type { Goal } from '../state/results';
import { wholeRate, type TimingStats } from '../state/timegrapher';
import { WATCHES, type VariantId, type WatchId } from '../watches';
import { RankedLine } from './ranked-line';
import { beatText, dailyResultText } from './result-text';
import { useTextTop } from './use-text-top';
import { displayName } from './watch-status';

/** What a round counted for, by the mode it was played in. */
export type RoundOutcome =
  | (ScoreRecord & {
      readonly kind: 'collection';
      /** The nearest thing the round fell short of. */
      readonly goal: Goal | null;
      /** Variants of the watch the round earned. */
      readonly variants: readonly VariantId[];
    })
  | {
      readonly kind: 'daily';
      readonly number: number;
      readonly daily: DailyOutcome;
      /** Against a challenge's score, when one led here. */
      readonly beat: BeatStatus | null;
    }
  | { readonly kind: 'challenge'; readonly beat: BeatStatus }
  /** A race against the watch's best round, which counts for nothing. */
  | { readonly kind: 'ghost'; readonly beat: BeatStatus };

/** One side of a race: hits, Perfects and spread (null with too few). */
interface RaceSide {
  readonly hits: number;
  readonly perfects: number;
  readonly spread: number | null;
}

/** The round beside the ghost it raced. */
export interface GhostComparison {
  readonly ghost: RaceSide & { readonly score: number };
  readonly you: RaceSide;
}

export interface RoundResult {
  readonly score: number;
  readonly reason: MissReason;
  /** How far outside the window an early or late tap landed. */
  readonly nearMiss: NearMiss | null;
  /** The round's rate and spread, when it had hits enough to tell. */
  readonly timing: TimingStats | null;
  readonly outcome: RoundOutcome;
  /** What the round engraved on the casebacks. */
  readonly engraved: readonly EngravingId[];
  /** The ghost it raced, if any. */
  readonly ghost: GhostComparison | null;
}

/**
 * The results, in the bottom of the screen under the cracked watch: why the
 * round ended and by how much, the score and the best (the day's best on a
 * Daily, the score to beat on a challenge), what was nearly in reach or
 * just earned, and Retry first.
 */
export function GameOverDialog({
  t,
  result,
  onRetry,
  onPlayWatch,
  onMenu,
}: {
  t: Dictionary;
  result: RoundResult | null;
  onRetry: () => void;
  onPlayWatch: (watch: WatchId) => void;
  onMenu: () => void;
}) {
  // The results stay in the dialog as it fades out after Retry.
  const [kept, keep] = useState(result);
  if (result !== null && result !== kept) keep(result);
  return (
    <Modal
      open={result !== null}
      labelledBy="game-over-heading"
      describedBy="game-over-summary"
      testId="game-over-dialog"
      // Escape, or Back on Android, goes back to the title.
      onCancel={onMenu}
    >
      {kept && (
        <ResultPanel
          t={t}
          result={kept}
          onRetry={onRetry}
          onPlayWatch={onPlayWatch}
          onMenu={onMenu}
        />
      )}
    </Modal>
  );
}

function goalText(t: Dictionary, goal: Goal): string {
  switch (goal.kind) {
    case 'unlock':
      return t.gameOver.toUnlock(goal.points, WATCHES[goal.watch].name);
    case 'certificate':
      return t.gameOver.toCertificate(goal.points, t.certificates[goal.tier]);
    case 'level':
      return t.gameOver.toLevel(goal.points, goal.level);
    case 'best':
      return t.gameOver.toBest(goal.points);
  }
}

/** The heading, the second figure and the summary, by mode. */
function shownFor(t: Dictionary, result: RoundResult) {
  const { score, outcome } = result;
  switch (outcome.kind) {
    case 'collection':
      return {
        title: t.gameOver.title,
        second: { label: t.gameOver.best, value: outcome.best },
        isNewBest: outcome.isNewBest,
        summary: t.announce.gameOver(score, outcome.best, outcome.isNewBest),
        beat: null,
      };
    case 'daily':
      return {
        title: t.daily.name(outcome.number),
        // A round that was not counted has no day's best to show.
        second:
          outcome.daily.best === null
            ? null
            : { label: t.gameOver.today, value: outcome.daily.best },
        isNewBest: outcome.daily.isNewBest,
        summary: dailyResultText(
          t,
          outcome.number,
          score,
          outcome.daily,
          outcome.beat
        ),
        beat: outcome.beat,
      };
    case 'ghost':
      return {
        title: t.ghost.title,
        second: { label: t.gameOver.toBeat, value: outcome.beat.toBeat },
        isNewBest: false,
        summary: `${t.announce.roundOver(score)} ${beatText(t, outcome.beat)}`,
        beat: outcome.beat,
      };
    case 'challenge':
      return {
        title: t.challenge.title,
        second: { label: t.gameOver.toBeat, value: outcome.beat.toBeat },
        isNewBest: false,
        summary: `${t.announce.roundOver(score)} ${beatText(t, outcome.beat)}`,
        beat: outcome.beat,
      };
  }
}

/**
 * Keys pressed this soon after the results open are a reflex left over from
 * the round, not a choice: they would skip the results unread.
 */
const ARM_MS = 500;

/** Mounted afresh for every result. */
function ResultPanel({
  t,
  result,
  onRetry,
  onPlayWatch,
  onMenu,
}: {
  t: Dictionary;
  result: RoundResult;
  onRetry: () => void;
  onPlayWatch: (watch: WatchId) => void;
  onMenu: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const storageWorks = useStorageWorks();
  const panel = useRef<HTMLDivElement>(null);
  useTextTop(panel);
  // As the results come in; they are gone long before it would be stale.
  // A round that ran past midnight says the next Daily is out instead.
  const [nextDaily] = useState(() =>
    result.outcome.kind === 'daily'
      ? nextDailyAfter(new Date(), result.outcome.number)
      : null
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setArmed(true);
    }, ARM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const { outcome } = result;
  const shown = shownFor(t, result);
  const collection = outcome.kind === 'collection' ? outcome : null;
  const daily = outcome.kind === 'daily' ? outcome.daily : null;
  const missedBy = result.nearMiss
    ? t.gameOver[result.nearMiss.side](result.nearMiss.ms)
    : null;
  const goal = collection?.goal ? goalText(t, collection.goal) : null;
  // Finishing the collection opens two at once: the Tourbillon and Endless.
  const unlockedIds = collection?.unlocked ?? [];
  const [unlocked] = unlockedIds;
  const unlockedText = unlocked
    ? t.gameOver.unlocked(
        listOf(
          t,
          unlockedIds.map(id => displayName(t, id))
        )
      )
    : null;
  const certified = collection?.certificate
    ? t.gameOver.certified(t.certificates[collection.certificate])
    : null;
  const levelUp = collection?.levelUp
    ? t.level.reached(collection.levelUp)
    : null;
  const engraved = result.engraved.length
    ? t.engravings.engraved(
        listOf(
          t,
          result.engraved.map(id => t.engravings.names[id])
        )
      )
    : null;
  const newVariants = collection?.variants.length
    ? t.variants.earned(
        listOf(
          t,
          collection.variants.map(id => t.variants.names[id])
        ),
        collection.variants.length
      )
    : null;
  const reserveText = daily ? t.daily.reserve(daily.reserve) : null;
  const timing = result.timing
    ? t.gameOver.timing(
        wholeRate(result.timing.rate),
        Math.round(result.timing.spread)
      )
    : null;
  const chip =
    'rounded-full border px-3 py-1 text-[0.65rem] whitespace-nowrap uppercase short:tracking-[0.12em]';

  return (
    // Under the raised watch on tall screens, on the shade that keeps the
    // text off the bracelet (the framing keeps the dial above where it
    // starts); beside the watch on wide ones.
    <div
      ref={panel}
      className="absolute inset-x-0 bottom-0 flex max-h-dvh animate-rise flex-col items-center overflow-y-auto pt-16 pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] wide:inset-x-auto wide:inset-y-0 wide:right-0 wide:w-[45%] wide:justify-center-safe wide:bg-linear-to-l wide:from-studio wide:from-35% wide:to-transparent wide:pt-6 wide:pb-6 short:w-[56%] short:pt-3 short:pr-[max(1rem,env(safe-area-inset-right))] short:pb-3 short:pl-4 compact:pb-[max(1rem,env(safe-area-inset-bottom))] upright:shade"
      onKeyDown={event => {
        // A reflex press would skip the results, and a held key presses
        // nothing at all.
        if (
          (event.key === ' ' || event.key === 'Enter') &&
          (!armed || event.repeat)
        ) {
          event.preventDefault();
        }
      }}
    >
      <h2
        id="game-over-heading"
        // "Daily" is English in every language (and keeps its dotless I).
        {...(outcome.kind === 'daily' && { lang: 'en' })}
        className="text-xs tracking-[0.5em] text-ink-2 uppercase"
      >
        {shown.title}
      </h2>
      <p
        data-testid="game-over-reason"
        data-reason={result.reason}
        className="mt-1 text-xs text-ink-3"
      >
        {missedBy ? (
          <span
            data-testid="near-miss"
            data-side={result.nearMiss?.side}
            className="text-ink-2 tabular-nums"
          >
            {missedBy}
          </span>
        ) : (
          t.gameOver.reasons[result.reason]
        )}
      </p>
      {/* Read with the dialog's name as focus moves in: the whole result,
          once (the miss itself only names how it was missed). */}
      <p id="game-over-summary" className="sr-only">
        <WithEnglishNames>
          {[
            `${missedBy ?? t.gameOver.reasons[result.reason]}.`,
            shown.summary,
            reserveText ? `${reserveText}.` : null,
            daily?.wound ? `${t.daily.wound}.` : null,
            unlockedText ? `${unlockedText}.` : null,
            certified ? `${certified}.` : null,
            levelUp ? `${levelUp}.` : null,
            engraved ? `${engraved}.` : null,
            newVariants ? `${newVariants}.` : null,
            goal && !unlocked ? `${goal}.` : null,
            timing ? `${timing}.` : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </WithEnglishNames>
      </p>

      <dl className="mt-5 flex items-end gap-10 short:mt-2 compact:mt-2">
        <div className="text-center">
          <dt className="text-[0.65rem] tracking-[0.35em] text-ink-3 uppercase">
            {t.gameOver.score}
          </dt>
          <dd
            data-testid="game-over-score"
            className="mt-1 text-6xl font-light text-ink tabular-nums short:text-4xl compact:text-5xl"
          >
            {result.score}
          </dd>
        </div>
        {shown.second && (
          <div className="pb-2 text-center short:pb-1">
            <dt className="text-[0.65rem] tracking-[0.35em] text-ink-3 uppercase">
              {shown.second.label}
            </dt>
            <dd
              data-testid="game-over-best"
              data-mode={outcome.kind}
              className="mt-1 text-2xl font-light text-ink-2 tabular-nums short:text-xl"
            >
              {shown.second.value}
            </dd>
          </div>
        )}
      </dl>

      {/* Chips keep to one line each, and share a row where they fit. */}
      <div className="mt-3 flex flex-wrap justify-center gap-2 short:mt-2 compact:mt-2">
        {shown.isNewBest && (
          <p
            data-testid="new-best"
            className={`${chip} border-accent/60 tracking-[0.3em] text-accent`}
          >
            {t.gameOver.newBest}
          </p>
        )}
        {shown.beat?.beaten && (
          <p
            data-testid="beat-status"
            data-beaten="true"
            className={`${chip} border-accent/60 tracking-[0.3em] text-accent`}
          >
            {t.gameOver.beaten(shown.beat.toBeat)}
          </p>
        )}
        {certified && (
          <p
            data-testid="certificate-earned"
            data-tier={collection?.certificate}
            className={`${chip} border-ink/25 tracking-[0.2em] text-ink`}
          >
            <WithEnglishNames>{certified}</WithEnglishNames>
          </p>
        )}
        {engraved && (
          <p
            data-testid="engraving-earned"
            data-engravings={result.engraved.join(' ')}
            className={`${chip} border-accent/60 tracking-[0.2em] text-accent`}
          >
            <WithEnglishNames>{engraved}</WithEnglishNames>
          </p>
        )}
        {levelUp && (
          <p
            data-testid="level-up"
            data-level={collection?.levelUp}
            className={`${chip} border-accent/60 tracking-[0.2em] text-accent`}
          >
            {levelUp}
          </p>
        )}
        {newVariants && (
          <p
            data-testid="variant-earned"
            data-variants={collection?.variants.join(' ')}
            className={`${chip} border-ink/25 tracking-[0.2em] text-ink`}
          >
            {newVariants}
          </p>
        )}
      </div>
      {collection && (
        <LevelMeter
          t={t}
          points={collection.points}
          className="mt-3 short:mt-2 compact:mt-2"
        />
      )}
      {goal && !unlocked && (
        <p
          data-testid="goal-line"
          data-goal={collection?.goal?.kind}
          className="mt-2 text-xs text-ink-3"
        >
          <WithEnglishNames>{goal}</WithEnglishNames>
        </p>
      )}
      {shown.beat && !shown.beat.beaten && (
        <p
          data-testid="beat-status"
          data-beaten="false"
          className="mt-2 text-xs text-ink-2"
        >
          {t.gameOver.toBeatShort(shown.beat.short, shown.beat.toBeat)}
        </p>
      )}

      {/* Secondary: it gives way where the panel is short of room, and to
          a new watch. */}
      {timing && !unlocked && (
        <p
          data-testid="timing-line"
          className="mt-2 text-xs text-ink-3 tabular-nums short:hidden compact:hidden"
        >
          {timing}
        </p>
      )}

      {result.ghost && (
        <GhostRace t={t} score={result.score} race={result.ghost} />
      )}

      <RankedLine
        t={t}
        countable={
          result.outcome.kind !== 'challenge' && result.outcome.kind !== 'ghost'
        }
      />

      {daily && (
        <div className="mt-3 flex flex-col items-center gap-1 text-xs text-ink-3 short:mt-2 compact:mt-2">
          <p
            data-testid="daily-reserve"
            data-days={daily.reserve}
            data-wound={daily.wound}
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
          >
            <ReserveGauge days={daily.reserve} />
            <span className="text-ink-2">{reserveText}</span>
            {daily.wound && (
              <span className="text-accent">· {t.daily.wound}</span>
            )}
          </p>
          {nextDaily && (
            <p
              data-testid="next-daily"
              data-kind={nextDaily.kind}
              className="tabular-nums"
            >
              <WithEnglishNames>
                {nextDaily.kind === 'in'
                  ? t.daily.next(nextDaily.hours, nextDaily.minutes)
                  : t.daily.ready(nextDaily.number)}
              </WithEnglishNames>
            </p>
          )}
        </div>
      )}

      {/* The text wraps before it can run under the button, which then
          takes a row of its own. */}
      {unlocked && (
        <div
          data-testid="unlock-banner"
          data-watch={unlocked}
          data-watches={unlockedIds.join(' ')}
          className="mt-4 flex w-full max-w-sm flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-accent/40 bg-accent/[0.06] py-2 pr-2 pl-4 short:mt-2"
        >
          <p className="min-w-36 flex-1 basis-36 text-sm break-words text-accent short:min-w-28 short:basis-28">
            <WithEnglishNames>{unlockedText ?? ''}</WithEnglishNames>
          </p>
          <Button
            className="min-h-11! grow px-4! whitespace-normal!"
            onClick={() => {
              onPlayWatch(unlocked);
            }}
          >
            {/* One flex item, so the space after the name isn't lost. */}
            <span>
              <WithEnglishNames>
                {t.gameOver.playWatch(WATCHES[unlocked].name)}
              </WithEnglishNames>
            </span>
          </Button>
        </div>
      )}

      {!storageWorks && (
        <p
          data-testid="storage-warning"
          className="mt-3 max-w-xs text-center text-[0.7rem] text-balance text-ink-3 short:mt-2"
        >
          {t.storage.notSaved}
        </p>
      )}

      <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-x-3 gap-y-2 short:mt-3 short:flex short:max-w-none short:flex-wrap short:justify-center short:gap-2 compact:mt-3">
        <Button
          variant="primary"
          data-autofocus
          icon={<RetryIcon />}
          className="short:px-4"
          onClick={onRetry}
        >
          {t.gameOver.retry}
        </Button>
        <Button variant="quiet" className="short:px-4" onClick={onMenu}>
          {t.gameOver.menu}
        </Button>
      </div>
    </div>
  );
}

/**
 * The round beside the ghost it raced: who came out ahead, then the score,
 * hits, Perfects and spread of each, to see where it was won or lost.
 */
function GhostRace({
  t,
  score,
  race,
}: {
  t: Dictionary;
  score: number;
  race: GhostComparison;
}) {
  const spread = (ms: number | null) =>
    ms === null ? '–' : t.timegrapher.spreadValue(Math.round(ms));
  const rows = [
    [t.gameOver.score, String(score), String(race.ghost.score)],
    [t.timegrapher.hits, String(race.you.hits), String(race.ghost.hits)],
    [
      t.timegrapher.perfect,
      String(race.you.perfects),
      String(race.ghost.perfects),
    ],
    [t.timegrapher.spread, spread(race.you.spread), spread(race.ghost.spread)],
  ] as const;
  return (
    <div
      data-testid="ghost-race"
      className="mt-3 w-full max-w-xs text-xs text-ink-3 short:mt-2"
    >
      <p data-testid="ghost-verdict" className="text-center text-ink-2">
        {t.ghost.verdict(score - race.ghost.score)}
      </p>
      <table className="mt-1.5 w-full tabular-nums short:hidden">
        <caption className="sr-only">{t.ghost.against}</caption>
        <thead>
          <tr>
            <td />
            <th scope="col" className="text-right font-normal">
              {t.ghost.you}
            </th>
            <th scope="col" lang="en" className="text-right font-normal">
              {t.ghost.them}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, you, ghost]) => (
            <tr key={label}>
              <th scope="row" className="text-left font-normal">
                {label}
              </th>
              <td className="text-right text-ink">{you}</td>
              <td className="text-right">{ghost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
