import { describe, expect, it } from 'vitest';

import {
  angularDistance,
  arcBounds,
  arcContains,
  CLOCKWISE,
  COUNTERCLOCKWISE,
  forwardDistance,
  FULL_TURN,
  MINUTE_MARK,
  normalizeAngle,
  reverse,
  rotate,
  signedDelta,
} from './angle.js';
import { createRng, nextFloat, type RngState } from './rng.js';

/** Deterministic pseudo-random cases, so property checks never flake. */
function* randomCases(count: number, seed = 1): Generator<number[]> {
  let rng: RngState = createRng(seed);
  for (let index = 0; index < count; index++) {
    const values: number[] = [];
    for (let draw = 0; draw < 3; draw++) {
      const [value, next] = nextFloat(rng);
      values.push(value);
      rng = next;
    }
    yield values;
  }
}

describe('constants', () => {
  it('splits the dial into 60 minute marks', () => {
    expect(FULL_TURN).toBe(360);
    expect(MINUTE_MARK).toBe(6);
  });
});

describe('reverse', () => {
  it('flips the direction', () => {
    expect(reverse(CLOCKWISE)).toBe(COUNTERCLOCKWISE);
    expect(reverse(COUNTERCLOCKWISE)).toBe(CLOCKWISE);
  });
});

