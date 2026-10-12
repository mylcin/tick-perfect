import { describe, expect, it } from 'vitest';

import {
  createRng,
  nextChance,
  nextFloat,
  nextInt,
  seedFromString,
  targetRolls,
  type RngState,
} from './rng.js';

function floats(seed: number, count: number): number[] {
  let state: RngState = createRng(seed);
  const values: number[] = [];
  for (let index = 0; index < count; index++) {
    const [value, next] = nextFloat(state);
    values.push(value);
    state = next;
  }
  return values;
}

describe('createRng', () => {
  it('maps any integer to an unsigned 32-bit state', () => {
    expect(createRng(42)).toBe(42);
    expect(createRng(-1)).toBe(0xffffffff);
    expect(createRng(2 ** 32 + 5)).toBe(5);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the non-integer seed %d',
    seed => {
      expect(() => createRng(seed)).toThrow(RangeError);
    }
  );
});

describe('nextFloat', () => {
  it('replays the same sequence for the same seed', () => {
    expect(floats(42, 100)).toEqual(floats(42, 100));
  });

  it('produces a different sequence for a different seed', () => {
    const a = floats(42, 20);
    const b = floats(43, 20);
    expect(a).not.toEqual(b);
    expect(a.filter((value, index) => value === b[index])).toHaveLength(0);
  });

  it('keeps known outputs, so daily runs stay identical across releases', () => {
    // mulberry32 reference output for seed 42.
    expect(floats(42, 5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
      0.6697340414393693, 0.17481389874592423,
    ]);
  });

  it('does not mutate or depend on anything but its argument', () => {
    const state = createRng(7);
    expect(nextFloat(state)).toEqual(nextFloat(state));
  });

  it('stays in [0, 1) with unsigned 32-bit states', () => {
    let state: RngState = createRng(0);
    for (let index = 0; index < 10_000; index++) {
      const [value, next] = nextFloat(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Number.isInteger(next) && next >= 0 && next < 2 ** 32).toBe(true);
      state = next;
    }
  });

  it('spreads values evenly', () => {
    const buckets = new Array<number>(10).fill(0);
    for (const value of floats(2026, 50_000)) {
      const bucket = Math.floor(value * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(4_700);
      expect(count).toBeLessThan(5_300);
    }
  });
});

describe('nextInt', () => {
  it('covers both bounds and nothing outside them', () => {
    const seen = new Set<number>();
    let state: RngState = createRng(9);
    for (let index = 0; index < 2_000; index++) {
      const [value, next] = nextInt(state, 3, 7);
      seen.add(value);
      state = next;
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('returns min when the range has one value', () => {
    expect(nextInt(createRng(1), 4, 4)[0]).toBe(4);
  });

  it('is deterministic', () => {
    expect(nextInt(createRng(5), 0, 100)).toEqual(
      nextInt(createRng(5), 0, 100)
    );
  });

  it.each([
    [5, 4],
    [0.5, 4],
    [0, 4.5],
  ])('rejects the range %d..%d', (min, max) => {
    expect(() => nextInt(createRng(1), min, max)).toThrow(RangeError);
  });
});

describe('nextChance', () => {
  it('never fires at 0 and always fires at 1', () => {
    let state: RngState = createRng(3);
    for (let index = 0; index < 1_000; index++) {
      const [never] = nextChance(state, 0);
      const [always, next] = nextChance(state, 1);
      expect(never).toBe(false);
      expect(always).toBe(true);
      state = next;
    }
  });

  it('fires at roughly the given rate', () => {
    let state: RngState = createRng(11);
    let fired = 0;
    for (let index = 0; index < 20_000; index++) {
      const [hit, next] = nextChance(state, 0.3);
      if (hit) fired++;
      state = next;
    }
    expect(fired / 20_000).toBeCloseTo(0.3, 1);
  });
});

describe('seedFromString', () => {
  it('keeps known outputs', () => {
    expect(
      ['', 'a', '2026-10-01', '2026-10-02', 'tick-perfect'].map(seedFromString)
    ).toEqual([2872998923, 444641715, 3032859102, 994178996, 3886538735]);
  });

  it('gives neighbouring days unrelated seeds', () => {
    const seeds = new Set(
      Array.from({ length: 365 }, (_, day) =>
        seedFromString(`day-${String(day)}`)
      )
    );
    expect(seeds.size).toBe(365);
  });

  it('returns unsigned 32-bit integers', () => {
    for (const text of ['', 'ü', '時計', 'a'.repeat(1_000)]) {
      const seed = seedFromString(text);
      expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
    }
  });
});

const PINNED_TARGET_ROLLS = ['0.740972', '0.067587'];

describe('targetRolls', () => {
  it('gives each target of a seed its own fixed rolls', () => {
    const first = targetRolls(7, 0, 4);
    expect(first).toHaveLength(4);
    expect(targetRolls(7, 0, 4)).toEqual(first);
    expect(targetRolls(7, 1, 4)).not.toEqual(first);
    expect(targetRolls(8, 0, 4)).not.toEqual(first);
    expect(first.every(roll => roll >= 0 && roll < 1)).toBe(true);
  });

  it('keeps its outputs from release to release', () => {
    expect(targetRolls(2026, 3, 2).map(roll => roll.toFixed(6))).toEqual(
      PINNED_TARGET_ROLLS
    );
  });

  it.each([-1, 1.5, Number.NaN])('rejects the target number %s', target => {
    expect(() => targetRolls(1, target, 1)).toThrow(RangeError);
  });
});
