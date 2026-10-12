import { MINUTE_MARK } from '../angle.js';
import type { CloudTwistRule } from '../rules/types.js';
import { closingSpeed, MS_PER_SECOND, type Segment } from '../timing.js';
import type { CloudCover } from './types.js';

/**
 * Plans where the cloud lies: from `cloudMs` (drawn from the rule's range)
 * before the target centre. The hand always runs in clear air for
 * `readMs` first, wherever the last hit left it, because the range is set
 * from `step`, the marks ahead every player shares. If that leaves less
 * than `minCloudMs` of cloud, none comes.
 */
export function planCloud(
  segment: Segment,
  step: number,
  rule: CloudTwistRule,
  roll: number
): CloudCover | null {
  const closing = closingSpeed(segment);
  const degrees = (ms: number) => (closing * ms) / MS_PER_SECOND;
  const { min, max } = rule.cloudMs;
  const wanted = degrees(min + roll * (max - min));
  const latest = step * MINUTE_MARK - degrees(rule.readMs) - rule.fadeDegrees;
  const ahead = Math.min(wanted, latest);
  if (ahead < degrees(rule.minCloudMs)) return null;
  return { kind: 'cloud', from: -ahead, fade: rule.fadeDegrees };
}
