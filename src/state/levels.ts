// The watchmaker's level. Every collection round adds its score to the
// player's points, good round or bad, and points reach levels; each watch
// after the first needs a level as well as a score on the watch before it,
// so the collection opens with time spent at the bench, not one lucky run.

/** The points that reach each level, from level 1. */
export const LEVELS: readonly [number, ...number[]] = [
  0, 150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000,
];

interface Level {
  /** From 1. */
  readonly level: number;
  /** The points that reached it. */
  readonly from: number;
  /** The points that reach the next level; null at the top. */
  readonly next: number | null;
}

/** The level `points` have reached. */
export function levelFor(points: number): Level {
  let level = 1;
  while (level < LEVELS.length && points >= (LEVELS[level] ?? Infinity)) {
    level += 1;
  }
  return {
    level,
    from: LEVELS[level - 1] ?? 0,
    next: LEVELS[level] ?? null,
  };
}

/** The points that reach `level`. */
export function pointsFor(level: number): number {
  const points = LEVELS[level - 1];
  if (points === undefined) {
    throw new RangeError(`There is no level ${String(level)}`);
  }
  return points;
}
