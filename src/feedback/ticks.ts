import { travelledAt, type Segment } from '../game';

/** The escapement ticks each time the seconds hand passes an hour mark. */
export const TICK_STEP = 30;

/**
 * Which hour-mark interval the seconds hand is in at `time`, counted along
 * its unwrapped travel. The index changes exactly when the hand crosses a
 * mark, in either direction, so a change between frames means a tick.
 */
export function tickIndex(segment: Segment, time: number): number {
  const travelled = travelledAt(segment, time);
  return Math.floor(
    (segment.handAngle + segment.direction * travelled) / TICK_STEP
  );
}
