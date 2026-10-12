import { nextMultiplier, type GameRules } from '../game';

/** How long the lit diamonds take to drain as a plain hit ends the multiplier. */
export const DRAIN_MS = 250;

export interface StreakMeter {
  /** Diamonds lit: the Perfects towards the next multiplier. */
  readonly filled: number;
  /** Diamonds shown: the Perfects that multiplier needs. */
  readonly needed: number;
  /** The factor counted towards; null once the top one is on. */
  readonly next: number | null;
}

/**
 * The streak meter counts towards the next multiplier: its diamonds are the
 * Perfects that tier needs past the one in play, and once the top tier is
 * on they all stay lit.
 */
export function streakMeter(streak: number, rules: GameRules): StreakMeter {
  const { multipliers } = rules.scoring;
  const next = nextMultiplier(streak, rules.scoring);
  const reached = multipliers.filter(tier => streak >= tier.streak);
  const from = reached.at(-1)?.streak ?? 0;
  if (!next) {
    const below = reached.at(-2)?.streak ?? 0;
    return { filled: from - below, needed: from - below, next: null };
  }
  return {
    filled: streak - from,
    needed: next.streak - from,
    next: next.factor,
  };
}
