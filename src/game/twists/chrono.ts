import { ANGLE_EPSILON, FULL_TURN, MINUTE_MARK } from '../angle.js';
import type { ChronoTwistRule } from '../rules/types.js';
import { snapToMark } from '../spawn.js';
import {
  closingSpeed,
  handAngleAt,
  MS_PER_SECOND,
  ringAngleAt,
  type Segment,
} from '../timing.js';
import type { ChronoStart } from './types.js';

/**
 * Plans a chronograph pair on a freshly placed target: the stop mark lies a
 * drawn number of marks past the start mark, along the hand's travel.
 *
 * - A late start tap still leaves `minLeadMs` before the stop window opens.
 * - The stop mark never sits between the hand and the start mark, so the
 *   hand never sweeps over it on the way in.
 *
 * The range depends on `step` (marks ahead, the same for every player)
 * rather than the exact approach, so the n-th pair is the same for all.
 * Returns null when no span fits, and the target stays a plain one.
 */
export function planChrono(
  segment: Segment,
  step: number,
  rule: ChronoTwistRule,
  roll: number
): ChronoStart | null {
  const { hitWindow, mark } = segment.target;
  const lead = (closingSpeed(segment) * rule.minLeadMs) / MS_PER_SECOND;
  const minSpan = 2 * hitWindow + lead;
  // The approach is under (step + 1) marks; a mark of margin stays free.
  const room = FULL_TURN - MINUTE_MARK - (step + 1) * MINUTE_MARK - hitWindow;
  const maxSpan = Math.min(rule.maxSpanDegrees, room);
  const minMarks = Math.ceil(minSpan / MINUTE_MARK - ANGLE_EPSILON);
  const maxMarks = Math.floor(maxSpan / MINUTE_MARK + ANGLE_EPSILON);
  if (minMarks > maxMarks) return null;

  const marks = minMarks + Math.floor(roll * (maxMarks - minMarks + 1));
  const span = marks * MINUTE_MARK;
  return {
    kind: 'chrono',
    leg: 'start',
    stopMark: snapToMark(mark + segment.direction * span),
    span,
  };
}

/**
 * The stop leg of a pair, from the start tap at `time` that landed `offset`
 * degrees past the start mark. The hand keeps its direction and speed, and
 * no new target is drawn: the stop mark was planned with the start.
 */
export function chronoStopLeg(
  segment: Segment,
  pair: ChronoStart,
  time: number,
  offset: number
): Segment {
  return {
    startTime: time,
    handAngle: handAngleAt(segment, time),
    direction: segment.direction,
    speed: segment.speed,
    ringAngle: ringAngleAt(segment, time),
    ringVelocity: segment.ringVelocity,
    target: { ...segment.target, mark: pair.stopMark },
    approach: pair.span - offset,
    special: true,
    twist: { kind: 'chrono', leg: 'stop', startMark: segment.target.mark },
    ...(segment.gmt && { gmt: segment.gmt }),
  };
}
