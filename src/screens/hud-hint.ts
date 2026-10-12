import type { ScoringConfig, Segment } from '../game';
import type { Dictionary, TwistHint } from '../i18n';
import type { RoundTip } from '../state/tips';

// What the line under the watch can say during a round, besides the first
// sweep's "tap" hint: a twist's hint while the watch is still being learnt,
// or a one-time tip on the scoring.

/** Which hint the sweep's twist calls for, if any. */
export function twistHintFor(segment: Segment): TwistHint | null {
  switch (segment.twist?.kind) {
    case 'chrono':
      return 'chrono';
    case 'gmt':
      return segment.twist.side === 'wait' ? 'gmtWait' : 'gmtBeat';
    case 'moon':
      return 'moon';
    case 'sway':
      return 'sway';
    case 'hack':
      return 'hack';
    case 'cloud':
      return 'cloud';
    case 'countdown':
      return 'countdown';
    case undefined:
      // The ring turning has no twist of its own: it is the sweep's motion.
      return segment.ringVelocity === 0 ? null : 'turn';
  }
}

/** A tip's words, with the scoring's own numbers. */
export function tipText(
  t: Dictionary,
  tip: RoundTip,
  scoring: ScoringConfig
): string {
  const [first] = scoring.multipliers;
  switch (tip) {
    case 'perfect':
      return t.tips.perfect(scoring.perfectPoints);
    case 'streak':
      return t.tips.streak(first.streak, first.factor);
    case 'multiplier':
      return t.tips.multiplier(first.factor);
    case 'streakBroken':
      return t.tips.streakBroken;
  }
}
