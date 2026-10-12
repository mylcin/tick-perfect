import { useEffect, useState } from 'react';

import { passesMilestone, type Standing } from '../screens/milestones';
import type { GameController } from '../state/game-controller';

/** How long the corner's score stays lit after a milestone. */
const LIT_MS = 1000;

/**
 * Whether the score in the corner is lit: for a moment after a hit passes
 * it, or a certificate's score. (The sound and the nudge come with the
 * hit's own, see useGameFeedback.)
 */
export function useMilestoneLit(
  controller: GameController,
  standing: Standing
): boolean {
  // A fresh object per milestone, so a second one lights it for longer.
  const [lit, setLit] = useState<object | null>(null);
  const { kind, score } = standing;

  useEffect(
    () =>
      controller.subscribe(events => {
        if (events[0]?.type === 'started') setLit(null);
        if (passesMilestone(events, { kind, score })) setLit({});
      }),
    [controller, kind, score]
  );

  useEffect(() => {
    if (!lit) return;
    const timer = setTimeout(() => {
      setLit(null);
    }, LIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [lit]);

  return lit !== null;
}
