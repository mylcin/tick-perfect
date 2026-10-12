import { MINUTE_MARK } from '../angle.js';
import type { MoonTwistRule } from '../rules/types.js';
import {
  closingSpeed,
  MS_PER_SECOND,
  progressAt,
  type Segment,
} from '../timing.js';
import type { MoonHide } from './types.js';

/**
 * Plans when a target hides: `hiddenMs` (drawn from the rule's range)
 * before its hit window opens. It is always shown in full for `readMs`
 * first, wherever the hand stopped, because the range is set from `step`,
 * the marks ahead every player shares. If that leaves it hidden for less
 * than `minHiddenMs`, it doesn't hide at all.
 */
export function planMoon(
  segment: Segment,
  step: number,
  rule: MoonTwistRule,
  roll: number
): MoonHide | null {
  const closing = closingSpeed(segment);
  const degrees = (ms: number) => (closing * ms) / MS_PER_SECOND;
  const { hitWindow } = segment.target;
  const { min, max } = rule.hiddenMs;
  const wanted = hitWindow + degrees(min + roll * (max - min));
  const latest = step * MINUTE_MARK - degrees(rule.readMs) - rule.fadeDegrees;
  const hideAhead = Math.min(wanted, latest);
  if (hideAhead - hitWindow < degrees(rule.minHiddenMs)) return null;
  return { kind: 'moon', hideFrom: -hideAhead, fade: rule.fadeDegrees };
}

/** How visible the target is at `time`: 1 in full, 0 hidden. */
export function targetVisibilityAt(segment: Segment, time: number): number {
  const { twist } = segment;
  if (twist?.kind !== 'moon') return 1;
  const ahead = twist.hideFrom - progressAt(segment, time);
  if (twist.fade <= 0) return ahead > 0 ? 1 : 0;
  return Math.min(Math.max(ahead / twist.fade, 0), 1);
}
