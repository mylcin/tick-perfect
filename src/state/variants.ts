import {
  STANDARD,
  VARIANTS,
  variantOf,
  WATCHES,
  withVariant,
  type WatchId,
  type WatchSpec,
  type WatchVariant,
} from '../watches';
import { CERTIFICATES } from './certificates';
import { bestScore, isUnlocked, type Progress } from './progress';

/**
 * The variant picked for each watch, by watch id. Like bests, it is keyed
 * by plain strings, so a newer version's watches and variants survive.
 */
export type VariantChoices = Readonly<Record<string, string>>;

/** The best score on its watch that earns `variant`; 0 for the standard. */
export function variantScore(variant: WatchVariant): number {
  return CERTIFICATES.find(({ tier }) => tier === variant.earnedBy)?.score ?? 0;
}

/** Whether the player has earned `variant` of `watch`. */
export function isVariantEarned(
  progress: Progress,
  watch: WatchId,
  variant: WatchVariant
): boolean {
  return (
    variant.earnedBy === null ||
    (isUnlocked(progress, watch) &&
      bestScore(progress, watch) >= variantScore(variant))
  );
}

/**
 * The variant `watch` is worn in: the one picked while it is earned, the
 * standard otherwise. The pick itself stays saved either way.
 */
export function shownVariant(
  progress: Progress,
  choices: VariantChoices,
  watch: WatchId
): WatchVariant {
  const picked = variantOf(watch, choices[watch] ?? STANDARD);
  return picked && isVariantEarned(progress, watch, picked)
    ? picked
    : VARIANTS[watch][0];
}

/** `watch` as the player sees it, in the variant it is worn in. */
export function shownSpec(
  progress: Progress,
  choices: VariantChoices,
  watch: WatchId
): WatchSpec {
  return withVariant(WATCHES[watch], shownVariant(progress, choices, watch).id);
}

/** The variants of `watch` that `after` has earned and `before` had not. */
export function newlyEarnedVariants(
  before: Progress,
  after: Progress,
  watch: WatchId
): WatchVariant[] {
  return VARIANTS[watch].filter(
    variant =>
      isVariantEarned(after, watch, variant) &&
      !isVariantEarned(before, watch, variant)
  );
}
