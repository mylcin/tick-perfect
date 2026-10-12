import { describe, expect, it } from 'vitest';

import { WATCH_ORDER } from '../watches/ids';
import { LEVELS, levelFor, pointsFor } from './levels';

describe('levelFor', () => {
  it.each([
    [0, 1, 0, 150],
    [149, 1, 0, 150],
    [150, 2, 150, 400],
    [399, 2, 150, 400],
    [2200, 6, 2200, 3200],
  ])('puts %d points at level %d (%d to %d)', (points, level, from, next) => {
    expect(levelFor(points)).toEqual({ level, from, next });
  });

  it('stops at the top level, with no next one', () => {
    const top = LEVELS.length;
    expect(levelFor(1_000_000)).toEqual({
      level: top,
      from: pointsFor(top),
      next: null,
    });
  });
});

describe('the levels', () => {
  it('climb, each further than the last', () => {
    const steps = LEVELS.slice(1).map(
      (points, index) => points - (LEVELS[index] ?? 0)
    );
    steps.slice(1).forEach((step, index) => {
      expect(step).toBeGreaterThan(steps[index] ?? 0);
    });
  });

  it('reach past the last watch, so there is always one more', () => {
    expect(LEVELS.length).toBeGreaterThan(WATCH_ORDER.length);
  });

  it('has no level 0 or past the top', () => {
    expect(() => pointsFor(0)).toThrow(RangeError);
    expect(() => pointsFor(LEVELS.length + 1)).toThrow(RangeError);
  });
});
