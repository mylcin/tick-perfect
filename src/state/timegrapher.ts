import type { HitQuality } from '../game';

// The player's timing, measured the way a timegrapher measures a movement:
// every hit's error in milliseconds (negative is early), kept per watch as
// running sums for the rate and spread, plus the latest errors for the
// trace. It measures skill, not score, so every finished round counts.

/** How many of the latest errors the trace keeps. */
export const RECENT_ERRORS = 120;
/**
 * Far wider than any hit window, so a saved error past it can only be
 * damaged data.
 */
export const MAX_ERROR_MS = 1000;

export interface TimingRecord {
  /** Hits recorded. */
  readonly count: number;
  /** The sum of their errors, in ms. */
  readonly sum: number;
  /** The sum of their squared errors, for the spread. */
  readonly sumSquares: number;
  readonly perfects: number;
  /** The latest errors, oldest first, rounded to whole ms. */
  readonly recent: readonly number[];
}

/** Timing records by watch id; ids this version doesn't know are kept. */
export type TimingRecords = Readonly<Record<string, TimingRecord>>;

export const NO_TIMING: TimingRecords = {};

/** The mean signed error: positive when the player taps late. */
export function rate(record: TimingRecord): number {
  return record.count === 0 ? 0 : record.sum / record.count;
}

/** The population standard deviation of the errors. */
export function spread(record: TimingRecord): number {
  if (record.count === 0) return 0;
  const mean = rate(record);
  // Rounding can leave a constant player a hair below zero.
  return Math.sqrt(Math.max(0, record.sumSquares / record.count - mean ** 2));
}

/** The share of hits that were Perfect, from 0 to 1. */
export function perfectShare(record: TimingRecord): number {
  return record.count === 0 ? 0 : record.perfects / record.count;
}

/** A rate in whole ms, where anything under 1 ms is on time (0). */
export function wholeRate(ms: number): number {
  return Math.abs(ms) < 1 ? 0 : Math.round(ms);
}

export interface TimingStats {
  readonly count: number;
  readonly rate: number;
  readonly spread: number;
}

function recordOf(errors: readonly number[], perfects = 0): TimingRecord {
  return {
    count: errors.length,
    sum: errors.reduce((total, ms) => total + ms, 0),
    sumSquares: errors.reduce((total, ms) => total + ms ** 2, 0),
    perfects,
    recent: errors.slice(-RECENT_ERRORS).map(ms => Math.round(ms)),
  };
}

/** The rate and spread of one round's errors. */
export function roundStats(errors: readonly number[]): TimingStats {
  const record = recordOf(errors);
  return { count: record.count, rate: rate(record), spread: spread(record) };
}

/**
 * Adds a finished round's hits on `watch`: their errors and, in the same
 * order, how they landed.
 */
export function addRound(
  records: TimingRecords,
  watch: string,
  errors: readonly number[],
  qualities: readonly HitQuality[]
): TimingRecords {
  if (errors.length === 0) return records;
  const round = recordOf(
    errors,
    qualities.filter(quality => quality === 'perfect').length
  );
  const before = records[watch];
  if (!before) return { ...records, [watch]: round };
  return {
    ...records,
    [watch]: {
      count: before.count + round.count,
      sum: before.sum + round.sum,
      sumSquares: before.sumSquares + round.sumSquares,
      perfects: before.perfects + round.perfects,
      recent: [...before.recent, ...round.recent].slice(-RECENT_ERRORS),
    },
  };
}

/**
 * Two tabs' records together: per watch, the one with more hits, which has
 * seen every round the other has (or more of them).
 */
export function mergeTiming(a: TimingRecords, b: TimingRecords): TimingRecords {
  const merged: Record<string, TimingRecord> = { ...a };
  for (const [watch, record] of Object.entries(b)) {
    const other = merged[watch];
    if (!other || record.count > other.count) merged[watch] = record;
  }
  return merged;
}

type Fields = Readonly<Record<string, unknown>>;

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecentError(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_ERROR_MS
  );
}

/**
 * Reads a saved record back, whole or not at all: its fields only make
 * sense together.
 */
export function restoreRecord(saved: unknown): TimingRecord | null {
  if (typeof saved !== 'object' || saved === null) return null;
  const { count, sum, sumSquares, perfects, recent } = saved as Fields;
  if (
    !isCount(count) ||
    count === 0 ||
    !isFiniteNumber(sum) ||
    !isFiniteNumber(sumSquares) ||
    !isCount(perfects) ||
    !Array.isArray(recent) ||
    !recent.every(isRecentError)
  ) {
    return null;
  }
  const valid =
    perfects <= count &&
    Math.abs(sum) <= count * MAX_ERROR_MS &&
    sumSquares >= 0 &&
    sumSquares <= count * MAX_ERROR_MS ** 2 &&
    recent.length <= Math.min(count, RECENT_ERRORS);
  return valid ? { count, sum, sumSquares, perfects, recent } : null;
}
