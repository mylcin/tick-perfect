import { useState } from 'react';

import { IconButton } from '../components/buttons';
import { PauseIcon } from '../components/icons';
import { multiplierFor, type GameRules, type GameState } from '../game';
import { WithEnglishNames } from '../components/english';
import type { Dictionary } from '../i18n';
import type { LastHit, LastTap } from '../state/game-controller';
import type { RoundTip } from '../state/tips';
import { tipText, twistHintFor } from './hud-hint';
import type { Standing } from './milestones';
import { DRAIN_MS, streakMeter, type StreakMeter } from './streak-meter';

/**
 * Everything on screen around the watch while playing: pause, the best
 * score, how the last hit landed and the Perfect streak. The score itself is
 * in the watch's date window; screen readers get it here as text.
 */
export function GameHud({
  t,
  state,
  lastHit,
  lastTap,
  rules,
  standing,
  twistHints,
  tip,
  passed,
  drain,
  canPause,
  onPause,
}: {
  t: Dictionary;
  state: GameState;
  lastHit: LastHit | null;
  /** In practice, every target's outcome and timing, missed ones too. */
  lastTap: LastTap | null;
  rules: GameRules;
  standing: Standing;
  /** Spell out each twist as it arrives (a watch still being learnt). */
  twistHints: boolean;
  /** A one-time tip on the scoring, on the hint's line. */
  tip: RoundTip | null;
  /** The round just passed the standing or a certificate: it lights up. */
  passed: boolean;
  /** The meter as the multiplier ended, while its diamonds drain. */
  drain: StreakMeter | null;
  canPause: boolean;
  onPause: () => void;
}) {
  const round = state.phase === 'idle' ? null : state.round;
  const score = round?.score ?? 0;
  const practice = standing.kind === 'practice';
  // The target being played: one past those done, the last once it's over.
  const target = Math.min(
    (round?.hits ?? 0) + (round?.slips ?? 0) + 1,
    standing.score
  );
  const streak = round?.streak ?? 0;
  const meter = streakMeter(streak, rules);
  const factor = multiplierFor(streak, rules.scoring);
  const segment =
    twistHints && state.phase === 'playing' ? state.round.segment : null;
  const twist = segment?.twist;
  const twistHint = segment ? twistHintFor(segment) : null;
  const firstSweep = state.phase === 'playing' && round?.hits === 0;
  const tipLine = tip && !twistHint ? tipText(t, tip, rules.scoring) : null;
  // A tip fades out as itself, not as an empty line.
  const [fadingTip, setFadingTip] = useState(tipLine);
  if (tipLine !== null && tipLine !== fadingTip) setFadingTip(tipLine);
  const hint =
    state.phase === 'idle'
      ? t.game.ready
      : twistHint
        ? t.game.twistHints[twistHint]
        : tipLine;
  // Draining, the diamonds the multiplier was counting go out one by one,
  // the last lit first, then the meter starts again.
  const diamonds = drain ?? meter;
  const step = drain ? DRAIN_MS / Math.max(1, drain.filled) : 0;
  // Both fade in as the game opens (from nothing as they mount), and stay
  // out of sight once the results are up.
  const fade = `transition-opacity duration-300 starting:opacity-0 ${
    state.phase === 'gameOver' ? 'opacity-0' : 'opacity-100'
  }`;

  return (
    <>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] ${fade}`}
      >
        <IconButton
          label={t.game.pause}
          data-testid="pause-button"
          className="pointer-events-auto"
          disabled={!canPause}
          onClick={onPause}
        >
          <PauseIcon />
        </IconButton>
        <p
          data-testid="hud-best"
          data-standing={standing.kind}
          data-passed={passed}
          className={`text-xs tracking-[0.3em] uppercase tabular-nums transition-colors duration-300 ${
            passed ? 'text-accent' : 'text-ink-3'
          }`}
        >
          {standing.kind === 'practice'
            ? t.game.practice(target, standing.score)
            : standing.kind === 'toBeat'
              ? t.game.toBeat(standing.score)
              : t.game[standing.kind](Math.max(standing.score, score))}
        </p>
      </div>

      <p className="sr-only" data-testid="hud-score">
        {t.game.score(score)}
      </p>

      {/* Under the watch, on the shade that keeps text off the bracelet;
          beside it, clear of the bracelet, on a phone held sideways. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 shade px-6 pt-16 pb-[max(2rem,env(safe-area-inset-bottom))] short:inset-x-auto short:inset-y-0 short:right-0 short:w-[24%] short:justify-center short:bg-none short:pt-0 short:pr-[max(1rem,env(safe-area-inset-right))] short:pb-0 ${fade}`}
      >
        <div className="relative h-8 w-full" aria-hidden="true">
          {practice && lastTap && (
            <p
              key={lastTap.id}
              data-testid="practice-feedback"
              data-outcome={lastTap.outcome}
              className={`absolute inset-x-0 animate-float-up text-center text-sm font-medium tracking-[0.2em] tabular-nums ${
                lastTap.outcome === 'perfect'
                  ? 'text-accent [text-shadow:0_0_18px_var(--glow)]'
                  : lastTap.outcome === 'good'
                    ? 'text-ink-2'
                    : 'text-ink-3'
              }`}
            >
              <span className="uppercase">
                {lastTap.outcome === 'perfect'
                  ? t.game.perfect
                  : lastTap.outcome === 'good'
                    ? t.practice.good
                    : t.practice.miss}
              </span>
              {lastTap.ms !== null &&
                ` · ${t.practice.timing(Math.round(lastTap.ms))}`}
            </p>
          )}
          {!practice && lastHit && (
            <p
              key={lastHit.id}
              data-testid="hit-feedback"
              data-quality={lastHit.quality}
              className={`absolute inset-x-0 animate-float-up text-center text-sm font-medium tracking-[0.3em] uppercase tabular-nums ${
                lastHit.quality === 'perfect'
                  ? 'text-accent [text-shadow:0_0_18px_var(--glow)]'
                  : 'text-ink-2'
              }`}
            >
              {t.game.points(lastHit.points)}
              {lastHit.quality === 'perfect' && ` ${t.game.perfect}`}
            </p>
          )}
        </div>

        <div
          className="flex items-center gap-3"
          role="img"
          aria-label={t.game.streak(meter.filled, meter.needed, meter.next)}
          data-testid="streak-meter"
          data-streak={streak}
        >
          <div className="flex gap-1.5" data-draining={drain !== null}>
            {Array.from({ length: diamonds.needed }, (_, index) => (
              <span
                key={index}
                className={`size-2 rotate-45 border transition-colors ${
                  !drain && index < meter.filled
                    ? 'border-accent bg-accent'
                    : 'border-ink/25 bg-transparent'
                }`}
                {...(drain &&
                  index < drain.filled && {
                    style: {
                      transitionDuration: `${String(step)}ms`,
                      transitionDelay: `${String((drain.filled - 1 - index) * step)}ms`,
                    },
                  })}
              />
            ))}
          </div>
          <span
            data-testid="multiplier-badge"
            data-active={factor > 1}
            // Off, it is only dimmer, never unreadable: the border and the
            // colour say it is waiting.
            className={`min-w-8 rounded-full border px-2 py-0.5 text-center text-xs font-semibold tabular-nums transition-colors ${
              factor > 1
                ? 'border-accent/70 text-accent'
                : 'border-ink/15 text-ink-3'
            }`}
          >
            {t.game.multiplier(factor > 1 ? factor : (meter.next ?? factor))}
          </span>
        </div>

        {/* A twist's hint draws its marks (▶ ■) for the eye; screen readers
            heard the rule as the round started, and each tip as it came. */}
        <p
          data-testid="hud-hint"
          {...(twistHint && {
            'data-twist': twist?.kind ?? 'turn',
            'aria-hidden': true,
          })}
          {...(twist?.kind === 'gmt' && { 'data-gate': twist.side })}
          {...(tipLine && { 'data-tip': tip, 'aria-hidden': true })}
          {...(!hint && !firstSweep && { 'aria-hidden': true })}
          className={`min-h-4 text-center text-xs text-ink-3 transition-opacity duration-500 ${
            hint || firstSweep ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {hint && <WithEnglishNames>{hint}</WithEnglishNames>}
          {/* Space only where there is a keyboard to press it on. */}
          {!hint && firstSweep && (
            <>
              <span className="pointer-fine:hidden">{t.game.hint.touch}</span>
              <span className="hidden pointer-fine:inline">
                {t.game.hint.keys}
              </span>
            </>
          )}
          {!hint && !firstSweep && fadingTip}
        </p>
      </div>
    </>
  );
}
