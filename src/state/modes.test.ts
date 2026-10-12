import { describe, expect, it } from 'vitest';

import { dailySeed } from '../game';
import {
  beatStatus,
  COLLECTION_MODE,
  fixedSeed,
  modeForChallenge,
  modeWatch,
  scoreToBeat,
  type RoundMode,
} from './modes';

const challenge = { watch: 'gmt', seed: 99, score: 23, revision: 1 } as const;
const daily: RoundMode = { kind: 'daily', number: 2 };

describe('round modes', () => {
  it('gives the collection a fresh seed and its own pick of watch', () => {
    expect(fixedSeed(COLLECTION_MODE)).toBeNull();
    expect(modeWatch(COLLECTION_MODE)).toBeNull();
    expect(scoreToBeat(COLLECTION_MODE)).toBeNull();
  });

  it('plays a Daily from its number', () => {
    expect(fixedSeed(daily)).toBe(dailySeed(2));
    expect(modeWatch(daily)).toBe('chronograph');
    expect(scoreToBeat(daily)).toBeNull();
    expect(scoreToBeat({ ...daily, toBeat: 12 })).toBe(12);
  });

  it('plays a challenge on its own watch and seed', () => {
    const mode: RoundMode = { kind: 'challenge', challenge };
    expect(fixedSeed(mode)).toBe(99);
    expect(modeWatch(mode)).toBe('gmt');
    expect(scoreToBeat(mode)).toBe(23);
  });
});

describe('modeForChallenge', () => {
  it('plays a challenge on today’s Daily as the Daily', () => {
    const today = {
      watch: 'chronograph',
      seed: dailySeed(2),
      score: 9,
      revision: 1,
    } as const;
    expect(modeForChallenge(today, 2)).toEqual({
      kind: 'daily',
      number: 2,
      toBeat: 9,
    });
  });

  it('plays any other challenge as a round of its own', () => {
    // Yesterday's Daily, today's seed on another watch, a random round.
    for (const other of [
      { watch: 'diver', seed: dailySeed(1), score: 9, revision: 1 },
      { watch: 'diver', seed: dailySeed(2), score: 9, revision: 1 },
      challenge,
    ] as const) {
      expect(modeForChallenge(other, 2)).toEqual({
        kind: 'challenge',
        challenge: other,
      });
    }
  });
});

describe('beatStatus', () => {
  it('beats a score only by passing it', () => {
    expect(beatStatus(24, 23)).toEqual({ toBeat: 23, beaten: true, short: 0 });
    expect(beatStatus(23, 23)).toEqual({ toBeat: 23, beaten: false, short: 1 });
    expect(beatStatus(20, 23)).toEqual({ toBeat: 23, beaten: false, short: 4 });
    expect(beatStatus(0, 0)).toEqual({ toBeat: 0, beaten: false, short: 1 });
  });
});
