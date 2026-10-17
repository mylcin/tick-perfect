import { CLOCKWISE, reverse } from './angle.js';
import { difficultyAt } from './difficulty.js';
import { planTarget } from './plan.js';
import { createRng, type RngState } from './rng.js';
import type { GameRules } from './rules/types.js';
import { multiplierFor, scoreHit, type HitQuality } from './scoring.js';
import {
  closingSpeed,
  handAngleAt,
  judgeTap,
  MS_PER_SECOND,
  ringAngleAt,
  windowCloseTime,
  type Segment,
} from './timing.js';
import { chronoStopLeg } from './twists/chrono.js';
import { handAt, isBlockedAt } from './twists/gmt.js';

// The round's state machine. Every transition goes through `update`, which is
// pure: it takes the current state, an action stamped with its time, and the
// watch's rules, and returns the next state plus what happened.
//
//   idle ──start──▶ playing ──miss──▶ gameOver ──start──▶ playing
//                    │   ▲
//               pause│   │resume          exit (from any phase) ──▶ idle
//                    ▼   │
//                    paused
//
// A practice set (PracticeOptions) plays the same, except that a miss
// moves on to the next target and the set is over after so many targets.

/** The seconds hand starts every round at 12 o'clock, moving clockwise. */
export const START_ANGLE = 0;
const START_DIRECTION = CLOCKWISE;

export interface Round {
  readonly seed: number;
  readonly rng: RngState;
  /** Shifted forward by every pause, so `now - startedAt` is time played. */
  readonly startedAt: number;
  /** Targets completed; a chronograph pair counts once, at its stop mark. */
  readonly hits: number;
  /** Perfect taps, both taps of a pair included. */
  readonly perfects: number;
  readonly score: number;
  /** Consecutive Perfects so far. */
  readonly streak: number;
  readonly bestStreak: number;
  readonly segment: Segment;
  /** Practice only: targets missed, each moving on to the next. */
  readonly slips?: number;
}

/** A practice set: a miss moves on to the next target, and `targets` of
 * them, hit or missed, finish it. */
export interface PracticeOptions {
  readonly targets: number;
}

/** `blocked`: the tap was on target, but the GMT hand covered it. */
export type MissReason = 'early' | 'late' | 'passed' | 'blocked';

/** Which tap of a target: the only one, or one of a chronograph pair. */
export type HitLeg = 'single' | 'start' | 'stop';

export interface Miss {
  readonly reason: MissReason;
  readonly time: number;
  /** Degrees past the target centre when the round ended. */
  readonly offset: number;
}

export interface IdleState {
  readonly phase: 'idle';
}
export interface PlayingState {
  readonly phase: 'playing';
  readonly round: Round;
}
export interface PausedState {
  readonly phase: 'paused';
  readonly round: Round;
  readonly pausedAt: number;
}
export interface GameOverState {
  readonly phase: 'gameOver';
  readonly round: Round;
  /** What ended the round; null for a practice set played to its end. */
  readonly miss: Miss | null;
  /** When it ended: the miss, or the practice set's last target. */
  readonly endedAt: number;
}

export type GameState = IdleState | PlayingState | PausedState | GameOverState;

export type GameAction =
  | { readonly type: 'start'; readonly time: number; readonly seed: number }
  | { readonly type: 'tap'; readonly time: number }
  | { readonly type: 'tick'; readonly time: number }
  | { readonly type: 'pause'; readonly time: number }
  | { readonly type: 'resume'; readonly time: number }
  | { readonly type: 'exit' };

export type GameEvent =
  | { readonly type: 'started'; readonly time: number }
  | {
      readonly type: 'hit';
      readonly time: number;
      readonly quality: HitQuality;
      /** Degrees past the target centre; negative is early. */
      readonly offset: number;
      /** The same in milliseconds: the timing error of the tap. */
      readonly ms: number;
      readonly leg: HitLeg;
      readonly points: number;
      readonly score: number;
      readonly streak: number;
    }
  | {
      readonly type: 'multiplier';
      readonly time: number;
      readonly factor: number;
    }
  | {
      readonly type: 'miss';
      readonly time: number;
      readonly reason: MissReason;
      readonly offset: number;
      readonly score: number;
    }
  | {
      /** Practice only: a miss that moved on to the next target. */
      readonly type: 'slip';
      readonly time: number;
      readonly reason: MissReason;
      readonly offset: number;
      /** The tap's timing error in ms; null when there was no tap. */
      readonly ms: number | null;
    }
  | {
      /** Practice only: the set's last target, hit or missed. */
      readonly type: 'complete';
      readonly time: number;
      readonly score: number;
    }
  | { readonly type: 'paused'; readonly time: number }
  | { readonly type: 'resumed'; readonly time: number }
  | { readonly type: 'exited' };

