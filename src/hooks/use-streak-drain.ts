import { useEffect, useState } from 'react';

import {
  DRAIN_MS,
  streakMeter,
  type StreakMeter,
} from '../screens/streak-meter';
import type { GameController } from '../state/game-controller';
import { trailingPerfects } from '../state/tips';

/**
 * The streak meter as it stood when a plain hit ended the multiplier, for
 * its lit diamonds to drain before the meter starts again; null otherwise.
 * With animations off the meter simply starts again.
 */
export function useStreakDrain(
  controller: GameController,
  still: boolean
): StreakMeter | null {
  const [drain, setDrain] = useState<StreakMeter | null>(null);

  useEffect(
    () =>
      controller.subscribe((events, { qualities }) => {
        if (events[0]?.type === 'started') setDrain(null);
        const ended = events.some(
          event => event.type === 'multiplier' && event.factor === 1
        );
        if (!ended || still) return;
        // The plain hit is the last of `qualities`; the run came before it.
        const run = trailingPerfects(qualities.slice(0, -1));
        setDrain(streakMeter(run, controller.rules));
      }),
    [controller, still]
  );

  useEffect(() => {
    if (!drain) return;
    const timer = setTimeout(() => {
      setDrain(null);
    }, DRAIN_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [drain]);

  return drain;
}
