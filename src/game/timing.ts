import { ANGLE_EPSILON, rotate, type Direction } from './angle.js';
import type { HitQuality } from './scoring.js';
import type { GmtHand, SegmentTwist } from './twists/types.js';

// Motion between two hits is linear in time, so every position (and the
// moment the hand leaves the target) is computed from a timestamp. Taps are
// judged at their own timestamp, never at whatever frame was last drawn.
// The one pause in that line is a hacked hand standing still, which the
// clock below leaves out of the sweep's running time.

export interface TimingConfig {
  /**
   * Degrees past the visible target edge that still count as a hit, so a tap
   * that lands on the drawn edge is never judged a miss.
   */
  readonly hitToleranceDegrees: number;
  /**
   * How long after the hand leaves the target the round waits before ending.
   * A tap can reach the page a few milliseconds after it happened; its
   * timestamp still wins if it arrives within this window.
   */
  readonly inputGraceMs: number;
  /**
   * Taps this soon after the press that started the round or landed the last
   * hit are that press again (a bounce or a duplicate event) and are ignored.
   */
  readonly tapDebounceMs: number;
}

export const DEFAULT_TIMING: TimingConfig = {
  hitToleranceDegrees: 2,
  inputGraceMs: 60,
  tapDebounceMs: 50,
};

export const MS_PER_SECOND = 1000;

export interface Target {
  /** Position on its ring, a multiple of a minute mark. */
  readonly mark: number;
  /** Full drawn width in degrees. */
  readonly width: number;
  /** Degrees either side of the centre that count as a hit. */
  readonly hitWindow: number;
  /** Degrees either side of the centre that count as a Perfect. */
  readonly perfectWindow: number;
}

/** One sweep of the seconds hand, from a hit (or the start) to the next. */
export interface Segment {
  /** When the sweep began, in milliseconds on the input clock. */
  readonly startTime: number;
  readonly handAngle: number;
  readonly direction: Direction;
  /** Hand speed in degrees per second. */
  readonly speed: number;
  /** Rotation of the ring carrying the target, at `startTime`. */
  readonly ringAngle: number;
  /** Ring speed in degrees per second; positive is clockwise. */
  readonly ringVelocity: number;
  readonly target: Target;
  /** Degrees the hand must travel, relative to the ring, to reach the centre. */
  readonly approach: number;
  /** Whether this target uses the watch's special rule. */
  readonly special: boolean;
  /** What the special rule adds, beyond a turning ring. */
  readonly twist?: SegmentTwist;
  /** The GMT hand, on watches that have one. */
  readonly gmt?: GmtHand;
}

/** How long a hacked hand stands still before reaching `progress`. */
function heldBefore(segment: Segment, progress: number): number {
  const { twist } = segment;
  return twist?.kind === 'hack' && twist.at < progress ? twist.holdMs : 0;
}

/**
 * Seconds the sweep has run by `time`: the time since it began, less any
 * the hand has stood still for.
 */
function elapsedSeconds(segment: Segment, time: number): number {
  const elapsed = time - segment.startTime;
  const { twist } = segment;
  if (twist?.kind !== 'hack') return elapsed / MS_PER_SECOND;
  const stopsAfter =
    ((segment.approach + twist.at) / closingSpeed(segment)) * MS_PER_SECOND;
  const held = Math.min(Math.max(elapsed - stopsAfter, 0), twist.holdMs);
  return (elapsed - held) / MS_PER_SECOND;
}

/** Degrees the seconds hand has travelled since the sweep began. */
export function travelledAt(segment: Segment, time: number): number {
  return segment.speed * elapsedSeconds(segment, time);
}

/** Whether a hacked hand is standing still at `time`. */
export function isHeldAt(segment: Segment, time: number): boolean {
  const { twist } = segment;
  if (twist?.kind !== 'hack') return false;
  const stopsAfter =
    ((segment.approach + twist.at) / closingSpeed(segment)) * MS_PER_SECOND;
  const elapsed = time - segment.startTime;
  return elapsed >= stopsAfter && elapsed < stopsAfter + twist.holdMs;
}

export function handAngleAt(segment: Segment, time: number): number {
  return rotate(
    segment.handAngle,
    segment.direction * travelledAt(segment, time)
  );
}

export function ringAngleAt(segment: Segment, time: number): number {
  return rotate(
    segment.ringAngle,
    segment.ringVelocity * elapsedSeconds(segment, time)
  );
}

export function targetCenterAt(segment: Segment, time: number): number {
  return rotate(ringAngleAt(segment, time), segment.target.mark);
}

/** How fast the hand gains on the target, in degrees per second. */
export function closingSpeed(segment: Segment): number {
  return segment.speed - segment.direction * segment.ringVelocity;
}

/**
 * How far the hand is past the target centre along its travel, in degrees:
 * negative while approaching, 0 at the centre, positive once past it.
 */
export function progressAt(segment: Segment, time: number): number {
  return (
    closingSpeed(segment) * elapsedSeconds(segment, time) - segment.approach
  );
}

/** When the hand reaches the target centre: the best moment to tap. */
export function centerTime(segment: Segment): number {
  return (
    segment.startTime +
    (segment.approach / closingSpeed(segment)) * MS_PER_SECOND +
    heldBefore(segment, 0)
  );
}

/** When the hand leaves the hit window if nobody taps. */
export function windowCloseTime(segment: Segment): number {
  const { hitWindow } = segment.target;
  const distance = segment.approach + hitWindow;
  return (
    segment.startTime +
    (distance / closingSpeed(segment)) * MS_PER_SECOND +
    heldBefore(segment, hitWindow)
  );
}

type TapJudgement =
  | {
      readonly kind: 'hit';
      readonly quality: HitQuality;
      readonly offset: number;
    }
  | {
      readonly kind: 'miss';
      readonly reason: 'early' | 'late';
      readonly offset: number;
    };

/**
 * Judges a tap at `time`; `offset` is {@link progressAt} that moment. Only
 * the hand and the target count: a twist that changes how the watch looks
 * (a hidden target, a swaying watch) never changes the judgement.
 */
export function judgeTap(segment: Segment, time: number): TapJudgement {
  const offset = progressAt(segment, time);
  const { hitWindow, perfectWindow } = segment.target;
  if (offset < -hitWindow - ANGLE_EPSILON) {
    return { kind: 'miss', reason: 'early', offset };
  }
  if (offset > hitWindow + ANGLE_EPSILON) {
    return { kind: 'miss', reason: 'late', offset };
  }
  const perfect = Math.abs(offset) <= perfectWindow + ANGLE_EPSILON;
  return { kind: 'hit', quality: perfect ? 'perfect' : 'good', offset };
}
