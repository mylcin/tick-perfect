import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCORING,
  multiplierFor,
  nextMultiplier,
  scoreHit,
  type HitQuality,
} from './scoring.js';

/** Scores a run of hits and returns the points of each. */
function play(qualities: HitQuality[], config = DEFAULT_SCORING) {
  let streak = 0;
  return qualities.map(quality => {
    const scored = scoreHit(quality, streak, config);
    streak = scored.streak;
    return scored;
  });
}

describe('scoreHit', () => {
  it('gives a normal hit 1 point', () => {
    expect(scoreHit('good', 0, DEFAULT_SCORING)).toEqual({
      points: 1,
      streak: 0,
      multiplier: 1,
    });
  });

  it('gives a Perfect 2 points and starts a streak', () => {
    expect(scoreHit('perfect', 0, DEFAULT_SCORING)).toEqual({
      points: 2,
      streak: 1,
      multiplier: 1,
    });
  });

  it('switches the ×2 multiplier on with the third Perfect in a row', () => {
    const run = play(['perfect', 'perfect', 'perfect', 'perfect']);
    expect(run.map(hit => hit.points)).toEqual([2, 2, 4, 4]);
    expect(run.map(hit => hit.multiplier)).toEqual([1, 1, 2, 2]);
  });

  it('ends the multiplier with a good hit, scoring it at ×1', () => {
    const run = play(['perfect', 'perfect', 'perfect', 'good']);
    expect(run.at(-1)).toEqual({ points: 1, streak: 0, multiplier: 1 });
  });

  it('raises it to ×3 with the eighth Perfect in a row', () => {
    const run = play(Array<HitQuality>(9).fill('perfect'));
    expect(run.map(hit => hit.multiplier)).toEqual([1, 1, 2, 2, 2, 2, 2, 3, 3]);
    expect(run.at(-1)?.points).toBe(6);
  });

  it('needs a fresh streak after a good hit', () => {
    const run = play([
      'perfect',
      'perfect',
      'good',
      'perfect',
      'perfect',
      'perfect',
    ]);
    expect(run.map(hit => hit.points)).toEqual([2, 2, 1, 2, 2, 4]);
  });

  it('follows a custom configuration', () => {
    const config = {
      goodPoints: 10,
      perfectPoints: 25,
      multipliers: [{ streak: 2, factor: 3 }],
    } as const;
    expect(
      play(['good', 'perfect', 'perfect', 'perfect'], config).map(
        hit => hit.points
      )
    ).toEqual([10, 25, 75, 75]);
  });
});

describe('multiplierFor', () => {
  it("is 1 below the first streak, then each tier's factor from it on", () => {
    expect(
      [0, 1, 2, 3, 7, 8, 50].map(s => multiplierFor(s, DEFAULT_SCORING))
    ).toEqual([1, 1, 1, 2, 2, 3, 3]);
  });
});

describe('nextMultiplier', () => {
  it('names the tier a streak is working towards', () => {
    expect(nextMultiplier(0, DEFAULT_SCORING)).toEqual({
      streak: 3,
      factor: 2,
    });
    expect(nextMultiplier(3, DEFAULT_SCORING)).toEqual({
      streak: 8,
      factor: 3,
    });
  });

  it('is null once the top tier is on', () => {
    expect(nextMultiplier(8, DEFAULT_SCORING)).toBeNull();
  });
});
