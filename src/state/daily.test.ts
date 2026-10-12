import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { COLLECTION, SECOND_SERIES } from '../watches/ids';
import {
  DAILY_ROTATIONS,
  dailyWatch,
  dailyWatchIn,
  localDate,
  marksOf,
  MARKS,
  MAX_MARKS,
  mergeDaily,
  msUntilNextDaily,
  nextDailyAfter,
  qualitiesOf,
  recordDailyRound,
  todaysDaily,
  untilNextDaily,
  type DailyProgress,
  type DailyRotation,
} from './daily';
import { UNWOUND } from './reserve';

const HOUR = 3_600_000;

// The local zone decides the day. London changes its clocks on
// 25 October 2026 (02:00 BST back to 01:00 GMT) and 28 March 2027.
beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/London');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('the local day', () => {
  it('turns at local midnight, not at midnight UTC', () => {
    // 23:30 in London on 1 October is 22:30 UTC.
    expect(todaysDaily(new Date('2026-10-01T22:29:00Z'))).toBe(1);
    expect(todaysDaily(new Date('2026-10-01T23:01:00Z'))).toBe(2);
    expect(localDate(new Date('2026-10-01T23:01:00Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 2,
    });
  });

  it('counts the days the clocks change like any other', () => {
    // 00:30 and 23:30 local on the 25-hour day, then the day after.
    expect(todaysDaily(new Date('2026-10-24T23:30:00Z'))).toBe(25);
    expect(todaysDaily(new Date('2026-10-25T23:30:00Z'))).toBe(25);
    expect(todaysDaily(new Date('2026-10-26T00:30:00Z'))).toBe(26);
    // And the 23-hour day in spring.
    expect(todaysDaily(new Date('2027-03-28T00:30:00Z'))).toBe(179);
    expect(todaysDaily(new Date('2027-03-28T22:30:00Z'))).toBe(179);
    expect(todaysDaily(new Date('2027-03-28T23:30:00Z'))).toBe(180);
  });

  it('plays the first Daily on a clock set before it', () => {
    expect(todaysDaily(new Date('2020-01-01T12:00:00Z'))).toBe(1);
  });

  it('times the next Daily to local midnight', () => {
    expect(msUntilNextDaily(new Date('2026-10-02T17:48:00+01:00'))).toBe(
      6 * HOUR + 12 * 60_000
    );
    // From midnight itself, a whole day.
    expect(msUntilNextDaily(new Date('2026-10-02T00:00:00+01:00'))).toBe(
      24 * HOUR
    );
    // The day the clocks go back lasts 25 hours, the spring one 23.
    expect(msUntilNextDaily(new Date('2026-10-25T00:00:00+01:00'))).toBe(
      25 * HOUR
    );
    expect(msUntilNextDaily(new Date('2027-03-28T00:00:00Z'))).toBe(23 * HOUR);
  });

  it('says how long to the next Daily in hours and minutes', () => {
    expect(untilNextDaily(new Date('2026-10-02T17:48:00+01:00'))).toEqual({
      hours: 6,
      minutes: 12,
    });
    // A part of a minute counts as a whole one, so it never says 0.
    expect(untilNextDaily(new Date('2026-10-02T23:59:30+01:00'))).toEqual({
      hours: 0,
      minutes: 1,
    });
    expect(untilNextDaily(new Date('2026-10-02T23:00:00+01:00'))).toEqual({
      hours: 1,
      minutes: 0,
    });
  });

  it('says the next Daily is out once a round runs past midnight', () => {
    // A round of #2 that ends on 2 October, then one that ends on the 3rd.
    expect(nextDailyAfter(new Date('2026-10-02T23:58:00+01:00'), 2)).toEqual({
      kind: 'in',
      hours: 0,
      minutes: 2,
    });
    expect(nextDailyAfter(new Date('2026-10-03T00:03:00+01:00'), 2)).toEqual({
      kind: 'out',
      number: 3,
    });
    // A clock that has gone back a day says nothing.
    expect(nextDailyAfter(new Date('2026-10-02T12:00:00+01:00'), 3)).toBeNull();
  });
});

describe('dailyWatch', () => {
  it('takes the collection’s watches in turn', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(dailyWatch)).toEqual([
      'diver',
      'chronograph',
      'gmt',
      'moonphase',
      'tourbillon',
      'diver',
      'chronograph',
    ]);
  });

  it('never changes the watch of a Daily already out', () => {
    // Pinned: shared links, Daily boards and the server rely on these. A
    // new watch joins with a rotation of its own, from a later Daily: the
    // second series from #26.
    const first = 'diver chronograph gmt moonphase tourbillon '
      .repeat(5)
      .trim()
      .split(' ');
    const second =
      'diver chronograph gmt moonphase tourbillon field pilot digital '
        .repeat(5)
        .trim()
        .split(' ');
    expect(
      Array.from({ length: 60 }, (_, index) => index + 1).map(dailyWatch)
    ).toEqual([...first, ...second].slice(0, 60));
  });

  it('never picks Endless, even for unusual numbers', () => {
    for (const number of [0, -1, -7, 1000, 2 ** 40]) {
      expect([...COLLECTION, ...SECOND_SERIES]).toContain(dailyWatch(number));
    }
  });
});

