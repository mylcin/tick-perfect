import { describe, expect, it } from 'vitest';

import {
  addRound,
  MAX_ERROR_MS,
  mergeTiming,
  NO_TIMING,
  perfectShare,
  rate,
  RECENT_ERRORS,
  restoreRecord,
  roundStats,
  spread,
  wholeRate,
  type TimingRecord,
} from './timegrapher';

const EMPTY: TimingRecord = {
  count: 0,
  sum: 0,
  sumSquares: 0,
  perfects: 0,
  recent: [],
};

describe('timing statistics', () => {
  it('reads the rate, spread and Perfect share of a record', () => {
    const timing = addRound(
      NO_TIMING,
      'diver',
      [10, -2, 4, 8],
      ['good', 'perfect', 'perfect', 'good']
    );
    const record = timing['diver'] ?? EMPTY;
    expect(rate(record)).toBe(5);
    // Deviations 5, -7, -1, 3: a variance of 21.
    expect(spread(record)).toBeCloseTo(Math.sqrt(21), 10);
    expect(perfectShare(record)).toBe(0.5);
  });

  it('reads an empty record as on time and perfectly steady', () => {
    expect(rate(EMPTY)).toBe(0);
    expect(spread(EMPTY)).toBe(0);
    expect(perfectShare(EMPTY)).toBe(0);
  });

  it('never takes the root of a variance rounded below zero', () => {
    // Three taps of 0.1 ms: the sums leave a variance of about -1e-18.
    const record = addRound(NO_TIMING, 'diver', [0.1, 0.1, 0.1], [])['diver'];
    expect(spread(record ?? EMPTY)).toBe(0);
  });

  it('works out a round’s rate and spread', () => {
    expect(roundStats([-12, -8])).toEqual({ count: 2, rate: -10, spread: 2 });
    expect(roundStats([])).toEqual({ count: 0, rate: 0, spread: 0 });
  });

  it('rounds a rate to whole ms, with under 1 ms on time', () => {
    expect(wholeRate(0.99)).toBe(0);
    expect(wholeRate(-0.5)).toBe(0);
    expect(wholeRate(1)).toBe(1);
    expect(wholeRate(8.6)).toBe(9);
    expect(wholeRate(-4.2)).toBe(-4);
  });
});

describe('addRound', () => {
  it('adds a round to the watch’s running sums', () => {
    const first = addRound(NO_TIMING, 'gmt', [3.4, -1.6], ['perfect', 'good']);
    const both = addRound(first, 'gmt', [5], ['perfect']);
    expect(both['gmt']).toEqual({
      count: 3,
      sum: 3.4 - 1.6 + 5,
      sumSquares: 3.4 ** 2 + 1.6 ** 2 + 25,
      perfects: 2,
      recent: [3, -2, 5],
    });
    expect(first['gmt']?.count).toBe(2);
  });

  it('keeps each watch apart', () => {
    const timing = addRound(
      addRound(NO_TIMING, 'diver', [1], ['good']),
      'moonphase',
      [2, 3],
      ['good', 'good']
    );
    expect(timing['diver']?.count).toBe(1);
    expect(timing['moonphase']?.count).toBe(2);
  });

  it('keeps only the latest errors for the trace', () => {
    const many = Array.from({ length: RECENT_ERRORS + 30 }, (_, i) => i);
    const record = addRound(NO_TIMING, 'diver', many, [])['diver'];
    expect(record?.count).toBe(RECENT_ERRORS + 30);
    expect(record?.recent).toHaveLength(RECENT_ERRORS);
    expect(record?.recent[0]).toBe(30);
    const more = addRound({ diver: record ?? EMPTY }, 'diver', [-7], []);
    expect(more['diver']?.recent).toHaveLength(RECENT_ERRORS);
    expect(more['diver']?.recent.at(-1)).toBe(-7);
  });

  it('changes nothing for a round without hits', () => {
    expect(addRound(NO_TIMING, 'diver', [], [])).toBe(NO_TIMING);
  });
});

describe('mergeTiming', () => {
  it('keeps, per watch, the record with more hits', () => {
    const a = {
      diver: { ...EMPTY, count: 5, recent: [1] },
      gmt: { ...EMPTY, count: 2 },
    };
    const b = {
      diver: { ...EMPTY, count: 3 },
      gmt: { ...EMPTY, count: 9 },
      futureWatch: { ...EMPTY, count: 1 },
    };
    expect(mergeTiming(a, b)).toEqual({
      diver: a.diver,
      gmt: b.gmt,
      futureWatch: b.futureWatch,
    });
    // A tie keeps the first.
    expect(mergeTiming(a, { diver: { ...EMPTY, count: 5 } })['diver']).toBe(
      a.diver
    );
  });
});

describe('restoreRecord', () => {
  const valid = {
    count: 4,
    sum: -12.5,
    sumSquares: 300,
    perfects: 1,
    recent: [-3, -4, -2, -4],
  };

  it('reads back a saved record', () => {
    expect(restoreRecord(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it.each([
    ['nothing', null],
    ['a number', 42],
    ['no hits', { ...valid, count: 0, recent: [] }],
    ['a fractional count', { ...valid, count: 4.5 }],
    ['a sum that is not a number', { ...valid, sum: '1' }],
    ['an infinite sum', { ...valid, sum: Number.POSITIVE_INFINITY }],
    ['a negative sum of squares', { ...valid, sumSquares: -1 }],
    ['more Perfects than hits', { ...valid, perfects: 5 }],
    ['more errors than hits', { ...valid, recent: [1, 2, 3, 4, 5] }],
    ['errors that are not whole ms', { ...valid, recent: [1.5] }],
    ['an error past any window', { ...valid, recent: [MAX_ERROR_MS + 1] }],
    ['a sum past any window', { ...valid, sum: 4 * MAX_ERROR_MS + 1 }],
    [
      'squares past any window',
      { ...valid, sumSquares: 4 * MAX_ERROR_MS ** 2 + 1 },
    ],
    ['no trace', { ...valid, recent: 'x' }],
    [
      'a trace longer than kept',
      {
        ...valid,
        count: 500,
        recent: Array.from({ length: RECENT_ERRORS + 1 }, () => 0),
      },
    ],
  ])('drops a record with %s', (_, saved) => {
    expect(restoreRecord(saved)).toBeNull();
  });
});
