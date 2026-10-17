import type { HitQuality } from '../game';
import { roundStats } from './timegrapher';

// The latest rounds on each watch, a line each, kept on this device: what
// the timegrapher compares to show progress. A line holds a round's totals,
// never its taps, so a hundred of them on every watch stay a few dozen kB.

/** How each mode is written in a line. */
export const MODE_CODES = { collection: 0, daily: 1, challenge: 2 } as const;
export type ModeCode = (typeof MODE_CODES)[keyof typeof MODE_CODES];

/**
 * One finished round, as a tuple to keep the save small: when it ended (ms
 * since 1970, which also tells two tabs' lines apart), its mode, score,
 * hits and Perfects, and its hits' mean error and spread in ms, to a tenth
 * (both 0 with no hits).
 */
export type RoundLine = readonly [
  at: number,
  mode: ModeCode,
  score: number,
  hits: number,
  perfects: number,
  rate: number,
  spread: number,
];

/** Each watch's lines, oldest first. */
export type History = Readonly<Record<string, readonly RoundLine[]>>;

export const NO_HISTORY: History = {};

/** The most lines kept on each watch: enough for the last 100 rounds. */
export const MAX_LINES = 100;

const tenth = (ms: number) => Math.round(ms * 10) / 10;

/** The line for a round that ended `at`, from its hits' errors and kinds. */
export function lineFor(
  at: number,
  mode: ModeCode,
  score: number,
  errors: readonly number[],
  qualities: readonly HitQuality[]
): RoundLine {
  const stats = roundStats(errors);
  return [
    at,
    mode,
    score,
    errors.length,
    qualities.filter(quality => quality === 'perfect').length,
    errors.length > 0 ? tenth(stats.rate) : 0,
    errors.length > 0 ? tenth(stats.spread) : 0,
  ];
}

/** Oldest first, each moment once, the latest MAX_LINES. */
function tidy(lines: readonly RoundLine[]): RoundLine[] {
  const byTime = new Map(lines.map(line => [line[0], line]));
  return [...byTime.values()].sort((a, b) => a[0] - b[0]).slice(-MAX_LINES);
}

/** `history` with a line added on `watch`. */
export function addLine(
  history: History,
  watch: string,
  line: RoundLine
): History {
  return { ...history, [watch]: tidy([...(history[watch] ?? []), line]) };
}

/**
 * Two tabs' histories together: every line either has, once. (A line is
 * only ever added, so neither side's can be out of date.)
 */
export function mergeHistory(a: History, b: History): History {
  const merged: Record<string, readonly RoundLine[]> = { ...a };
  for (const [watch, lines] of Object.entries(b)) {
    merged[watch] = tidy([...(merged[watch] ?? []), ...lines]);
  }
  return merged;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isMs = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1000;

/** A saved line, if it is one: every field in range, or none of it. */
export function restoreLine(saved: unknown): RoundLine | null {
  if (!Array.isArray(saved) || saved.length !== 7) return null;
  const [at, mode, score, hits, perfects, rate, spread] = saved as unknown[];
  return isCount(at) &&
    at > 0 &&
    (mode === 0 || mode === 1 || mode === 2) &&
    isCount(score) &&
    isCount(hits) &&
    isCount(perfects) &&
    perfects <= hits &&
    isMs(rate) &&
    isMs(spread) &&
    spread >= 0
    ? [at, mode, score, hits, perfects, rate, spread]
    : null;
}

/** A watch's saved lines read back: the valid ones, in order, capped. */
export function restoreLines(saved: unknown): RoundLine[] {
  if (!Array.isArray(saved)) return [];
  // No more is read than could be kept, so a bloated save costs nothing.
  return tidy(
    saved
      .slice(-MAX_LINES * 2)
      .map(restoreLine)
      .filter(line => line !== null)
  );
}

/**
 * What a run of rounds adds up to. Perfect share is Perfects over hits;
 * rate is the hits' mean error (late positive) and spread their standard
 * deviation, both over every hit in the rounds, as if they were one round.
 */
export interface Summary {
  readonly rounds: number;
  readonly averageScore: number;
  readonly bestScore: number;
  readonly hits: number;
  /** Null with no hits. */
  readonly perfectShare: number | null;
  readonly rate: number | null;
  readonly spread: number | null;
}

/** The summary of `lines`, or null with none. */
export function summarize(lines: readonly RoundLine[]): Summary | null {
  if (lines.length === 0) return null;
  let score = 0;
  let best = 0;
  let hits = 0;
  let perfects = 0;
  let sum = 0;
  let squares = 0;
  for (const [, , lineScore, lineHits, linePerfects, rate, spread] of lines) {
    score += lineScore;
    best = Math.max(best, lineScore);
    hits += lineHits;
    perfects += linePerfects;
    // Each round's own mean and variance, weighted by its hits.
    sum += lineHits * rate;
    squares += lineHits * (spread ** 2 + rate ** 2);
  }
  const mean = hits > 0 ? sum / hits : null;
  return {
    rounds: lines.length,
    averageScore: score / lines.length,
    bestScore: best,
    hits,
    perfectShare: hits > 0 ? perfects / hits : null,
    rate: mean,
    spread:
      mean === null ? null : Math.sqrt(Math.max(0, squares / hits - mean ** 2)),
  };
}

/**
 * The latest `count` lines, and the `count` before them to compare with
 * (null until there are that many more).
 */
export function latestRounds(
  lines: readonly RoundLine[],
  count: number
): {
  readonly latest: readonly RoundLine[];
  readonly before: readonly RoundLine[] | null;
} {
  const latest = lines.slice(-count);
  const earlier = lines.slice(0, -count);
  return {
    latest,
    before: earlier.length >= count ? earlier.slice(-count) : null,
  };
}