describe('DAILY_ROTATIONS', () => {
  it('runs from Daily #1, each rotation after the last', () => {
    expect(DAILY_ROTATIONS[0].from).toBe(1);
    DAILY_ROTATIONS.slice(1).forEach((rotation, index) => {
      expect(rotation.from).toBeGreaterThan(DAILY_ROTATIONS[index]?.from ?? 0);
    });
  });

  it('takes every watch of the collection in the latest rotation', () => {
    // A new watch fails this until it joins the Dailies (see the rotations).
    expect([...(DAILY_ROTATIONS.at(-1)?.watches ?? [])].sort()).toEqual(
      [...COLLECTION, ...SECOND_SERIES].sort()
    );
  });
});

describe('dailyWatch with a rotation added', () => {
  // As a new watch would join, from Daily #61 (here the first rotation's
  // watches in another order).
  const rotations: readonly [DailyRotation, ...DailyRotation[]] = [
    DAILY_ROTATIONS[0],
    {
      from: 61,
      watches: ['diver', 'chronograph', 'gmt', 'tourbillon', 'moonphase'],
    },
  ];

  it('starts the new rotation at its first Daily, leaving those before', () => {
    expect([59, 60, 61, 62, 66].map(n => dailyWatchIn(rotations, n))).toEqual([
      'moonphase',
      'tourbillon',
      'diver',
      'chronograph',
      'diver',
    ]);
    expect(dailyWatchIn(rotations, 64)).toBe('tourbillon');
  });
});

describe('marks', () => {
  it('saves a round’s hits as letters and reads them back', () => {
    const qualities = ['perfect', 'good', 'good', 'perfect'] as const;
    expect(marksOf(qualities)).toBe('PGGP');
    expect(qualitiesOf('PGGP')).toEqual(qualities);
    expect(marksOf([])).toBe('');
  });

  it('keeps saved marks to a valid length', () => {
    const long = marksOf(Array.from({ length: MAX_MARKS + 5 }, () => 'good'));
    expect(long).toHaveLength(MAX_MARKS);
    expect(MARKS.test(long)).toBe(true);
    expect(MARKS.test(`${long}G`)).toBe(false);
    expect(MARKS.test('PGX')).toBe(false);
  });
});

describe('recordDailyRound', () => {
  const fresh: DailyProgress = { daily: null, reserve: UNWOUND };

  it('records the day’s first round and winds the reserve', () => {
    const { progress, outcome } = recordDailyRound(fresh, 2, 12, [
      'perfect',
      'good',
    ]);
    expect(progress).toEqual({
      daily: { number: 2, best: 12, marks: 'PG' },
      reserve: { days: 1, woundOn: 2 },
    });
    expect(outcome).toEqual({
      counted: true,
      best: 12,
      isNewBest: true,
      reserve: 1,
      wound: true,
    });
  });

  it('keeps the day’s best and its marks; winds only once a day', () => {
    const first = recordDailyRound(fresh, 2, 12, ['perfect']).progress;
    const worse = recordDailyRound(first, 2, 5, ['good']);
    expect(worse.progress.daily).toBe(first.daily);
    expect(worse.progress.reserve).toBe(first.reserve);
    expect(worse.outcome).toMatchObject({
      best: 12,
      isNewBest: false,
      wound: false,
      reserve: 1,
    });

    const better = recordDailyRound(first, 2, 20, ['good', 'good']);
    expect(better.progress.daily).toEqual({ number: 2, best: 20, marks: 'GG' });
    expect(better.outcome).toMatchObject({ best: 20, isNewBest: true });
    // A tie is not a new best: the first run to reach it keeps its marks.
    const tie = recordDailyRound(first, 2, 12, ['good']);
    expect(tie.progress.daily?.marks).toBe('P');
  });

  it('starts a new day’s best from that day’s first round', () => {
    const yesterday = recordDailyRound(fresh, 2, 30, ['perfect']).progress;
    const today = recordDailyRound(yesterday, 3, 4, ['good']);
    expect(today.progress.daily).toEqual({ number: 3, best: 4, marks: 'G' });
    expect(today.outcome).toMatchObject({ isNewBest: true, reserve: 2 });
    // A score of 0 still counts as the day's round and winds the reserve.
    const zero = recordDailyRound(yesterday, 3, 0, []);
    expect(zero.progress.daily).toEqual({ number: 3, best: 0, marks: '' });
    expect(zero.outcome).toMatchObject({ isNewBest: false, wound: true });
  });

  it('ignores a round of an older Daily than the saved one', () => {
    const saved = recordDailyRound(fresh, 9, 7, []).progress;
    const { progress, outcome } = recordDailyRound(saved, 8, 40, ['perfect']);
    expect(progress).toBe(saved);
    expect(outcome).toEqual({
      counted: false,
      // Nothing was kept, so there is no day's best to show.
      best: null,
      isNewBest: false,
      reserve: 1,
      wound: false,
    });
  });
});

describe('mergeDaily', () => {
  const day2 = { number: 2, best: 10, marks: 'P' };
  const day2Better = { number: 2, best: 14, marks: 'PP' };
  const day3 = { number: 3, best: 1, marks: 'G' };

  it('keeps the later Daily', () => {
    expect(mergeDaily(day2Better, day3)).toBe(day3);
    expect(mergeDaily(day3, day2Better)).toBe(day3);
  });

  it('keeps the higher best of the same Daily', () => {
    expect(mergeDaily(day2, day2Better)).toBe(day2Better);
    expect(mergeDaily(day2Better, day2)).toBe(day2Better);
    expect(mergeDaily(day2, { ...day2, marks: 'G' })).toBe(day2);
  });

  it('keeps whichever exists', () => {
    expect(mergeDaily(null, day2)).toBe(day2);
    expect(mergeDaily(day2, null)).toBe(day2);
    expect(mergeDaily(null, null)).toBeNull();
  });
});
