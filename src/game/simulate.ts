import type { RoundLog, LoggedAction } from './replay.js';
import type { GameRules } from './rules/types.js';
import { INITIAL_STATE, update, type GameState } from './state.js';
import { centerTime } from './timing.js';

// Simulated players, for tuning the difficulty and for checking a rule set
// before it goes live. A player aims at each target's centre and misses it
// by a normally distributed error: `sigma` is how steady their timing is,
// from about 45 ms (a first-timer) to 12 ms (a rhythm game expert).

/** A seeded normal distribution (Box–Muller over a 32-bit LCG). */
export function normalSource(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 2 ** 32;
  };
  return () =>
    Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

interface SimulatedRound {
  readonly score: number;
  readonly hits: number;
  /** What the player did, as a page would log it. */
  readonly log: RoundLog;
}

/** Rounds longer than this are cut short; no player lasts so long. */
const MAX_TAPS = 5_000;

/**
 * Plays one round of `rules` from `seed` as a player of the given
 * steadiness, starting at `start` on the clock.
 */
export function simulateRound(
  rules: GameRules,
  {
    seed,
    sigma,
    noise = seed,
    start = 1000,
  }: { seed: number; sigma: number; noise?: number; start?: number }
): SimulatedRound {
  const error = normalSource(noise * 7919 + Math.round(sigma));
  let state: GameState = update(
    INITIAL_STATE,
    { type: 'start', time: start, seed },
    rules
  ).state;
  const actions: LoggedAction[] = [];
  while (state.phase === 'playing' && actions.length < MAX_TAPS) {
    const { segment } = state.round;
    const time = Math.max(
      centerTime(segment) + error() * sigma,
      segment.startTime + rules.timing.tapDebounceMs
    );
    actions.push(['tap', time]);
    state = update(state, { type: 'tap', time }, rules).state;
  }
  // A started round is never idle again.
  const { round } = state as Exclude<GameState, { phase: 'idle' }>;
  return {
    score: round.score,
    hits: round.hits,
    log: { seed, start, actions },
  };
}

/** The scores of `rounds` simulated rounds, lowest first. */
export function simulatedScores(
  rules: GameRules,
  sigma: number,
  rounds: number
): number[] {
  return Array.from(
    { length: rounds },
    (_, seed) => simulateRound(rules, { seed, sigma }).score
  ).sort((a, b) => a - b);
}

/** The middle of a sorted list of scores. */
export function medianOf(sorted: readonly number[]): number {
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** The share of sorted scores at or above `least`. */
export function shareAtLeast(sorted: readonly number[], least: number): number {
  return sorted.length === 0
    ? 0
    : sorted.filter(score => score >= least).length / sorted.length;
}
