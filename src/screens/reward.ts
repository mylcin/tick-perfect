import type { EngravingId } from '../state/engravings';
import type { RoundOutcome } from './game-over-dialog';

/** How the results ring in what a round earned. */
interface Reward {
  readonly sound: 'unlock' | 'certify' | 'best';
  /** Anything but a new best is felt as well as heard. */
  readonly vibrate: boolean;
}

/**
 * The biggest thing a round earned: a new watch, else an engraving, a
 * certificate, a level or a variant, else a new best. Rounds outside the
 * collection earn only engravings.
 */
export function rewardOf(
  outcome: RoundOutcome,
  engraved: readonly EngravingId[] = []
): Reward | null {
  const certify = { sound: 'certify', vibrate: true } as const;
  if (outcome.kind !== 'collection') {
    return engraved.length > 0 ? certify : null;
  }
  if (outcome.unlocked.length > 0) return { sound: 'unlock', vibrate: true };
  if (
    engraved.length > 0 ||
    outcome.certificate ||
    outcome.levelUp !== null ||
    outcome.variants.length > 0
  ) {
    return certify;
  }
  return outcome.isNewBest ? { sound: 'best', vibrate: false } : null;
}