interface Transition {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export const INITIAL_STATE: GameState = { phase: 'idle' };

const NO_EVENTS: readonly GameEvent[] = Object.freeze([]);

function unchanged(state: GameState): Transition {
  return { state, events: NO_EVENTS };
}

function startRound(time: number, seed: number, rules: GameRules): Transition {
  const planned = planTarget(
    { time, handAngle: START_ANGLE, direction: START_DIRECTION, ringAngle: 0 },
    difficultyAt(rules.difficulty, 0),
    rules,
    createRng(seed),
    { seed, target: 0 }
  );
  const round: Round = {
    seed,
    rng: planned.rng,
    startedAt: time,
    hits: 0,
    perfects: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    segment: planned.segment,
  };
  return {
    state: { phase: 'playing', round },
    events: [{ type: 'started', time }],
  };
}

/** The moment an untapped target ends the round, input grace included. */
function passedAt(round: Round, rules: GameRules): number {
  return windowCloseTime(round.segment) + rules.timing.inputGraceMs;
}

function endRound(
  round: Round,
  reason: MissReason,
  time: number,
  offset: number
): Transition {
  return {
    state: {
      phase: 'gameOver',
      round,
      miss: { reason, time, offset },
      endedAt: time,
    },
    events: [{ type: 'miss', time, reason, offset, score: round.score }],
  };
}

/**
 * Ends the round if the hand has run past the target by `time` (in
 * practice, moves on to the next target from where it ran past).
 */
function checkPassed(
  round: Round,
  time: number,
  rules: GameRules,
  practice: PracticeOptions | undefined
): Transition | null {
  if (time < passedAt(round, rules)) return null;
  const { segment } = round;
  return missed(
    round,
    'passed',
    windowCloseTime(segment),
    segment.target.hitWindow,
    rules,
    practice
  );
}

/** Targets played in a round so far, hit or (in practice) missed. */
function attempts(round: Round): number {
  return round.hits + (round.slips ?? 0);
}

/**
 * The next target, from the hand at `time` going `direction`, as hard as
 * `hits` hits have made it.
 */
function nextTarget(
  round: Round,
  time: number,
  direction: Segment['direction'],
  hits: number,
  rules: GameRules
) {
  const { segment } = round;
  return planTarget(
    {
      time,
      handAngle: handAngleAt(segment, time),
      direction,
      ringAngle: ringAngleAt(segment, time),
      ...(segment.gmt && { gmtAngle: handAt(segment.gmt, segment, time) }),
    },
    difficultyAt(rules.difficulty, hits),
    rules,
    round.rng,
    { seed: round.seed, target: hits + (round.slips ?? 0) }
  );
}

/**
 * The practice set's round after `round`'s latest target: over once it has
 * had them all, otherwise still playing.
 */
function practiceGoesOn(
  round: Round,
  time: number,
  practice: PracticeOptions,
  events: GameEvent[]
): Transition {
  if (attempts(round) < practice.targets) {
    return { state: { phase: 'playing', round }, events };
  }
  return {
    state: { phase: 'gameOver', round, miss: null, endedAt: time },
    events: [...events, { type: 'complete', time, score: round.score }],
  };
}

/**
 * A practice miss: the streak is broken and the hand moves on to a new
 * target, turning back as a tap turns it, or sweeping on if it ran past.
 */
function slip(
  round: Round,
  reason: MissReason,
  time: number,
  offset: number,
  rules: GameRules,
  practice: PracticeOptions
): Transition {
  const { segment } = round;
  const tapped = reason !== 'passed';
  const planned = nextTarget(
    round,
    time,
    tapped ? reverse(segment.direction) : segment.direction,
    round.hits,
    rules
  );
  const next: Round = {
    ...round,
    rng: planned.rng,
    streak: 0,
    slips: (round.slips ?? 0) + 1,
    segment: planned.segment,
  };
  const events: GameEvent[] = [
    {
      type: 'slip',
      time,
      reason,
      offset,
      ms: tapped ? (offset / closingSpeed(segment)) * MS_PER_SECOND : null,
    },
  ];
  if (multiplierFor(round.streak, rules.scoring) !== 1) {
    events.push({ type: 'multiplier', time, factor: 1 });
  }
  return practiceGoesOn(next, time, practice, events);
}

/** A miss: the end of the round, or in practice the next target. */
function missed(
  round: Round,
  reason: MissReason,
  time: number,
  offset: number,
  rules: GameRules,
  practice: PracticeOptions | undefined
): Transition {
  return practice
    ? slip(round, reason, time, offset, rules, practice)
    : endRound(round, reason, time, offset);
}

function tap(
  state: PlayingState,
  time: number,
  rules: GameRules,
  practice: PracticeOptions | undefined
): Transition {
  const { round } = state;
  const { segment } = round;

  // The sweep starts with the press that started the round or landed the
  // last hit. A tap stamped before it, or this soon after it, is that same
  // press again (a bounce or a duplicate event), never a new attempt.
  if (time - segment.startTime < rules.timing.tapDebounceMs) {
    return unchanged(state);
  }
  const passed = checkPassed(round, time, rules, practice);
  if (passed) return passed;

  const judgement = judgeTap(segment, time);
  if (judgement.kind === 'miss') {
    return missed(
      round,
      judgement.reason,
      time,
      judgement.offset,
      rules,
      practice
    );
  }
  // On target, but under the GMT hand: that counts as a miss too.
  if (isBlockedAt(segment, time)) {
    return missed(round, 'blocked', time, judgement.offset, rules, practice);
  }

  const scored = scoreHit(judgement.quality, round.streak, rules.scoring);
  const { twist } = segment;
  const pairStarted = twist?.kind === 'chrono' && twist.leg === 'start';
  const hits = pairStarted ? round.hits : round.hits + 1;
  // The start mark of a pair leads straight on to its stop mark: same
  // direction, same speed, nothing new drawn.
  const planned = pairStarted
    ? {
        segment: chronoStopLeg(segment, twist, time, judgement.offset),
        rng: round.rng,
      }
    : nextTarget(round, time, reverse(segment.direction), hits, rules);
  const next: Round = {
    ...round,
    rng: planned.rng,
    hits,
    perfects: round.perfects + (judgement.quality === 'perfect' ? 1 : 0),
    score: round.score + scored.points,
    streak: scored.streak,
    bestStreak: Math.max(round.bestStreak, scored.streak),
    segment: planned.segment,
  };

  const events: GameEvent[] = [
    {
      type: 'hit',
      time,
      quality: judgement.quality,
      offset: judgement.offset,
      ms: (judgement.offset / closingSpeed(segment)) * MS_PER_SECOND,
      leg: twist?.kind === 'chrono' ? twist.leg : 'single',
      points: scored.points,
      score: next.score,
      streak: scored.streak,
    },
  ];
  if (scored.multiplier !== multiplierFor(round.streak, rules.scoring)) {
    events.push({ type: 'multiplier', time, factor: scored.multiplier });
  }
  // The start of a pair is half a target: a set ends on a whole one.
  if (practice && !pairStarted) {
    return practiceGoesOn(next, time, practice, events);
  }
  return { state: { phase: 'playing', round: next }, events };
}

function shiftRound(round: Round, delta: number): Round {
  return {
    ...round,
    startedAt: round.startedAt + delta,
    segment: { ...round.segment, startTime: round.segment.startTime + delta },
  };
}

/**
 * Applies one action. Actions that don't apply to the current phase (a tap
 * on the title screen, a tick while paused) leave the state untouched and
 * return the same object, so per-frame ticks cost no allocation or re-render.
 */
export function update(
  state: GameState,
  action: GameAction,
  rules: GameRules,
  practice?: PracticeOptions
): Transition {
  if ('time' in action && !Number.isFinite(action.time)) {
    throw new RangeError(
      `Action '${action.type}' needs a finite time, got ${String(action.time)}`
    );
  }

  switch (action.type) {
    case 'start':
      return state.phase === 'idle' || state.phase === 'gameOver'
        ? startRound(action.time, action.seed, rules)
        : unchanged(state);

    case 'tap':
      return state.phase === 'playing'
        ? tap(state, action.time, rules, practice)
        : unchanged(state);

    case 'tick':
      return state.phase === 'playing'
        ? (checkPassed(state.round, action.time, rules, practice) ??
            unchanged(state))
        : unchanged(state);

    case 'pause': {
      if (state.phase !== 'playing') return unchanged(state);
      const passed = checkPassed(state.round, action.time, rules, practice);
      if (passed) return passed;
      // A frame timestamp can trail a tap that was already handled; pausing
      // before the current sweep began would replay part of the last one.
      const pausedAt = Math.max(action.time, state.round.segment.startTime);
      return {
        state: { phase: 'paused', round: state.round, pausedAt },
        events: [{ type: 'paused', time: pausedAt }],
      };
    }

    case 'resume': {
      if (state.phase !== 'paused') return unchanged(state);
      const delta = Math.max(0, action.time - state.pausedAt);
      return {
        state: { phase: 'playing', round: shiftRound(state.round, delta) },
        events: [{ type: 'resumed', time: action.time }],
      };
    }

    case 'exit':
      return state.phase === 'idle'
        ? unchanged(state)
        : { state: INITIAL_STATE, events: [{ type: 'exited' }] };
  }
}
