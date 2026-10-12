import { describe, expect, it } from 'vitest';

import {
  mergeReserve,
  RESERVE_DAYS,
  reserveOn,
  UNWOUND,
  windReserve,
  type PowerReserve,
} from './reserve';

/** Winds on each of `days` in turn, from an unwound watch. */
function woundOn(days: readonly number[]): PowerReserve {
  return days.reduce(windReserve, UNWOUND);
}

describe('reserveOn', () => {
  it('is empty on a watch never wound', () => {
    expect(reserveOn(UNWOUND, 1)).toBe(0);
    expect(reserveOn(UNWOUND, 400)).toBe(0);
  });

  it('holds through the day it was wound and the day after', () => {
    const reserve = { days: 4, woundOn: 10 };
    expect(reserveOn(reserve, 10)).toBe(4);
    // Tomorrow isn't missed until it is over.
    expect(reserveOn(reserve, 11)).toBe(4);
  });

  it('runs down a day for every whole day missed, to empty', () => {
    const reserve = { days: 4, woundOn: 10 };
    expect(
      [12, 13, 14, 15, 16, 30].map(day => reserveOn(reserve, day))
    ).toEqual([3, 2, 1, 0, 0, 0]);
  });

  it('keeps a reserve wound in the future as it is', () => {
    expect(reserveOn({ days: 5, woundOn: 20 }, 12)).toBe(5);
  });
});

describe('windReserve', () => {
  it('winds a day for every day played, up to a week', () => {
    const days = Array.from({ length: 10 }, (_, index) => index + 1);
    const seen = days.map(day => reserveOn(woundOn(days.slice(0, day)), day));
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 7, 7]);
    expect(Math.max(...seen)).toBe(RESERVE_DAYS);
  });

  it('winds once a day, however many Dailies are played', () => {
    const once = windReserve(UNWOUND, 3);
    expect(windReserve(once, 3)).toBe(once);
    expect(once).toEqual({ days: 1, woundOn: 3 });
  });

  it('winds from what is left after a gap, never from zero', () => {
    // Wound to 5 by day 5, then away for three days.
    const before = woundOn([1, 2, 3, 4, 5]);
    expect(before).toEqual({ days: 5, woundOn: 5 });
    // Days 6, 7 and 8 missed: 2 left on day 9, and playing makes it 3.
    expect(windReserve(before, 9)).toEqual({ days: 3, woundOn: 9 });
    // Away for long enough to run down: it starts again at 1.
    expect(windReserve(before, 40)).toEqual({ days: 1, woundOn: 40 });
  });

  it('winds on top the next day; one day off and back evens out', () => {
    expect(windReserve({ days: 7, woundOn: 4 }, 5)).toEqual({
      days: 7,
      woundOn: 5,
    });
    expect(windReserve({ days: 3, woundOn: 4 }, 6)).toEqual({
      days: 3,
      woundOn: 6,
    });
  });

  it('survives a clock set back', () => {
    // Wound on day 20, then the clock says day 12.
    const ahead = { days: 5, woundOn: 20 };
    const wound = windReserve(ahead, 12);
    expect(wound).toEqual({ days: 6, woundOn: 12 });
    expect(reserveOn(wound, 12)).toBe(6);
    expect(windReserve({ days: 7, woundOn: 20 }, 12).days).toBe(7);
  });
});

describe('mergeReserve', () => {
  it("keeps another tab's later wind, which has seen the earlier one", () => {
    const early = woundOn([1, 2, 3]);
    const late = woundOn([1, 2, 3, 4, 5]);
    expect(mergeReserve(early, late)).toBe(late);
    expect(mergeReserve(late, early)).toBe(late);
  });

  it("never lets another device's first wind run the reserve down", () => {
    // A full week on the phone, then a first Daily on a new tablet.
    const phone = woundOn([4, 5, 6, 7, 8, 9, 10]);
    const tablet = woundOn([11]);
    expect(phone.days).toBe(RESERVE_DAYS);
    const merged = { days: RESERVE_DAYS, woundOn: 11 };
    expect(mergeReserve(phone, tablet)).toEqual(merged);
    expect(mergeReserve(tablet, phone)).toEqual(merged);
  });

  it('runs the earlier reserve down for the days missed in between', () => {
    // Five whole days missed (4 to 8) leave 2, and the wind on 9 adds one.
    const early = { days: 7, woundOn: 3 };
    const late = { days: 1, woundOn: 9 };
    expect(mergeReserve(early, late)).toEqual({ days: 3, woundOn: 9 });
    expect(mergeReserve(late, early)).toEqual({ days: 3, woundOn: 9 });
  });

  it('keeps the later wind when it is the fuller one', () => {
    const early = { days: 2, woundOn: 3 };
    const late = { days: 5, woundOn: 6 };
    expect(mergeReserve(early, late)).toBe(late);
    expect(mergeReserve(UNWOUND, late)).toBe(late);
  });

  it('keeps the fuller reserve wound the same day', () => {
    const low = { days: 2, woundOn: 5 };
    const high = { days: 4, woundOn: 5 };
    expect(mergeReserve(low, high)).toBe(high);
    expect(mergeReserve(high, low)).toBe(high);
    expect(mergeReserve(low, { ...low })).toBe(low);
  });
});
