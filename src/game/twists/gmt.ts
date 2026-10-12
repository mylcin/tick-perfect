import {
  ANGLE_EPSILON,
  angularDistance,
  FULL_TURN,
  normalizeAngle,
  rotate,
} from '../angle.js';
import type { GmtHandRule, GmtTwistRule } from '../rules/types.js';
import {
  centerTime,
  closingSpeed,
  MS_PER_SECOND,
  progressAt,
  ringAngleAt,
  targetCenterAt,
  type Segment,
} from '../timing.js';
import type { GmtGate, GmtHand } from './types.js';

/** Where `hand` points at `time` during `segment`. */
export function handAt(hand: GmtHand, segment: Segment, time: number): number {
  return rotate(
    hand.angle,
    hand.rate * (progressAt(segment, time) - hand.cross)
  );
}

/** Where the GMT hand points at `time`, or null on a watch without one. */
export function gmtAngleAt(segment: Segment, time: number): number | null {
  return segment.gmt ? handAt(segment.gmt, segment, time) : null;
}

/** Whether the GMT hand touches the target at `time`. */
export function isBlockedAt(segment: Segment, time: number): boolean {
  const hand = segment.gmt;
  if (!hand) return false;
  const distance = angularDistance(
    handAt(hand, segment, time),
    targetCenterAt(segment, time)
  );
  return distance <= hand.reach + ANGLE_EPSILON;
}

function reachOf(segment: Segment, hand: GmtHandRule): number {
  return (segment.target.width + hand.width) / 2;
}

/**
 * A gate: the GMT hand sweeps across the target as the seconds hand comes
 * in, covering one flank of the hit window.
 *
 * - wait: it sits on the target and leaves just before the centre.
 * - beat: it lands on the target just after the centre.
 *
 * Either way the Perfect zone and `guardDegrees` beyond it stay clear, so
 * a well-timed tap always counts, and at least `minBlockDegrees` of the
 * window the target would have had without the gate is covered, as is all
 * the gate's `windowScale` added to it, so the gate is real and its covered
 * part wide enough to see. Everything is set in progress relative to the
 * target, never from where the hand stopped.
 */
export function gmtGate(
  segment: Segment,
  rule: GmtTwistRule,
  sideRoll: number,
  depthRoll: number
): { gate: GmtGate; hand: GmtHand } {
  const { hitWindow, perfectWindow } = segment.target;
  const reach = reachOf(segment, rule.hand);
  const minClear = perfectWindow + rule.guardDegrees;
  const base = hitWindow / (rule.windowScale ?? 1);
  const maxClear = Math.max(minClear, base - rule.minBlockDegrees);
  const clear = minClear + depthRoll * (maxClear - minClear);
  // Progress the hand needs to turn from the target edge to its centre.
  const sweep = reach / rule.hand.rate;
  const side = sideRoll < 0.5 ? 'wait' : 'beat';
  return {
    gate: { kind: 'gmt', side, clear },
    hand: {
      angle: targetCenterAt(segment, centerTime(segment)),
      rate: rule.hand.rate,
      cross: side === 'wait' ? -clear - sweep : clear + sweep,
      reach,
    },
  };
}

/**
 * Where the GMT hand covers the target within the hit window, in progress:
 * one flank, from the window's edge to the open part round the centre.
 * Null on a sweep without a gate. Inside the window it is exactly where
 * {@link isBlockedAt} holds, since the hand stays on the target far longer
 * than the window lasts. The ring never turns on a gate, so it is also a
 * fixed part of the target: `direction × progress` from its mark.
 */
export function gateSpan(
  segment: Segment
): { readonly from: number; readonly to: number } | null {
  const { twist } = segment;
  if (twist?.kind !== 'gmt') return null;
  const { hitWindow } = segment.target;
  return twist.side === 'wait'
    ? { from: -hitWindow, to: -twist.clear }
    : { from: twist.clear, to: hitWindow };
}

/** The ring angle when the hand is `progress` degrees past the target. */
function ringAtProgress(segment: Segment, progress: number): number {
  const seconds = (segment.approach + progress) / closingSpeed(segment);
  return ringAngleAt(segment, segment.startTime + seconds * MS_PER_SECOND);
}

/** How far `angle` lies from an arc of the dial (0 when it is on it). */
function distanceToArc(angle: number, from: number, sweep: number): number {
  const along =
    sweep >= 0 ? normalizeAngle(angle - from) : normalizeAngle(from - angle);
  if (along <= Math.abs(sweep)) return 0;
  return Math.min(
    angularDistance(angle, from),
    angularDistance(angle, rotate(from, sweep))
  );
}

/**
 * A parked GMT hand for a sweep without a gate. It stays where it was
 * unless it would touch one of the marks to be hit (`marks`, each with the
 * progress at which the seconds hand reaches it) at any point of the
 * sweep, from its start until that mark's window closes; a turning ring
 * carries a mark along an arc. Then it moves to the far side of the dial.
 */
export function parkedGmt(
  segment: Segment,
  rule: GmtTwistRule,
  angle: number,
  marks: readonly { readonly mark: number; readonly progress: number }[]
): GmtHand {
  const reach = reachOf(segment, rule.hand);
  const keepOut = reach + rule.hand.clearance;
  const arcs = marks.map(({ mark, progress }) => {
    const from = rotate(ringAtProgress(segment, -segment.approach), mark);
    const travel = segment.approach + progress + segment.target.hitWindow;
    const sweep = (segment.ringVelocity * travel) / closingSpeed(segment);
    return { from, sweep };
  });
  const touches = arcs.some(
    ({ from, sweep }) => distanceToArc(angle, from, sweep) <= keepOut
  );
  const [first = { from: angle, sweep: 0 }] = arcs;
  return {
    angle: touches
      ? rotate(first.from, first.sweep / 2 + FULL_TURN / 2)
      : angle,
    rate: 0,
    cross: 0,
    reach,
  };
}
