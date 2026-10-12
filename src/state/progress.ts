import { FIRST_WATCH, WATCH_ORDER, type WatchId } from '../watches/ids';
import {
  certificateFor,
  UNLOCK_SCORE,
  type CertificateTier,
} from './certificates';
import { levelFor, pointsFor } from './levels';

/**
 * Bests and unlocks are keyed by plain strings, not only by the watches this
 * version knows: a save written by a newer version (another tab, or before
 * a rollback) may name watches this one has never heard of, and writing it
 * back must not lose them.
 */
export interface Progress {
  /** Highest score on each watch played so far. */
  readonly best: Readonly<Record<string, number>>;
  /** Watches the player can pick: known ones in collection order first. */
  readonly unlocked: readonly string[];
  /** Every collection round's score, added up: the watchmaker's level. */
  readonly points: number;
}

export const INITIAL_PROGRESS: Progress = {
  best: {},
  unlocked: [FIRST_WATCH],
  points: 0,
};

/**
 * What unlocks a watch: a score on the watch before it (Endless comes after
 * the Tourbillon), and a watchmaker's level.
 */
interface UnlockRequirement {
  readonly watch: WatchId;
  readonly score: number;
  readonly level: number;
  /** The points that reach the level. */
  readonly points: number;
}

export function requirementFor(watch: WatchId): UnlockRequirement | null {
  const index = WATCH_ORDER.indexOf(watch);
  const previous = WATCH_ORDER[index - 1];
  if (!previous) return null;
  // The second watch needs level 2, and so on.
  const level = index + 1;
  return {
    watch: previous,
    score: UNLOCK_SCORE,
    level,
    points: pointsFor(level),
  };
}

/** Which parts of `requirement` the player has met. */
export function requirementMet(
  progress: Progress,
  requirement: UnlockRequirement
): { readonly score: boolean; readonly level: boolean } {
  return {
    score:
      isUnlocked(progress, requirement.watch) &&
      bestScore(progress, requirement.watch) >= requirement.score,
    level: progress.points >= requirement.points,
  };
}

export function bestScore(progress: Progress, watch: WatchId): number {
  return progress.best[watch] ?? 0;
}

export function isUnlocked(progress: Progress, watch: WatchId): boolean {
  return progress.unlocked.includes(watch);
}

/** Known watches in collection order, then any others as they came. */
function ordered(ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return [
    ...WATCH_ORDER.filter(id => set.has(id)),
    ...[...set].filter(id => !WATCH_ORDER.some(known => known === id)),
  ];
}

/**
 * Unlocks every watch whose requirement is met, in order, so one score can
 * open a chain (and a save from before a watch existed catches up).
 */
export function withEarnedUnlocks(progress: Progress): Progress {
  const unlocked = new Set([FIRST_WATCH, ...progress.unlocked]);
  for (const watch of WATCH_ORDER) {
    const requirement = requirementFor(watch);
    const met =
      requirement === null ||
      (unlocked.has(requirement.watch) &&
        bestScore(progress, requirement.watch) >= requirement.score &&
        progress.points >= requirement.points);
    if (met) unlocked.add(watch);
  }
  const next = ordered(unlocked);
  const same =
    next.length === progress.unlocked.length &&
    next.every((id, index) => id === progress.unlocked[index]);
  return same ? progress : { ...progress, unlocked: next };
}

export interface ScoreRecord {
  readonly score: number;
  /** The best score including this one. */
  readonly best: number;
  /** Whether this score beat the previous best. */
  readonly isNewBest: boolean;
  /** Watches this score unlocked. */
  readonly unlocked: readonly WatchId[];
  /** The certificate this score earned, if it earned a new one. */
  readonly certificate: CertificateTier | null;
  /** The points with this score added. */
  readonly points: number;
  /** The level they reach, if this score reached it. */
  readonly levelUp: number | null;
}

/** Records a finished round's score against the watch's best. */
export function recordScore(
  progress: Progress,
  watch: WatchId,
  score: number
): { progress: Progress; record: ScoreRecord } {
  if (!Number.isSafeInteger(score) || score < 0) {
    throw new RangeError(`A score is a whole number ≥ 0, got ${String(score)}`);
  }
  const previous = bestScore(progress, watch);
  const isNewBest = score > previous;
  const best = Math.max(score, previous);
  const points = progress.points + score;
  const scored =
    score > 0
      ? {
          ...progress,
          points,
          ...(isNewBest && { best: { ...progress.best, [watch]: score } }),
        }
      : progress;
  const next = withEarnedUnlocks(scored);
  const earned = certificateFor(best);
  const level = levelFor(points).level;
  return {
    progress: next,
    record: {
      score,
      best,
      isNewBest,
      unlocked: WATCH_ORDER.filter(
        id => isUnlocked(next, id) && !isUnlocked(progress, id)
      ),
      certificate: earned === certificateFor(previous) ? null : earned,
      points,
      levelUp: level > levelFor(progress.points).level ? level : null,
    },
  };
}

/**
 * Combines two records of progress, e.g. this tab's and one another tab
 * just saved: the higher best on every watch, every watch unlocked in
 * either and the more points. Nothing earned is ever lost, including
 * watches this version doesn't know. (Points earned on two devices at once
 * count only once: each side has the other's last total, not its rounds.)
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const best: Record<string, number> = {};
  for (const id of ordered([...Object.keys(a.best), ...Object.keys(b.best)])) {
    best[id] = Math.max(a.best[id] ?? 0, b.best[id] ?? 0);
  }
  return {
    best,
    unlocked: ordered([...a.unlocked, ...b.unlocked]),
    points: Math.max(a.points, b.points),
  };
}
