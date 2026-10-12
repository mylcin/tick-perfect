import { MINUTE_MARK } from '../angle.js';
import type { HackTwistRule } from '../rules/types.js';
import { closingSpeed, MS_PER_SECOND, type Segment } from '../timing.js';
import type { Hack } from './types.js';

const lerp = (range: { min: number; max: number }, roll: number) =>
  range.min + roll * (range.max - range.min);

/**
 * Plans where a hacked hand stops: a drawn `leadMs` of travel short of the
 * hit window, for a drawn `holdMs`. It always runs for `runMs` first,
 * wherever the last hit left it, because that bound is set from `step`, the
 * marks ahead every player shares. Where there is no room for even the
 * shortest lead, it runs straight through.
 */
export function planHack(
  segment: Segment,
  step: number,
  rule: HackTwistRule,
  holdRoll: number,
  leadRoll: number
): Hack | null {
  const closing = closingSpeed(segment);
  const degrees = (ms: number) => (closing * ms) / MS_PER_SECOND;
  const { hitWindow } = segment.target;
  const wanted = hitWindow + degrees(lerp(rule.leadMs, leadRoll));
  const latest = step * MINUTE_MARK - degrees(rule.runMs);
  const ahead = Math.min(wanted, latest);
  if (ahead < hitWindow + degrees(rule.leadMs.min)) return null;
  return {
    kind: 'hack',
    at: -ahead,
    holdMs: Math.round(lerp(rule.holdMs, holdRoll)),
  };
}
