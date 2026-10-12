// Difficulty is data: every value that changes as the player lands hits is a
// ramp in this file, so tuning never touches the engine or the renderer.
//
// The hit and Perfect windows are set in milliseconds, the way a player's
// timing is judged: as the hand speeds up, a window spans more degrees, so
// speed alone never squeezes it below what a hand can do. Every ramp eases
// towards its limit, with no hit where it suddenly stops: each new hit
// changes less, and there is always a little left to master.

/**
 * A value that moves from `start` towards `limit` as the player lands hits,
 * closing a share of the distance that remains with every hit.
 */
export interface Ramp {
  readonly start: number;
  /** Approached, never passed: a ceiling or a floor. */
  readonly limit: number;
  /** The share of the remaining distance each hit closes, in (0, 1]. */
  readonly rate: number;
}

export interface GapConfig {
  /** Closest a new target may spawn ahead of the hand, in degrees. */
  readonly minDegrees: number;
  /** Farthest a new target may spawn ahead of the hand, in degrees. */
  readonly maxDegrees: number;
  /**
   * Least time the player gets to react to a new target. At high speeds this
   * pushes the closest spawn further out than `minDegrees`.
   */
  readonly minLeadMs: number;
}

export interface DifficultyConfig {
  /** Seconds-hand speed in degrees per second. */
  readonly handSpeed: Ramp;
  /**
   * Milliseconds either side of the target centre that count as a hit. The
   * target is drawn that wide, less the timing's edge tolerance.
   */
  readonly hitWindowMs: Ramp;
  /** Milliseconds either side of the target centre that score a Perfect. */
  readonly perfectWindowMs: Ramp;
  /** Chance that a new target uses the watch's special rule. */
  readonly specialChance: Ramp;
  /** Speed of a moving target ring (bezel or dial), in degrees per second. */
  readonly ringSpeed: Ramp;
  readonly gap: GapConfig;
}

/** Ramp values for a given number of hits. */
export interface Difficulty {
  readonly handSpeed: number;
  readonly hitWindowMs: number;
  readonly perfectWindowMs: number;
  readonly specialChance: number;
  readonly ringSpeed: number;
}

/**
 * Tuned with a simulation of players of every skill (see balance.test.ts):
 * a first round is forgiving, the hit window passes ±50 ms around the 20th
 * hit and settles near ±24 ms, which only steady timing survives for long.
 * The window is what makes a round hard; the hand speeds up gently, to
 * about half again by the 20th hit, and never past three quarters of a turn
 * a second, so a long round stays a matter of timing, not of a blur.
 */
export const DEFAULT_DIFFICULTY: DifficultyConfig = {
  handSpeed: { start: 100, limit: 270, rate: 0.025 },
  hitWindowMs: { start: 120, limit: 24, rate: 0.06 },
  perfectWindowMs: { start: 28, limit: 10, rate: 0.06 },
  specialChance: { start: 0, limit: 0.35, rate: 0.08 },
  ringSpeed: { start: 20, limit: 45, rate: 0.055 },
  gap: { minDegrees: 60, maxDegrees: 240, minLeadMs: 300 },
};

/**
 * The ramp's value after `hits` hits. It multiplies once per hit rather
 * than raising to a power: every engine rounds a product the same way, but
 * not a power, and a seed must play the same in every browser and on the
 * server that checks a score.
 */
export function rampAt(ramp: Ramp, hits: number): number {
  if (!(ramp.rate > 0 && ramp.rate <= 1)) {
    throw new RangeError(
      `A ramp's rate must be in (0, 1], got ${String(ramp.rate)}`
    );
  }
  const keep = 1 - ramp.rate;
  let remaining = ramp.start - ramp.limit;
  for (let hit = 0; hit < hits; hit++) remaining *= keep;
  return ramp.limit + remaining;
}

export function difficultyAt(
  config: DifficultyConfig,
  hits: number
): Difficulty {
  if (!Number.isInteger(hits) || hits < 0) {
    throw new RangeError(
      `Hits must be a non-negative integer, got ${String(hits)}`
    );
  }
  return {
    handSpeed: rampAt(config.handSpeed, hits),
    hitWindowMs: rampAt(config.hitWindowMs, hits),
    perfectWindowMs: rampAt(config.perfectWindowMs, hits),
    specialChance: rampAt(config.specialChance, hits),
    ringSpeed: rampAt(config.ringSpeed, hits),
  };
}
