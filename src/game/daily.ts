import { seedFromString } from './rng.js';

// The Daily: one target sequence a day, the same for every player. A day is
// a calendar date, numbered from the first Daily; its number fixes its seed,
// so a Daily can be replayed (or challenged) from its number alone.

/** A calendar date: `month` 1–12, `day` 1–31. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Daily #1. */
export const DAILY_EPOCH: CalendarDate = { year: 2026, month: 10, day: 1 };

const MS_PER_DAY = 86_400_000;

/** Days since 1 January 1970, counted on the calendar, not the clock. */
function dayIndex({ year, month, day }: CalendarDate): number {
  // UTC midnights are exactly a day apart: no time zone, no DST.
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * The Daily number of a calendar date: #1 on the epoch, counting up a day
 * at a time. Dates before the epoch give 0 or less.
 */
export function dailyNumber(date: CalendarDate): number {
  for (const [name, value] of Object.entries(date)) {
    if (!Number.isInteger(value)) {
      throw new RangeError(
        `A date's ${name} is an integer, got ${String(value)}`
      );
    }
  }
  return dayIndex(date) - dayIndex(DAILY_EPOCH) + 1;
}

/** Salts the day number, so a Daily seed is never a plain small number. */
const DAILY_SALT = 'tick-perfect/daily/';

/**
 * The seed of Daily `number`. Every player's round starts from it, so every
 * player gets the same targets. It must never change for a Daily that has
 * been played: the tests pin known values.
 */
export function dailySeed(number: number): number {
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`A Daily number is an integer, got ${String(number)}`);
  }
  return seedFromString(`${DAILY_SALT}${String(number)}`);
}
