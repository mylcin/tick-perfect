import { MINUTE_MARK } from '../angle.js';
import type { CountdownTwistRule } from '../rules/types.js';
import {
  centerTime,
  closingSpeed,
  MS_PER_SECOND,
  type Segment,
} from '../timing.js';
import type { Countdown } from './types.js';

/**
 * Plans a countdown: `beats` beats a drawn `beatMs` apart, the last on the
 * target centre, after the sweep has run for `readMs`. That bound is set
 * from `step`, the marks ahead every player shares; where the beats can't
 * keep to the rule's quickest pace, there is no countdown.
 */
export function planCountdown(
  segment: Segment,
  step: number,
  rule: CountdownTwistRule,
  roll: number
): Countdown | null {
  const { min, max } = rule.beatMs;
  const room =
    ((step * MINUTE_MARK) / closingSpeed(segment)) * MS_PER_SECOND -
    rule.readMs;
  const beatMs = Math.round(
    Math.min(min + roll * (max - min), room / rule.beats)
  );
  if (beatMs < min) return null;
  return { kind: 'countdown', beats: rule.beats, beatMs };
}

/** Where a countdown stands. */
export interface CountdownState {
  /** What the display reads: the beats to go, 0 once on the centre. */
  readonly count: number;
  /** Milliseconds since that beat. */
  readonly sinceBeat: number;
}

/**
 * The countdown at `time`: from its first beat on, the beats still to go
 * and how long since the last; null before it starts, or on a sweep
 * without one.
 */
export function countdownAt(
  segment: Segment,
  time: number
): CountdownState | null {
  const { twist } = segment;
  if (twist?.kind !== 'countdown') return null;
  const remaining = centerTime(segment) - time;
  if (remaining > twist.beats * twist.beatMs) return null;
  const count = Math.max(0, Math.ceil(remaining / twist.beatMs));
  return { count, sinceBeat: count * twist.beatMs - remaining };
}
