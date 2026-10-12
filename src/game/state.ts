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
  readonly miss: Miss;
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
    state: { phase: 'gameOver', round, miss: { reason, time, offset } },
    events: [{ type: 'miss', time, reason, offset, score: round.score }],
  };
}

/** Ends the round if the hand has run past the target by `time`. */
function checkPassed(
  round: Round,
  time: number,
  rules: GameRules
): Transition | null {
  if (time < passedAt(round, rules)) return null;
  const { segment } = round;
  return endRound(
    round,
    'passed',
    windowCloseTime(segment),
    segment.target.hitWindow
  );
}

function tap(state: PlayingState, time: number, rules: GameRules): Transition {
  const { round } = state;
  const { segment } = round;

  // The sweep starts with the press that started the round or landed the
  // last hit. A tap stamped before it, or this soon after it, is that same
  // press again (a bounce or a duplicate event), never a new attempt.
  if (time - segment.startTime < rules.timing.tapDebounceMs) {
    return unchanged(state);
  }
  const passed = checkPassed(round, time, rules);
  if (passed) return passed;

  const judgement = judgeTap(segment, time);
  if (judgement.kind === 'miss') {
    return endRound(round, judgement.reason, time, judgement.offset);
  }
  // On target, but under the GMT hand: that counts as a miss too.
  if (isBlockedAt(segment, time)) {
    return endRound(round, 'blocked', time, judgement.offset);
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
    : planTarget(
        {
          time,
          handAngle: handAngleAt(segment, time),
          direction: reverse(segment.direction),
          ringAngle: ringAngleAt(segment, time),
          ...(segment.gmt && { gmtAngle: handAt(segment.gmt, segment, time) }),
        },
        difficultyAt(rules.difficulty, hits),
        rules,
        round.rng,
        { seed: round.seed, target: hits }
      );
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
  rules: GameRules
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
        ? tap(state, action.time, rules)
        : unchanged(state);

    case 'tick':
      return state.phase === 'playing'
        ? (checkPassed(state.round, action.time, rules) ?? unchanged(state))
        : unchanged(state);

    case 'pause': {
      if (state.phase !== 'playing') return unchanged(state);
      const passed = checkPassed(state.round, action.time, rules);
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
