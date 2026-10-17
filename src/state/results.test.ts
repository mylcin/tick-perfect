import { describe, expect, it } from 'vitest';

import { INITIAL_PROGRESS, recordScore, type Progress } from './progress';
import { goalAfter } from './results';

function after(progress: Progress, score: number, watch = 'diver' as const) {
  const recorded = recordScore(progress, watch, score).progress;
  return goalAfter(recorded, watch, score);
}

describe('goalAfter', () => {
  const withPoints = (points: number): Progress => ({
    ...INITIAL_PROGRESS,
    points,
  });

  it('points at unlocking the next watch once its level is reached', () => {
    expect(after(withPoints(200), 8)).toEqual({
      kind: 'unlock',
      watch: 'chronograph',
      points: 7,
    });
  });

  it('points at the next level when it is nearest', () => {
    // 5 more points reach level 2; Adjusted is 10 away.
    expect(after(withPoints(140), 5)).toEqual({
      kind: 'level',
      level: 2,
      points: 5,
    });
  });

  it('points at the next certificate before the level is near', () => {
    expect(after(INITIAL_PROGRESS, 8)).toEqual({
      kind: 'certificate',
      tier: 'adjusted',
      points: 7,
    });
    const progress = recordScore(withPoints(200), 'diver', 20).progress;
    expect(after(progress, 36)).toEqual({
      kind: 'certificate',
      tier: 'chronometer',
      points: 4,
    });
  });

  it('points at the best when it is nearer', () => {
    const progress = recordScore(withPoints(200), 'diver', 33).progress;
    // 3 short of the best of 33, 10 short of Chronometer.
    expect(after(progress, 30)).toEqual({ kind: 'best', points: 3 });
  });

  it('points at the level alone after an Observatory best', () => {
    expect(after(INITIAL_PROGRESS, 80)).toEqual({
      kind: 'level',
      level: 2,
      points: 70,
    });
  });

  it('has nothing to point at with every certificate and level', () => {
    expect(after(withPoints(1_000_000), 80)).toBeNull();
  });

  it('never points at a watch the round just unlocked', () => {
    expect(after(withPoints(140), 15)).toEqual({
      kind: 'certificate',
      tier: 'chronometer',
      points: 25,
    });
  });
});
