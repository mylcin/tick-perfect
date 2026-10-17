import { describe, expect, it } from 'vitest';

import { FIRST_SERIES } from '../watches/ids';
import {
  collectionProgress,
  engravedOn,
  engravingKey,
  engravingOf,
  MAX_ENGRAVINGS,
  mergeEngravings,
  newEngravings,
  NO_ENGRAVINGS,
  restoreEngravings,
  type EngravingContext,
} from './engravings';
import { INITIAL_PROGRESS } from './progress';
import { UNWOUND } from './reserve';

const NOTHING: EngravingContext = {
  progress: INITIAL_PROGRESS,
  reserve: UNWOUND,
  timing: {},
};

/** A round of `count` taps, each `ms` off alternately early and late. */
const steady = (count: number, ms: number, bestStreak = 0) => ({
  errors: Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? ms : -ms
  ),
  bestStreak,
});

describe('newEngravings', () => {
  it('engraves Isochronism for a steady round of 50 taps, on its watch', () => {
    expect(
      newEngravings(NO_ENGRAVINGS, NOTHING, 'gmt', steady(50, 14))
    ).toEqual(['isochronism:gmt']);
    // Too short a round, or too loose a rate.
    expect(newEngravings(NO_ENGRAVINGS, NOTHING, 'gmt', steady(49, 5))).toEqual(
      []
    );
    expect(
      newEngravings(NO_ENGRAVINGS, NOTHING, 'gmt', steady(80, 15))
    ).toEqual([]);
  });

  it('engraves Beat error for 10 Perfects in a row', () => {
    expect(
      newEngravings(NO_ENGRAVINGS, NOTHING, 'diver', steady(12, 40, 10))
    ).toEqual(['beatError:diver']);
    expect(
      newEngravings(NO_ENGRAVINGS, NOTHING, 'diver', steady(12, 40, 9))
    ).toEqual([]);
  });

  it('engraves what the collection has earned on every caseback', () => {
    const context: EngravingContext = {
      progress: {
        ...INITIAL_PROGRESS,
        best: Object.fromEntries(FIRST_SERIES.map(watch => [watch, 75])),
      },
      reserve: { days: 7, woundOn: 30 },
      timing: {
        diver: { count: 900, sum: 0, sumSquares: 0, perfects: 600, recent: [] },
        gmt: { count: 700, sum: 0, sumSquares: 0, perfects: 400, recent: [] },
      },
    };
    const keys = newEngravings(NO_ENGRAVINGS, context, 'moonphase', null);
    expect(keys).toEqual(['positionalTest', 'powerReserve', 'escapement']);
    expect(
      engravedOn(Object.fromEntries(keys.map(k => [k, 1])), 'diver')
    ).toEqual(['positionalTest', 'powerReserve', 'escapement']);
  });

  it('never engraves the same thing twice', () => {
    const engravings = { 'beatError:diver': 4 };
    expect(
      newEngravings(engravings, NOTHING, 'diver', steady(12, 40, 12))
    ).toEqual([]);
    // The same feat on another watch is that watch's own.
    expect(
      newEngravings(engravings, NOTHING, 'gmt', steady(12, 40, 12))
    ).toEqual(['beatError:gmt']);
  });
});

describe('collectionProgress', () => {
  it('counts towards each collection engraving', () => {
    expect(
      collectionProgress({
        ...NOTHING,
        progress: { ...INITIAL_PROGRESS, best: { diver: 80, gmt: 74 } },
        reserve: { days: 3, woundOn: 9 },
        timing: {
          diver: { count: 10, sum: 0, sumSquares: 0, perfects: 7, recent: [] },
        },
      })
    ).toEqual({
      positionalTest: { now: 1, of: 6 },
      powerReserve: { now: 3, of: 7 },
      escapement: { now: 7, of: 1000 },
    });
  });
});

describe('engravedOn', () => {
  it('lists a watch’s own engravings and the collection’s, in order', () => {
    const engravings = {
      escapement: 3,
      'isochronism:diver': 2,
      'beatError:gmt': 1,
    };
    expect(engravedOn(engravings, 'diver')).toEqual([
      'isochronism',
      'escapement',
    ]);
    expect(engravedOn(engravings, 'gmt')).toEqual(['beatError', 'escapement']);
  });

  it('keys round engravings by watch, the others alone', () => {
    expect(engravingKey('isochronism', 'diver')).toBe('isochronism:diver');
    expect(engravingKey('escapement', 'diver')).toBe('escapement');
    expect(engravingOf('beatError:gmt')).toBe('beatError');
    expect(engravingOf('hairspring')).toBeNull();
  });
});

describe('mergeEngravings', () => {
  it('keeps everything from both, on the earlier day', () => {
    expect(
      mergeEngravings(
        { escapement: 9, 'beatError:diver': 2 },
        { escapement: 4, 'isochronism:gmt': 7 }
      )
    ).toEqual({ escapement: 4, 'beatError:diver': 2, 'isochronism:gmt': 7 });
  });
});

describe('restoreEngravings', () => {
  it('keeps the engravings it knows ahead of any number of others', () => {
    const junk = Object.fromEntries(
      Array.from({ length: MAX_ENGRAVINGS }, (_, i) => [
        `madeUp${String(i)}`,
        1,
      ])
    );
    const restored = restoreEngravings({ ...junk, 'beatError:diver': 4 });
    expect(Object.keys(restored)).toHaveLength(MAX_ENGRAVINGS);
    expect(restored['beatError:diver']).toBe(4);
  });

  it('keeps every engraving that looks like one, known or not', () => {
    expect(
      restoreEngravings({
        escapement: 3,
        'isochronism:worldtimer': 8,
        'Not a key': 2,
        powerReserve: 0,
        beatError: 1.5,
        'beatError:diver': '4',
      })
    ).toEqual({ escapement: 3, 'isochronism:worldtimer': 8 });
  });

  it.each([null, 'escapement', ['escapement'], 7])(
    'reads %j as nothing engraved',
    saved => {
      expect(restoreEngravings(saved)).toEqual({});
    }
  );

  it('keeps no more than a crafted save could bloat', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_ENGRAVINGS + 50 }, (_, i) => [
        `beatError:watch${String(i)}`,
        1,
      ])
    );
    expect(Object.keys(restoreEngravings(many))).toHaveLength(MAX_ENGRAVINGS);
  });
});
