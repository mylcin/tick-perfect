// The power reserve, in place of a streak: each Daily played winds the
// watch by a day, up to a week. A missed day only lets it run down by one,
// as a mechanical watch does; nothing ever resets it.

/** The most days the reserve holds. */
export const RESERVE_DAYS = 7;

export interface PowerReserve {
  /** Days in reserve when it was last wound. */
  readonly days: number;
  /** The Daily number it was last wound on (0: never). */
  readonly woundOn: number;
}

export const UNWOUND: PowerReserve = { days: 0, woundOn: 0 };

/**
 * The reserve on Daily `today`: one day less for every whole day missed
 * since it was wound. Today isn't missed until it is over. A wind in the
 * future (a clock set back) counts as today's.
 */
export function reserveOn(reserve: PowerReserve, today: number): number {
  const missed = Math.max(0, today - reserve.woundOn - 1);
  return Math.max(0, reserve.days - missed);
}

/**
 * Winds the reserve by a day for a Daily played on `day`. Only the first
 * wind of a day counts.
 */
export function windReserve(reserve: PowerReserve, day: number): PowerReserve {
  if (day === reserve.woundOn) return reserve;
  return {
    days: Math.min(RESERVE_DAYS, reserveOn(reserve, day) + 1),
    woundOn: day,
  };
}

/**
 * Combines two saved reserves (another tab's, another device's or a
 * backup's): the fuller reserve on the same day. Otherwise the earlier one
 * is wound on the later one's day as well, since that Daily was played
 * too, and the fuller of the two wins. Another tab's later wind has seen
 * the earlier one, so it is never the emptier; another device's may not
 * have, and must not run this one's reserve down.
 */
export function mergeReserve(a: PowerReserve, b: PowerReserve): PowerReserve {
  if (a.woundOn === b.woundOn) return b.days > a.days ? b : a;
  const [earlier, later] = a.woundOn < b.woundOn ? [a, b] : [b, a];
  const carried = windReserve(earlier, later.woundOn);
  return carried.days > later.days ? carried : later;
}
