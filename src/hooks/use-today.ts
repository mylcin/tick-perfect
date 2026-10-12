import { useEffect, useState } from 'react';

import { msUntilNextDaily, todaysDaily } from '../state/daily';

/** Past midnight by this much, so the timer never wakes a moment early. */
const MIDNIGHT_MARGIN_MS = 500;

/**
 * Today's Daily number, turning over at local midnight: one timer to the
 * next midnight, not a check every frame. A tab coming back into view
 * checks again, since a sleeping device may hold the timer back.
 */
export function useToday(): number {
  const [today, setToday] = useState(() => todaysDaily(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(
        turn,
        msUntilNextDaily(new Date()) + MIDNIGHT_MARGIN_MS
      );
    };
    const turn = () => {
      clearTimeout(timer);
      setToday(todaysDaily(new Date()));
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') turn();
    };
    // From the day as it is now: midnight may have passed since the render.
    turn();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}
