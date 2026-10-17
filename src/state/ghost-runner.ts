import type { GameRules } from '../game';
import { createGameController, type GameController } from './game-controller';
import type { GhostRun } from './ghost';

// A ghost raced live: its round played through the engine beside the
// player's, on the same seed and the same clock, its taps landing at the
// moments of play they landed at before. The player's pauses are its
// pauses, so it is never ahead by a pause. Nothing it does is saved.

export interface GhostRunner {
  /** The ghost's own round, for its score and its events. */
  readonly controller: GameController;
  /** Starts it with the player's round, at the same moment. */
  readonly start: (time: number) => void;
  readonly pause: (time: number) => void;
  readonly resume: (time: number) => void;
  /** Lands every tap due by `now`, then lets its hand run on to `now`. */
  readonly advance: (now: number) => void;
  /** Holds it where it is: the player's round is over. */
  readonly stop: (time: number) => void;
  /** Where its seconds hand is, while its round is on; null once over. */
  readonly angle: (now: number) => number | null;
}

export function createGhostRunner(
  rules: GameRules,
  ghost: GhostRun
): GhostRunner {
  const controller = createGameController(rules, { cracks: false });
  let next = 0;
  let stopped = false;

  const playing = () => {
    const { state } = controller.snapshot();
    return state.phase === 'playing' ? state : null;
  };

  return {
    controller,
    start: time => {
      next = 0;
      stopped = false;
      controller.dispatch({ type: 'start', time, seed: ghost.seed });
    },
    pause: time => {
      controller.dispatch({ type: 'pause', time });
    },
    resume: time => {
      controller.dispatch({ type: 'resume', time });
    },
    advance: now => {
      if (stopped) return;
      for (let state = playing(); state; state = playing()) {
        const tap = ghost.taps[next];
        // Its start moves on with every pause, so this is its played time.
        const at = tap === undefined ? Infinity : state.round.startedAt + tap;
        if (at > now) break;
        next += 1;
        controller.dispatch({ type: 'tap', time: at });
      }
      controller.dispatch({ type: 'tick', time: now });
    },
    stop: time => {
      controller.dispatch({ type: 'pause', time });
      stopped = true;
    },
    angle: now => {
      const { state } = controller.snapshot();
      return state.phase === 'playing' || state.phase === 'paused'
        ? controller.pose(now).seconds
        : null;
    },
  };
}
