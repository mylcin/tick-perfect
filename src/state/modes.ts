import { dailySeed, type PracticePace } from '../game';
import type { WatchId } from '../watches/ids';
import type { Challenge } from './challenge';
import { dailyWatch } from './daily';

/**
 * What a round is played for: the collection (a fresh seed every round,
 * scores towards bests and unlocks), a Daily, a friend's challenge, or
 * practice. A Daily and a challenge replay a fixed seed, so they never
 * count towards the collection; practice counts towards nothing at all.
 */
export type RoundMode =
  | { readonly kind: 'collection' }
  | {
      readonly kind: 'daily';
      /** Fixed as the round starts, so a round across midnight stays put. */
      readonly number: number;
      /** A challenge's score to beat, when one led here. */
      readonly toBeat?: number;
    }
  | { readonly kind: 'challenge'; readonly challenge: Challenge }
  | {
      /** A set of targets on the watch on show, missed ones moved past. */
      readonly kind: 'practice';
      readonly pace: PracticePace;
    };

export const COLLECTION_MODE: RoundMode = { kind: 'collection' };

/** The seed every round of a mode replays, or null for a fresh one. */
export function fixedSeed(mode: RoundMode): number | null {
  switch (mode.kind) {
    case 'collection':
    case 'practice':
      return null;
    case 'daily':
      return dailySeed(mode.number);
    case 'challenge':
      return mode.challenge.seed;
  }
}

/** The watch a mode plays on, or null for the collection's pick. */
export function modeWatch(mode: RoundMode): WatchId | null {
  switch (mode.kind) {
    case 'collection':
    case 'practice':
      return null;
    case 'daily':
      return dailyWatch(mode.number);
    case 'challenge':
      return mode.challenge.watch;
  }
}

/** The score a round is out to beat, if it has one. */
export function scoreToBeat(mode: RoundMode): number | null {
  switch (mode.kind) {
    case 'collection':
    case 'practice':
      return null;
    case 'daily':
      return mode.toBeat ?? null;
    case 'challenge':
      return mode.challenge.score;
  }
}

/**
 * How to play a challenge on Daily `today`: a challenge on today's Daily
 * (its watch and its seed) is played as the Daily, with the score to beat;
 * any other is a round of its own.
 */
export function modeForChallenge(
  challenge: Challenge,
  today: number
): RoundMode {
  return challenge.watch === dailyWatch(today) &&
    challenge.seed === dailySeed(today)
    ? { kind: 'daily', number: today, toBeat: challenge.score }
    : { kind: 'challenge', challenge };
}

/** Where a round stands against the score it is out to beat. */
export interface BeatStatus {
  readonly toBeat: number;
  readonly beaten: boolean;
  /** Points still needed to beat it; 0 once beaten. */
  readonly short: number;
}

/** Beating a score means passing it: a tie is one point short. */
export function beatStatus(score: number, toBeat: number): BeatStatus {
  return {
    toBeat,
    beaten: score > toBeat,
    short: Math.max(0, toBeat + 1 - score),
  };
}
