import {
  dailyNumber,
  type CalendarDate,
  type HitQuality,
} from '../game/index.js';
import type { CollectionWatchId } from '../watches/ids.js';
import { reserveOn, windReserve, type PowerReserve } from './reserve.js';

// The Daily as the app keeps it: which day it is where the player is, the
// watch it is played on, and the day's best. Its rounds never count towards
// the collection (a fixed sequence can be learnt), only towards the day's
// best and the power reserve.

/** The player's calendar date: a Daily day turns at local midnight. */
export function localDate(now: Date): CalendarDate {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/** Today's Daily number; a clock set before the first Daily plays #1. */
export function todaysDaily(now: Date): number {
  return Math.max(1, dailyNumber(localDate(now)));
}

/** Milliseconds from `now` to the next local midnight, when the Daily turns. */
export function msUntilNextDaily(now: Date): number {
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  return midnight.getTime() - now.getTime();
}

/** The time to the next Daily, in whole hours and minutes (rounded up). */
export function untilNextDaily(now: Date): {
  hours: number;
  minutes: number;
} {
  const minutes = Math.ceil(msUntilNextDaily(now) / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/**
 * What the results say about the next Daily after a round of Daily
 * `number`: how long until it, or that it is out already when the round
 * ran past midnight. Null when the clock reads a day before the round's.
 */
export function nextDailyAfter(
  now: Date,
  number: number
):
  | { readonly kind: 'in'; readonly hours: number; readonly minutes: number }
  | { readonly kind: 'out'; readonly number: number }
  | null {
  const today = todaysDaily(now);
  if (today > number) return { kind: 'out', number: today };
  return today === number ? { kind: 'in', ...untilNextDaily(now) } : null;
}

/** From Daily `from` on, the Dailies take `watches` in turn. */
export interface DailyRotation {
  readonly from: number;
  readonly watches: readonly [CollectionWatchId, ...CollectionWatchId[]];
}

/**
 * Which watches the Dailies take turns on, from when. A Daily's watch must
 * never change: shared links and Daily boards name it, and the server
 * ranks a Daily only on its own watch. So the list is only ever added to,
 * never edited. A watch joining the collection joins the Dailies with a
 * new entry from a Daily at least 3 days after its deploy: by then every
 * page has updated (a cached one updates on its next load), and the
 * server, which takes a Daily a day either side of its own, agrees.
 */
export const DAILY_ROTATIONS: readonly [DailyRotation, ...DailyRotation[]] = [
  {
    from: 1,
    watches: ['diver', 'chronograph', 'gmt', 'moonphase', 'tourbillon'],
  },
  // The second series joins on Monday 26 October 2026.
  {
    from: 26,
    watches: [
      'diver',
      'chronograph',
      'gmt',
      'moonphase',
      'tourbillon',
      'field',
      'pilot',
      'digital',
    ],
  },
];

/** Daily `number`'s watch under `rotations`: the latest begun by then. */
export function dailyWatchIn(
  rotations: readonly [DailyRotation, ...DailyRotation[]],
  number: number
): CollectionWatchId {
  const { from, watches } =
    rotations.findLast(rotation => rotation.from <= number) ?? rotations[0];
  const count = watches.length;
  const index = (((number - from) % count) + count) % count;
  // The index is always in range; the fallback only satisfies the types.
  return watches[index] ?? watches[0];
}

/** Daily #1 is on the Diver, #2 on the Chronograph… as the rotations say. */
export function dailyWatch(number: number): CollectionWatchId {
  return dailyWatchIn(DAILY_ROTATIONS, number);
}

/** The day's best Daily round. */
export interface DailyRecord {
  readonly number: number;
  readonly best: number;
  /** The best round's hits in order, `P` for a Perfect, `G` for a plain hit. */
  readonly marks: string;
}

/** Longer than any round, short enough that a saved value stays small. */
export const MAX_MARKS = 1000;
/** What saved marks may look like. */
export const MARKS = new RegExp(`^[PG]{0,${String(MAX_MARKS)}}$`);

/** A round's hits as saved marks. */
export function marksOf(qualities: readonly HitQuality[]): string {
  return qualities
    .slice(0, MAX_MARKS)
    .map(quality => (quality === 'perfect' ? 'P' : 'G'))
    .join('');
}

/** Saved marks back as hits. */
export function qualitiesOf(marks: string): HitQuality[] {
  return marks.split('').map(mark => (mark === 'P' ? 'perfect' : 'good'));
}

/** How a finished Daily round counted. */
export interface DailyOutcome {
  /** False when it was an older Daily than the one saved; nothing changed. */
  readonly counted: boolean;
  /** The day's best, this round included; null when it was not counted. */
  readonly best: number | null;
  /** Whether it beat the day's best so far. */
  readonly isNewBest: boolean;
  /** Days in the power reserve after this round. */
  readonly reserve: number;
  /** Whether this round wound the reserve (the day's first). */
  readonly wound: boolean;
}

export interface DailyProgress {
  readonly daily: DailyRecord | null;
  readonly reserve: PowerReserve;
}

/**
 * Records a finished round of Daily `number`: it may set the day's best
 * (keeping that round's marks), and the day's first round winds the power
 * reserve. A round of an older Daily than the saved one is ignored.
 */
export function recordDailyRound(
  saved: DailyProgress,
  number: number,
  score: number,
  qualities: readonly HitQuality[]
): { progress: DailyProgress; outcome: DailyOutcome } {
  const { daily, reserve } = saved;
  if (daily && number < daily.number) {
    return {
      progress: saved,
      outcome: {
        counted: false,
        best: null,
        isNewBest: false,
        reserve: reserveOn(reserve, number),
        wound: false,
      },
    };
  }
  const today = daily?.number === number ? daily : null;
  const isNewBest = score > (today?.best ?? 0);
  const record =
    today && !isNewBest
      ? today
      : { number, best: score, marks: marksOf(qualities) };
  const wound = windReserve(reserve, number);
  return {
    progress: { daily: record, reserve: wound },
    outcome: {
      counted: true,
      best: record.best,
      isNewBest,
      reserve: reserveOn(wound, number),
      wound: wound !== reserve,
    },
  };
}

/**
 * Combines two saved Daily records (this tab's and another's): the later
 * Daily wins, and the higher best of the same one.
 */
export function mergeDaily(
  a: DailyRecord | null,
  b: DailyRecord | null
): DailyRecord | null {
  if (!a || !b) return a ?? b;
  if (a.number !== b.number) return a.number > b.number ? a : b;
  return b.best > a.best ? b : a;
}
