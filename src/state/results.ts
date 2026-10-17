import { WATCH_ORDER, type WatchId } from '../watches/ids';
import { nextCertificate, type CertificateTier } from './certificates';
import { levelFor } from './levels';
import {
  bestScore,
  isUnlocked,
  requirementFor,
  requirementMet,
  type Progress,
} from './progress';

/** The nearest thing a round fell short of, for the results. */
export type Goal =
  | {
      readonly kind: 'unlock';
      readonly watch: WatchId;
      readonly points: number;
    }
  | {
      readonly kind: 'certificate';
      readonly tier: CertificateTier;
      readonly points: number;
    }
  | {
      readonly kind: 'level';
      readonly level: number;
      readonly points: number;
    }
  | { readonly kind: 'best'; readonly points: number };

/**
 * After a round on `watch` scoring `score` (with `progress` already
 * including it): how many more points would have unlocked the next watch,
 * earned the next certificate or beaten the best, or how many more in all
 * reach the next level, whichever is nearest. Null when nothing is left.
 */
export function goalAfter(
  progress: Progress,
  watch: WatchId,
  score: number
): Goal | null {
  const goals: Goal[] = [];
  // The watch the collection opens next, if a score on this one is all it
  // waits for; while it waits for a level too, the level is the goal.
  const next = WATCH_ORDER.find(id => !isUnlocked(progress, id));
  const requirement = next ? requirementFor(next) : null;
  const met = requirement && requirementMet(progress, requirement);
  if (next && requirement?.watch === watch && met?.level && !met.score) {
    goals.push({
      kind: 'unlock',
      watch: next,
      points: requirement.score - score,
    });
  }
  const level = levelFor(progress.points);
  if (level.next !== null) {
    goals.push({
      kind: 'level',
      level: level.level + 1,
      points: level.next - progress.points,
    });
  }
  const best = bestScore(progress, watch);
  const certificate = nextCertificate(best);
  if (certificate) {
    goals.push({
      kind: 'certificate',
      tier: certificate.tier,
      points: certificate.score - score,
    });
  }
  if (score < best) goals.push({ kind: 'best', points: best - score });

  return goals
    .filter(goal => goal.points > 0)
    .reduce<Goal | null>(
      (nearest, goal) =>
        nearest === null || goal.points < nearest.points ? goal : nearest,
      null
    );
}
