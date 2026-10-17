import type { GameOverState } from './state.js';
import { closingSpeed, MS_PER_SECOND } from './timing.js';

/** How far outside the hit window a tap landed. */
export interface NearMiss {
  readonly side: 'early' | 'late';
  /** Degrees between the tap and the nearest edge of the window. */
  readonly degrees: number;
  /** The same, in milliseconds of the hand's travel. */
  readonly ms: number;
}

/**
 * How close an early or late tap came to counting. A hand that ran past,
 * or a tap under the GMT hand, has no such distance: null.
 */
export function nearMiss(state: GameOverState): NearMiss | null {
  const { miss, round } = state;
  if (miss?.reason !== 'early' && miss?.reason !== 'late') return null;
  const { segment } = round;
  const { hitWindow } = segment.target;
  const degrees = Math.max(
    0,
    miss.reason === 'early' ? -hitWindow - miss.offset : miss.offset - hitWindow
  );
  return {
    side: miss.reason,
    degrees,
    ms: (degrees / closingSpeed(segment)) * MS_PER_SECOND,
  };
}
