import type { GameRules } from './rules/types.js';
import { INITIAL_STATE, update, type GameState } from './state.js';

// A round's input, as it was played: every tap, pause and resume, on the
// clock of the page that played it. Played back through the same engine,
// it gives the same targets, the same judgements and the same score, which
// is how a server checks a score without trusting the page that sent it.
// The times are the page's own (not shifted to start at zero), so the
// arithmetic, and every rounding in it, is exactly the page's.

/** What can happen in a round once it has started. */
export type LoggedKind = 'tap' | 'pause' | 'resume';

/** One action: its kind and its time on the page's clock, in ms. */
export type LoggedAction = readonly [kind: LoggedKind, time: number];

export interface RoundLog {
  readonly seed: number;
  /** When the round started, on the page's clock. */
  readonly start: number;
  readonly actions: readonly LoggedAction[];
}

/**
 * Far more than any real round needs (an expert's 70 hits log well under
 * 200 actions); a longer log is refused unread.
 */
export const MAX_LOGGED_ACTIONS = 2000;

interface ReplayResult {
  readonly score: number;
  readonly hits: number;
  readonly perfects: number;
  readonly bestStreak: number;
  /** Each hit's timing error in ms, in order; negative is early. */
  readonly errors: readonly number[];
  /** Time played, start to the miss, pauses left out, in ms. */
  readonly playedMs: number;
  /** Time from the start to the miss on the page's clock, pauses in. */
  readonly elapsedMs: number;
}

type ReplayRejection = 'tooLong' | 'badTime' | 'outOfOrder' | 'neverEnded';

/**
 * Plays a logged round back. Times must be finite and never go back; the
 * round must still be going until its last action. If it is going after
 * the last one, the hand runs on until it passes a target, as it does when
 * the player stops tapping.
 */
export function replayRound(
  rules: GameRules,
  log: RoundLog
): ReplayResult | { readonly rejected: ReplayRejection } {
  if (log.actions.length > MAX_LOGGED_ACTIONS) return { rejected: 'tooLong' };
  if (!Number.isFinite(log.start) || !Number.isInteger(log.seed)) {
    return { rejected: 'badTime' };
  }
  let state: GameState = update(
    INITIAL_STATE,
    { type: 'start', time: log.start, seed: log.seed },
    rules
  ).state;
  const errors: number[] = [];
  let last = log.start;
  for (const [kind, time] of log.actions) {
    if (!Number.isFinite(time)) return { rejected: 'badTime' };
    if (time < last) return { rejected: 'outOfOrder' };
    // Nothing is logged after the round ends.
    if (state.phase === 'gameOver') return { rejected: 'outOfOrder' };
    last = time;
    const { state: next, events } = update(state, { type: kind, time }, rules);
    for (const event of events) {
      if (event.type === 'hit') errors.push(event.ms);
    }
    state = next;
  }
  if (state.phase === 'paused') {
    // Left paused: it ends where it stood.
    state = update(state, { type: 'resume', time: last }, rules).state;
  }
  if (state.phase === 'playing') {
    const { segment } = state.round;
    // Long enough for any target to pass at any speed.
    const later = Math.max(last, segment.startTime) + 60_000;
    state = update(state, { type: 'tick', time: later }, rules).state;
  }
  if (state.phase !== 'gameOver') return { rejected: 'neverEnded' };
  const { round, endedAt } = state;
  return {
    score: round.score,
    hits: round.hits,
    perfects: round.perfects,
    bestStreak: round.bestStreak,
    errors,
    playedMs: endedAt - round.startedAt,
    elapsedMs: endedAt - log.start,
  };
}
