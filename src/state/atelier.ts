import {
  VARIANTS,
  WATCH_ORDER,
  type VariantId,
  type WatchId,
} from '../watches';
import { CERTIFICATES, type CertificateTier } from './certificates';
import {
  COLLECTION_ENGRAVINGS,
  engravingKey,
  ROUND_ENGRAVINGS,
  type Engravings,
} from './engravings';
import { bestScore, isUnlocked, type Progress } from './progress';
import { isVariantEarned } from './variants';

// The atelier's ledger: what there is to master on each watch, and how much
// of the collection is done. Everything here is derived from what is saved
// already; nothing new is kept.

/** A certificate on a watch: the score it takes, and whether it is held. */
export interface CertificateGoal {
  readonly tier: CertificateTier;
  readonly score: number;
  readonly done: boolean;
}

/** A variant of a watch, the certificate that earns it, and if it has. */
export interface VariantGoal {
  readonly id: VariantId;
  readonly tier: CertificateTier;
  readonly done: boolean;
}

/** An achievement engraved on this watch alone. */
export interface EngravingGoal {
  readonly id: (typeof ROUND_ENGRAVINGS)[number];
  readonly done: boolean;
}

/** Everything to master on one watch. */
export interface Mastery {
  readonly best: number;
  readonly certificates: readonly CertificateGoal[];
  readonly variants: readonly VariantGoal[];
  readonly engravings: readonly EngravingGoal[];
  /** Goals met, of all of the above. */
  readonly done: number;
  readonly of: number;
}

/** What `watch` has to master, and what of it is done. */
export function masteryOf(
  watch: WatchId,
  progress: Progress,
  engravings: Engravings
): Mastery {
  const best = bestScore(progress, watch);
  const certificates = CERTIFICATES.map(({ tier, score }) => ({
    tier,
    score,
    done: best >= score,
  }));
  const variants = VARIANTS[watch].flatMap(variant =>
    variant.earnedBy === null
      ? []
      : [
          {
            id: variant.id,
            tier: variant.earnedBy,
            done: isVariantEarned(progress, watch, variant),
          },
        ]
  );
  const engraved = ROUND_ENGRAVINGS.map(id => ({
    id,
    done: engravingKey(id, watch) in engravings,
  }));
  const goals = [...certificates, ...variants, ...engraved];
  return {
    best,
    certificates,
    variants,
    engravings: engraved,
    done: goals.filter(goal => goal.done).length,
    of: goals.length,
  };
}

/** A count of something done, out of all there is. */
export interface Tally {
  readonly done: number;
  readonly of: number;
}

/** How much of the whole collection is done. */
export interface CollectionSummary {
  readonly watches: Tally;
  readonly certificates: Tally;
  readonly variants: Tally;
  /** Every engraving: two on each watch, three on them all. */
  readonly achievements: Tally;
  /** All of it together, from 0 to 1. */
  readonly share: number;
}

export function collectionSummary(
  progress: Progress,
  engravings: Engravings
): CollectionSummary {
  const tally = (counts: readonly Tally[]): Tally => ({
    done: counts.reduce((sum, count) => sum + count.done, 0),
    of: counts.reduce((sum, count) => sum + count.of, 0),
  });
  const watches = tally(
    WATCH_ORDER.map(watch => ({
      done: isUnlocked(progress, watch) ? 1 : 0,
      of: 1,
    }))
  );
  const mastery = WATCH_ORDER.map(watch =>
    masteryOf(watch, progress, engravings)
  );
  const certificates = tally(
    mastery.map(({ certificates: goals }) => ({
      done: goals.filter(goal => goal.done).length,
      of: goals.length,
    }))
  );
  const variants = tally(
    mastery.map(({ variants: goals }) => ({
      done: goals.filter(goal => goal.done).length,
      of: goals.length,
    }))
  );
  const achievements = tally([
    ...mastery.map(({ engravings: goals }) => ({
      done: goals.filter(goal => goal.done).length,
      of: goals.length,
    })),
    {
      done: COLLECTION_ENGRAVINGS.filter(id => id in engravings).length,
      of: COLLECTION_ENGRAVINGS.length,
    },
  ]);
  const all = tally([watches, certificates, variants, achievements]);
  return {
    watches,
    certificates,
    variants,
    achievements,
    share: all.done / all.of,
  };
}
