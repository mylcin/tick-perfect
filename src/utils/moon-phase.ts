/** Days from one new moon to the next, on average. */
export const SYNODIC_MONTH = 29.530588853;

/** A new moon: 6 January 2000, 18:14 UTC. */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const MS_PER_DAY = 86_400_000;

/**
 * The moon's age at `time` as a share of its cycle, in [0, 1): 0 is new,
 * 0.25 the first quarter, 0.5 full, 0.75 the last quarter. The mean cycle
 * is accurate to within a day or so, which is all a watch dial shows.
 */
export function moonPhase(time: number): number {
  const days = (time - NEW_MOON_EPOCH) / MS_PER_DAY;
  const cycles = days / SYNODIC_MONTH;
  const phase = cycles - Math.floor(cycles);
  return phase === 1 ? 0 : phase;
}
