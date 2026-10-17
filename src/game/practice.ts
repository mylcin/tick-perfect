import type { Ramp } from './difficulty.js';
import type { GameRules } from './rules/types.js';
import type { PracticeOptions } from './state.js';

// Practice: a set of targets where a miss moves on to the next one, on a
// watch's own rules or eased ones. Nothing about it is ranked or saved, so
// it may play by rules no round counts under.

/** How many targets a practice set has, hit or missed. */
export const PRACTICE_SET: PracticeOptions = { targets: 25 };

/** The watch's own pace, or an easier one to learn it at. */
export type PracticePace = 'slow' | 'normal';

export const PRACTICE_PACES: readonly PracticePace[] = ['slow', 'normal'];

/** `ramp` with its start and limit scaled, and its rate too. */
function scaled(ramp: Ramp, start: number, limit: number, rate = 1): Ramp {
  return {
    start: ramp.start * start,
    limit: ramp.limit * limit,
    rate: ramp.rate * rate,
  };
}

/**
 * The rules a practice set plays by. The slow pace starts the hand at three
 * quarters of its speed and lets it reach little more than that, widens
 * the hit and Perfect windows (most of all where a long round narrows them)
 * and takes twice as many hits to tighten them. Twists are left as they
 * are: they are what a player comes to practise.
 */
export function practiceRules(rules: GameRules, pace: PracticePace): GameRules {
  if (pace === 'normal') return rules;
  const { difficulty } = rules;
  return {
    ...rules,
    difficulty: {
      ...difficulty,
      handSpeed: scaled(difficulty.handSpeed, 0.75, 0.6),
      hitWindowMs: scaled(difficulty.hitWindowMs, 1.25, 2, 0.5),
      perfectWindowMs: scaled(difficulty.perfectWindowMs, 1.25, 1.5, 0.5),
      ringSpeed: scaled(difficulty.ringSpeed, 0.75, 0.75),
    },
  };
}