describe('normalizeAngle', () => {
  it.each([
    [0, 0],
    [359, 359],
    [360, 0],
    [361, 1],
    [720, 0],
    [725.5, 5.5],
    [-1, 359],
    [-360, 0],
    [-361, 359],
    [-725.5, 354.5],
  ])('wraps %d to %d', (angle, expected) => {
    expect(normalizeAngle(angle)).toBeCloseTo(expected, 12);
  });

  it('never returns -0', () => {
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
    expect(Object.is(normalizeAngle(-360), 0)).toBe(true);
  });

  it('never returns 360 for tiny negative angles', () => {
    expect(normalizeAngle(-1e-15)).toBe(0);
    expect(normalizeAngle(-Number.EPSILON)).toBeLessThan(360);
  });

  it('always lands in [0, 360)', () => {
    for (const [a = 0] of randomCases(500)) {
      const value = normalizeAngle((a - 0.5) * 1e6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(360);
    }
  });
});

describe('rotate', () => {
  it('rotates clockwise across 12 o’clock', () => {
    expect(rotate(350, 20)).toBeCloseTo(10, 12);
  });

  it('rotates counter-clockwise across 12 o’clock', () => {
    expect(rotate(10, -20)).toBeCloseTo(350, 12);
  });
});

describe('signedDelta', () => {
  it.each([
    [0, 10, 10],
    [10, 0, -10],
    [350, 10, 20],
    [10, 350, -20],
    [359, 0, 1],
    [0, 359, -1],
    [0, 180, 180],
    [180, 0, 180],
    [0, 190, -170],
    [90, 90, 0],
  ])('from %d to %d is %d', (from, to, expected) => {
    expect(signedDelta(from, to)).toBeCloseTo(expected, 12);
  });

  it('stays in (-180, 180]', () => {
    for (const [a = 0, b = 0] of randomCases(500)) {
      const delta = signedDelta(a * 720 - 360, b * 720 - 360);
      expect(delta).toBeGreaterThan(-180);
      expect(delta).toBeLessThanOrEqual(180);
    }
  });
});

describe('angularDistance', () => {
  it('is symmetric and takes the short way round', () => {
    expect(angularDistance(350, 10)).toBeCloseTo(20, 12);
    expect(angularDistance(10, 350)).toBeCloseTo(20, 12);
    expect(angularDistance(0, 180)).toBe(180);
  });
});

describe('forwardDistance', () => {
  it('measures clockwise across 0°', () => {
    expect(forwardDistance(350, 10, CLOCKWISE)).toBeCloseTo(20, 12);
    expect(forwardDistance(10, 350, CLOCKWISE)).toBeCloseTo(340, 12);
  });

  it('measures counter-clockwise across 0°', () => {
    expect(forwardDistance(10, 350, COUNTERCLOCKWISE)).toBeCloseTo(20, 12);
    expect(forwardDistance(350, 10, COUNTERCLOCKWISE)).toBeCloseTo(340, 12);
  });

  it('never takes the short way round', () => {
    expect(forwardDistance(0, 359, CLOCKWISE)).toBe(359);
    expect(forwardDistance(359, 0, COUNTERCLOCKWISE)).toBe(359);
  });

  it('is 0 for the same angle', () => {
    expect(forwardDistance(42, 42, CLOCKWISE)).toBe(0);
    expect(forwardDistance(42, 402, COUNTERCLOCKWISE)).toBe(0);
  });

  it('adds up to a full turn in both directions', () => {
    for (const [a = 0, b = 0] of randomCases(500)) {
      const from = a * 360;
      const to = b * 360;
      if (angularDistance(from, to) < 1e-6) continue;
      const total =
        forwardDistance(from, to, CLOCKWISE) +
        forwardDistance(from, to, COUNTERCLOCKWISE);
      expect(total).toBeCloseTo(360, 9);
    }
  });
});

describe('arcContains', () => {
  // The brief's edge case: centred at 359° and 20° wide, the arc covers
  // 349° … 359° … 0° … 9°.
  const acrossZero = { center: 359, width: 20 };

  it.each([349, 350, 355, 359, 0, 1, 5, 9])(
    'includes %d° on an arc that crosses 0°',
    angle => {
      expect(arcContains(acrossZero, angle)).toBe(true);
    }
  );

  it.each([348.9, 9.1, 180, 100, 300])(
    'excludes %d° on an arc that crosses 0°',
    angle => {
      expect(arcContains(acrossZero, angle)).toBe(false);
    }
  );

  it('includes both edges exactly', () => {
    const arc = { center: 90, width: 24 };
    expect(arcContains(arc, 78)).toBe(true);
    expect(arcContains(arc, 102)).toBe(true);
    expect(arcContains(arc, 77.999)).toBe(false);
    expect(arcContains(arc, 102.001)).toBe(false);
  });

  it('accepts unnormalised angles', () => {
    expect(arcContains({ center: -1, width: 20 }, 369)).toBe(true);
    expect(arcContains({ center: 719, width: 4 }, -0.5)).toBe(true);
  });

  it('absorbs floating-point noise on an edge', () => {
    // 0.1 + 0.2 is 0.30000000000000004.
    expect(arcContains({ center: 0, width: 0.6 }, 0.1 + 0.2)).toBe(true);
  });

  it('covers the whole dial when 360° wide', () => {
    expect(arcContains({ center: 123, width: 360 }, 303)).toBe(true);
  });

  it('matches a naive check that unwraps the angle', () => {
    for (const [a = 0, b = 0, c = 0] of randomCases(2000, 7)) {
      const arc = { center: a * 360, width: 1 + b * 178 };
      const angle = c * 360;
      const naive = [-360, 0, 360].some(
        lap => Math.abs(angle + lap - arc.center) <= arc.width / 2
      );
      expect(arcContains(arc, angle)).toBe(naive);
    }
  });
});

describe('arcBounds', () => {
  it('reads clockwise from start to end', () => {
    expect(arcBounds({ center: 90, width: 24 })).toEqual({
      start: 78,
      end: 102,
    });
  });

  it('crosses 0° with start greater than end', () => {
    const { start, end } = arcBounds({ center: 359, width: 20 });
    expect(start).toBeCloseTo(349, 12);
    expect(end).toBeCloseTo(9, 12);
  });

  it('centres the target on its bounds', () => {
    const { start, end } = arcBounds({ center: 3, width: 10 });
    expect(start).toBeCloseTo(358, 12);
    expect(end).toBeCloseTo(8, 12);
    expect(forwardDistance(start, end, CLOCKWISE)).toBeCloseTo(10, 12);
  });
});
