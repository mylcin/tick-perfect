// Angles are degrees measured clockwise from 12 o'clock, as on a watch dial.

/** Degrees in one full turn of the dial. */
export const FULL_TURN = 360;

const HALF_TURN = FULL_TURN / 2;

/** Degrees between two minute marks. */
export const MINUTE_MARK = FULL_TURN / 60;

/**
 * Slack for floating-point noise at arc edges, so an angle that lands exactly
 * on a boundary after arithmetic (e.g. 359 + 10) still counts as inside.
 */
export const ANGLE_EPSILON = 1e-9;

/** Travel direction seen from the front of the watch. */
export type Direction = 1 | -1;

export const CLOCKWISE: Direction = 1;
export const COUNTERCLOCKWISE: Direction = -1;

export function reverse(direction: Direction): Direction {
  return direction === CLOCKWISE ? COUNTERCLOCKWISE : CLOCKWISE;
}

/** Wraps any finite angle into [0, 360). */
export function normalizeAngle(angle: number): number {
  const wrapped = angle % FULL_TURN;
  const positive = wrapped < 0 ? wrapped + FULL_TURN : wrapped;
  // A tiny negative input rounds up to exactly 360; `+ 0` turns -0 into 0.
  return positive === FULL_TURN ? 0 : positive + 0;
}

/** Rotates `angle` by `delta` degrees (positive is clockwise). */
export function rotate(angle: number, delta: number): number {
  return normalizeAngle(angle + delta);
}

/**
 * The shortest signed rotation from `from` to `to`, in (-180, 180].
 * Positive means clockwise.
 */
export function signedDelta(from: number, to: number): number {
  const delta = normalizeAngle(to - from);
  return delta > HALF_TURN ? delta - FULL_TURN : delta;
}

/** The shortest unsigned distance between two angles, in [0, 180]. */
export function angularDistance(a: number, b: number): number {
  return Math.abs(signedDelta(a, b));
}

/**
 * How far `to` lies ahead of `from` when travelling in `direction`, in
 * [0, 360). Unlike {@link signedDelta} this never takes the short way round.
 */
export function forwardDistance(
  from: number,
  to: number,
  direction: Direction
): number {
  return normalizeAngle((to - from) * direction);
}

/** A stretch of the dial: `width` degrees centred on `center`. */
interface Arc {
  readonly center: number;
  /** Total width in degrees, in (0, 360]. */
  readonly width: number;
}

/** Whether `angle` lies on the arc, edges included. Works across 0°. */
export function arcContains(arc: Arc, angle: number): boolean {
  if (arc.width >= FULL_TURN) return true;
  return angularDistance(arc.center, angle) <= arc.width / 2 + ANGLE_EPSILON;
}

/**
 * The arc's edges, read clockwise from `start` to `end`. When the arc crosses
 * 12 o'clock, `start` is greater than `end` (e.g. 349 → 9).
 */
export function arcBounds(arc: Arc): { start: number; end: number } {
  const half = arc.width / 2;
  return {
    start: normalizeAngle(arc.center - half),
    end: normalizeAngle(arc.center + half),
  };
}
