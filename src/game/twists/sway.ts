import { MINUTE_MARK } from '../angle.js';
import type { SwayTwistRule } from '../rules/types.js';
import {
  closingSpeed,
  MS_PER_SECOND,
  progressAt,
  type Segment,
} from '../timing.js';
import type { Sway } from './types.js';

const lerp = (range: { min: number; max: number }, roll: number) =>
  range.min + roll * (range.max - range.min);

/**
 * Plans a sway on a freshly placed target: it lasts a drawn `durationMs`
 * and puts the target centre a drawn share of the way through it, so the
 * watch is still rocking as the hand arrives. `tiltRoll` picks both the way
 * it turns first (below a half one way, above it the other) and how far.
 *
 * It begins no sooner than `leadMs` into the sweep. That bound is set from
 * `step`, the marks ahead every player shares, so the n-th sway is the same
 * for all; where it would start too soon, it is shortened to fit.
 */
export function planSway(
  segment: Segment,
  step: number,
  rule: SwayTwistRule,
  durationRoll: number,
  tiltRoll: number,
  centreRoll: number
): Sway {
  const closing = closingSpeed(segment);
  const degrees = (ms: number) => (closing * ms) / MS_PER_SECOND;
  const share = lerp(rule.centre, centreRoll);
  // Degrees of travel before the centre that it may use.
  const room = step * MINUTE_MARK - degrees(rule.leadMs);
  const length = Math.min(
    degrees(lerp(rule.durationMs, durationRoll)),
    room / share
  );
  const first = tiltRoll < 0.5 ? -1 : 1;
  const tilt = first * lerp(rule.tilt, (tiltRoll * 2) % 1);
  return {
    kind: 'sway',
    from: -share * length,
    length,
    tilt,
    swings: rule.swings,
  };
}

/** The sweep's sway and how far through it the watch is, while it rocks. */
function swayingAt(
  segment: Segment,
  time: number
): readonly [Sway, number] | null {
  const { twist } = segment;
  if (twist?.kind !== 'sway') return null;
  const share = (progressAt(segment, time) - twist.from) / twist.length;
  return share > 0 && share < 1 ? [twist, share] : null;
}

/** Whether the watch is rocking at `time`. */
export function isSwayingAt(segment: Segment, time: number): boolean {
  return swayingAt(segment, time) !== null;
}

/**
 * How far the whole watch is turned at `time`, in degrees: 0 outside a
 * sway. It swings under an envelope that rises and falls, so it starts and
 * ends at rest without a jerk, and it never turns further than the tilt. It
 * is only what the player sees: a tap is judged as if it held still.
 */
export function swayAt(segment: Segment, time: number): number {
  const swaying = swayingAt(segment, time);
  if (!swaying) return 0;
  const [{ tilt, swings }, share] = swaying;
  return (
    tilt * Math.sin(Math.PI * share) * Math.sin(2 * Math.PI * swings * share)
  );
}
