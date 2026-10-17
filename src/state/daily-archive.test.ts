import { describe, expect, it } from 'vitest';

import {
  MAX_DAILIES,
  mergeDailies,
  recordDailyBest,
  restoreDailies,
  runOfDays,
} from './daily-archive';

describe('recordDailyBest', () => {
  it('keeps each day’s best', () => {
    let archive = recordDailyBest({}, 4, 12);
    archive = recordDailyBest(archive, 4, 9);
    archive = recordDailyBest(archive, 5, 3);
    expect(archive).toEqual({ '4': 12, '5': 3 });
    expect(recordDailyBest(archive, 4, 15)).toEqual({ '4': 15, '5': 3 });
  });

  it('keeps the latest days only', () => {
    let archive = {};
    for (let day = 1; day <= MAX_DAILIES + 10; day += 1) {
      archive = recordDailyBest(archive, day, day);
    }
    expect(Object.keys(archive)).toHaveLength(MAX_DAILIES);
    expect(archive).not.toHaveProperty('10');
    expect(archive).toHaveProperty(String(MAX_DAILIES + 10));
  });
});

describe('mergeDailies', () => {
  it('keeps every day in either, at the higher best', () => {
    expect(mergeDailies({ '3': 8, '4': 2 }, { '4': 6, '5': 1 })).toEqual({
      '3': 8,
      '4': 6,
      '5': 1,
    });
  });
});

describe('restoreDailies', () => {
  it('keeps days that look right and drops the rest', () => {
    expect(
      restoreDailies({
        '3': 8,
        '0': 4,
        '03': 4,
        '-1': 4,
        x: 4,
        '4': -1,
        '5': 2.5,
        '6': '7',
        '7': 0,
      })
    ).toEqual({ '3': 8, '7': 0 });
  });

  it('drops days past the latest it may hold', () => {
    expect(restoreDailies({ '10': 1, '12': 2, '13': 3 }, 12)).toEqual({
      '10': 1,
      '12': 2,
    });
  });

  it.each([null, [], 'days', 4])('reads %j as no days', saved => {
    expect(restoreDailies(saved)).toEqual({});
  });
});

describe('runOfDays', () => {
  const archive = { '3': 1, '5': 4, '6': 2, '7': 9 };

  it('counts the days in a row up to today', () => {
    expect(runOfDays(archive, 7)).toBe(3);
  });

  it('still counts from yesterday while today is unplayed', () => {
    expect(runOfDays(archive, 8)).toBe(3);
  });

  it('is broken by a day missed', () => {
    expect(runOfDays(archive, 9)).toBe(0);
    expect(runOfDays({}, 1)).toBe(0);
  });
});
