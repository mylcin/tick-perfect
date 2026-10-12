import type { Dictionary } from '../i18n';
import { certificateFor } from '../state/certificates';
import {
  bestScore,
  isUnlocked,
  requirementFor,
  requirementMet,
  type Progress,
} from '../state/progress';
import type { SceneFailure } from '../state/session';
import { ENDLESS_WATCH, WATCHES, type WatchId } from '../watches';

/** Why the watch can't be drawn, as the player is told. */
export function sceneFailureText(
  t: Dictionary,
  failure: SceneFailure | null
): string {
  switch (failure) {
    case 'network':
      return t.title.loadFailed;
    case 'stopped':
      return t.title.stopped;
    default:
      return t.title.unsupportedWebgl;
  }
}

/** What a watch is called on screen: Endless goes by its mode's name. */
export function displayName(t: Dictionary, watch: WatchId): string {
  return watch === ENDLESS_WATCH ? t.collection.endless : WATCHES[watch].name;
}

/** One step towards unlocking a watch, and how far along it is. */
interface UnlockStep {
  readonly kind: 'score' | 'level';
  /** "Score 15 on the Diver". */
  readonly text: string;
  /** "Best 12 of 15". */
  readonly progress: string;
  readonly done: boolean;
}

/** The steps that unlock a watch: a score on the one before, and a level. */
export function unlockSteps(
  t: Dictionary,
  watch: WatchId,
  progress: Progress
): UnlockStep[] {
  const requirement = requirementFor(watch);
  if (!requirement) return [];
  const met = requirementMet(progress, requirement);
  return [
    {
      kind: 'score',
      text: t.collection.scoreStep(
        WATCHES[requirement.watch].name,
        requirement.score
      ),
      progress: t.collection.progress(
        bestScore(progress, requirement.watch),
        requirement.score
      ),
      done: met.score,
    },
    {
      kind: 'level',
      text: t.collection.levelStep(requirement.level),
      progress: t.collection.pointsProgress(
        progress.points,
        requirement.points
      ),
      done: met.level,
    },
  ];
}

/**
 * What unlocks a watch, as a sentence: "To unlock: score 15 on the Diver
 * (best 12 of 15); reach level 2 (40 of 150 points)".
 */
export function lockedText(
  t: Dictionary,
  watch: WatchId,
  progress: Progress
): string {
  const steps = unlockSteps(t, watch, progress);
  if (steps.length === 0) return '';
  // A no-break space keeps the progress beside its step, never alone.
  return `${t.collection.toUnlock}: ${steps
    .map(
      step =>
        `${step.text}\u00a0(${step.done ? t.collection.stepDone : step.progress})`
    )
    .join('; ')}`;
}

/**
 * A watch as a screen reader hears it in the collection: its name (Endless
 * first for the Grand Complication, as its card shows), then what it has
 * earned or what unlocks it.
 */
export function watchSummary(
  t: Dictionary,
  watch: WatchId,
  progress: Progress
): string {
  const name =
    watch === ENDLESS_WATCH
      ? `${t.collection.endless}, ${WATCHES[watch].name}`
      : WATCHES[watch].name;
  if (!isUnlocked(progress, watch)) {
    return `${name}, ${t.collection.locked}. ${lockedText(t, watch, progress)}`;
  }
  const best = bestScore(progress, watch);
  const tier = certificateFor(best);
  return `${name}, ${t.collection.best(best)}, ${
    tier ? t.certificates[tier] : t.collection.noCertificate
  }`;
}
