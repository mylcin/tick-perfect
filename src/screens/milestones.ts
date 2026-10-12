import type { GameEvent } from '../game';
import { CERTIFICATES, type CertificateTier } from '../state/certificates';

/**
 * The score in the HUD's corner: the best on the watch, the day's best on a
 * Daily, or a challenge's score to beat.
 */
export interface Standing {
  readonly kind: 'best' | 'today' | 'toBeat';
  readonly score: number;
}

/**
 * A score worth marking the moment a round reaches it: the one in the HUD's
 * corner (the best, the day's best or the score to beat), or a certificate
 * the watch hasn't earned yet.
 */
type Milestone =
  | { readonly kind: 'standing' }
  | { readonly kind: 'certificate'; readonly tier: CertificateTier };

/**
 * What a hit taking the score from `before` to `after` just passed, if
 * anything. Scores only rise within a round, so each is passed once. A
 * standing of 0 is nothing to pass yet, and certificates count only on
 * the collection, against the best: a new one beats a passed best.
 */
export function milestoneOf(
  before: number,
  after: number,
  standing: Standing
): Milestone | null {
  if (standing.kind === 'best') {
    const crossed = CERTIFICATES.filter(
      ({ score }) => score > standing.score && before < score && score <= after
    ).at(-1);
    if (crossed) return { kind: 'certificate', tier: crossed.tier };
  }
  return standing.score > 0 &&
    before <= standing.score &&
    after > standing.score
    ? { kind: 'standing' }
    : null;
}

/** Whether a transition's hit passed a milestone. */
export function passesMilestone(
  events: readonly GameEvent[],
  standing: Standing
): boolean {
  return events.some(
    event =>
      event.type === 'hit' &&
      milestoneOf(event.score - event.points, event.score, standing) !== null
  );
}
