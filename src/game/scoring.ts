export type HitQuality = 'good' | 'perfect';

/** A multiplier and the run of consecutive Perfects that switches it on. */
export interface MultiplierTier {
  readonly streak: number;
  readonly factor: number;
}

export interface ScoringConfig {
  readonly goodPoints: number;
  readonly perfectPoints: number;
  /** Ever longer runs of Perfects for ever larger factors, lowest first. */
  readonly multipliers: readonly [MultiplierTier, ...MultiplierTier[]];
}

export const DEFAULT_SCORING: ScoringConfig = {
  goodPoints: 1,
  perfectPoints: 2,
  multipliers: [
    { streak: 3, factor: 2 },
    { streak: 8, factor: 3 },
  ],
};

/** The multiplier for a run of consecutive Perfects. */
export function multiplierFor(streak: number, config: ScoringConfig): number {
  let factor = 1;
  for (const tier of config.multipliers) {
    if (streak >= tier.streak) factor = tier.factor;
  }
  return factor;
}

/**
 * The tier a run of Perfects is working towards, or `null` once it has
 * reached the top one.
 */
export function nextMultiplier(
  streak: number,
  config: ScoringConfig
): MultiplierTier | null {
  return config.multipliers.find(tier => streak < tier.streak) ?? null;
}

interface ScoredHit {
  readonly points: number;
  /** Consecutive Perfects including this hit; a good hit resets it. */
  readonly streak: number;
  readonly multiplier: number;
}

/**
 * Scores one hit. Each multiplier applies from the Perfect that completes
 * its run, and a good hit ends the run.
 */
export function scoreHit(
  quality: HitQuality,
  previousStreak: number,
  config: ScoringConfig
): ScoredHit {
  const streak = quality === 'perfect' ? previousStreak + 1 : 0;
  const multiplier = multiplierFor(streak, config);
  const base = quality === 'perfect' ? config.perfectPoints : config.goodPoints;
  return { points: base * multiplier, streak, multiplier };
}
