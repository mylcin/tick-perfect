import { describe, expect, it } from 'vitest';

import { DAILY_EPOCH, dailyNumber, dailySeed } from './daily.js';
import { createRng } from './rng.js';

describe('dailyNumber', () => {
  it('counts from #1 on the epoch', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber({ year: 2026, month: 10, day: 2 })).toBe(2);
    expect(dailyNumber({ year: 2026, month: 10, day: 31 })).toBe(31);
  });

  it.each([
    // Across a month, a year, and a leap day.
    [{ year: 2026, month: 11, day: 1 }, 32],
    [{ year: 2026, month: 12, day: 31 }, 92],
    [{ year: 2027, month: 1, day: 1 }, 93],
    [{ year: 2028, month: 2, day: 28 }, 516],
    [{ year: 2028, month: 2, day: 29 }, 517],
    [{ year: 2028, month: 3, day: 1 }, 518],
    [{ year: 2029, month: 3, day: 1 }, 883],
  ])('numbers %j as #%d', (date, number) => {
    expect(dailyNumber(date)).toBe(number);
  });

  it('counts every day of a year once', () => {
    let previous = dailyNumber({ year: 2026, month: 12, day: 31 });
    for (let day = 1; day <= 365; day++) {
      const number = dailyNumber({ year: 2027, month: 1, day });
      expect(number).toBe(previous + 1);
      previous = number;
    }
  });

  it('gives 0 or less before the first Daily', () => {
    expect(dailyNumber({ year: 2026, month: 9, day: 30 })).toBe(0);
    expect(dailyNumber({ year: 2025, month: 10, day: 1 })).toBe(-364);
  });

  it.each([
    { year: 2026.5, month: 10, day: 1 },
    { year: 2026, month: Number.NaN, day: 1 },
    { year: 2026, month: 10, day: Number.POSITIVE_INFINITY },
  ])('rejects the non-integer date %j', date => {
    expect(() => dailyNumber(date)).toThrow(RangeError);
  });
});

describe('dailySeed', () => {
  it('keeps known seeds, so a past Daily never changes', () => {
    expect([1, 2, 3, 42, 365, 1000].map(number => dailySeed(number))).toEqual([
      1422819224, 3686168731, 493916228, 3104258115, 1589388620, 518549958,
    ]);
  });

  it('is a generator state of its own every day', () => {
    const seeds = Array.from({ length: 1000 }, (_, index) =>
      dailySeed(index + 1)
    );
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const seed of seeds) expect(createRng(seed)).toBe(seed);
  });

  it.each([1.5, Number.NaN, 2 ** 53])('rejects the Daily number %d', number => {
    expect(() => dailySeed(number)).toThrow(RangeError);
  });
});
