import {
  INITIAL_STATE,
  START_ANGLE,
  update,
  type GameAction,
  type GameEvent,
  type GameRules,
  type GameState,
  type HitLeg,
  type HitQuality,
  type LoggedAction,
  type MissReason,
  type PracticeOptions,
  type RoundLog,
} from '../game';
import { poseFromGame, type WatchPose } from '../three/pose';
import { createObservable, type Observable } from '../utils/observable';

// Runs one game for the app: holds the state, applies actions through the
// pure `update`, and tells the screens and the scene what happened. It knows
// nothing about React, audio or input; those subscribe to it.

export interface LastHit {
  /** Counts up with every hit, so feedback can restart for each one. */
  readonly id: number;
  readonly time: number;
  /** The target that was hit, on its ring. */
  readonly mark: number;
  readonly width: number;
  readonly quality: HitQuality;
  readonly leg: HitLeg;
  readonly points: number;
}

/** The latest target's outcome and timing, as practice shows it. */
export interface LastTap {
  /** Counts up with every target, so feedback restarts for each. */
  readonly id: number;
  /** How it landed, or why it was missed. */
  readonly outcome: HitQuality | MissReason;
  /** Its timing error in ms (negative early); null if never tapped. */
  readonly ms: number | null;
}

export interface GameSnapshot {
  readonly state: GameState;
  readonly lastHit: LastHit | null;
  readonly lastTap: LastTap | null;
  /** How every hit of the round landed, in order (both taps of a pair). */
  readonly qualities: readonly HitQuality[];
  /** Every hit's timing error in ms, in the same order; negative is early. */
  readonly errors: readonly number[];
  /** When the game noticed the round was over (see `PoseOptions.endedAt`). */
  readonly endedAt: number | null;
}

export type EventListener = (
  events: readonly GameEvent[],
  snapshot: GameSnapshot
) => void;

export interface GameController {
  readonly rules: GameRules;
  /** The current score, for the date window. */
  readonly score: Observable<number>;
  /** Changes only when the state does, so it can drive React directly. */
  readonly snapshot: () => GameSnapshot;
  /**
   * Applies an action. `observedAt` is when the caller is looking, if that
   * is later than the moment being judged; a round that ends freezes there,
   * where the hand was last drawn.
   */
  readonly dispatch: (
    action: GameAction,
    observedAt?: number
  ) => readonly GameEvent[];
  readonly pose: (now: number) => WatchPose;
  /** Called after every action that changed the state. */
  readonly subscribe: (listener: EventListener) => () => void;
  /**
   * The current (or last) round's input: every tap, pause and resume that
   * changed it, as a server needs it to replay the round.
   */
  readonly log: () => RoundLog | null;
  /** Draws a raced ghost's hand with the round's (null: none). */
  readonly setGhost: (ghost: GhostHand | null) => void;
}

/** Where a raced ghost's hand is, for the pose. */
export interface GhostHand {
  readonly angle: (now: number) => number | null;
}

interface ControllerOptions {
  /** Crack the crystal on a miss; off for the attract-mode bot. */
  readonly cracks?: boolean;
  /** Play practice sets: a miss moves on, and the set ends on its own. */
  readonly practice?: PracticeOptions;
}

const INITIAL_SNAPSHOT: GameSnapshot = {
  state: INITIAL_STATE,
  lastHit: null,
  lastTap: null,
  qualities: [],
  errors: [],
  endedAt: null,
};

export function createGameController(
  rules: GameRules,
  { cracks = true, practice }: ControllerOptions = {}
): GameController {
  let snapshot = INITIAL_SNAPSHOT;
  let hits = 0;
  let taps = 0;
  const score = createObservable(0);
  const listeners = new Set<EventListener>();
  let round: { seed: number; start: number; actions: LoggedAction[] } | null =
    null;
  let ghost: GhostHand | null = null;

  function dispatch(
    action: GameAction,
    observedAt?: number
  ): readonly GameEvent[] {
    const previous = snapshot.state;
    const { state, events } = update(previous, action, rules, practice);
    if (state === previous) return events;
    // What a replay needs: an action that changed nothing changes nothing
    // played back either.
    if (action.type === 'start') {
      round = { seed: action.seed, start: action.time, actions: [] };
    } else if (
      action.type === 'tap' ||
      action.type === 'pause' ||
      action.type === 'resume'
    ) {
      round?.actions.push([action.type, action.time]);
    }

    let { lastHit, lastTap, qualities, errors, endedAt } = snapshot;
    for (const event of events) {
      switch (event.type) {
        case 'started':
        case 'exited':
          lastHit = null;
          lastTap = null;
          qualities = [];
          errors = [];
          endedAt = null;
          score.set(0);
          break;
        case 'hit':
          if (previous.phase === 'playing') {
            const { target } = previous.round.segment;
            hits += 1;
            lastHit = {
              id: hits,
              time: event.time,
              mark: target.mark,
              width: target.width,
              quality: event.quality,
              leg: event.leg,
              points: event.points,
            };
          }
          qualities = [...qualities, event.quality];
          errors = [...errors, event.ms];
          score.set(event.score);
          taps += 1;
          lastTap = { id: taps, outcome: event.quality, ms: event.ms };
          break;
        case 'slip':
          taps += 1;
          lastTap = { id: taps, outcome: event.reason, ms: event.ms };
          break;
        case 'complete':
        case 'miss':
          endedAt = Math.max(
            'time' in action ? action.time : event.time,
            observedAt ?? Number.NEGATIVE_INFINITY
          );
          break;
        default:
          break;
      }
    }

    snapshot = { state, lastHit, lastTap, qualities, errors, endedAt };
    listeners.forEach(listener => {
      listener(events, snapshot);
    });
    return events;
  }

  function pose(now: number): WatchPose {
    const { state, lastHit, endedAt } = snapshot;
    const base = poseFromGame(state, now, {
      idleSeconds: START_ANGLE,
      ...(endedAt !== null && { endedAt }),
    });
    const hit =
      lastHit && state.phase !== 'idle'
        ? {
            mark: lastHit.mark,
            width: lastHit.width,
            quality: lastHit.quality,
            leg: lastHit.leg,
            age: now - lastHit.time,
          }
        : null;
    const crack =
      cracks && state.phase === 'gameOver' && state.miss
        ? {
            angle: base.seconds,
            // From when the miss was seen: the crack and the jolt start
            // whole even when a passed hand is noticed a moment late.
            age: now - (endedAt ?? state.endedAt),
            seed: state.round.seed + state.round.hits,
          }
        : null;
    return {
      ...base,
      hit,
      crack,
      ghost: ghost && state.phase !== 'idle' ? ghost.angle(now) : null,
    };
  }

  return {
    rules,
    score,
    snapshot: () => snapshot,
    dispatch,
    pose,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    log: () => round && { ...round, actions: [...round.actions] },
    setGhost(next) {
      ghost = next;
    },
  };
}
