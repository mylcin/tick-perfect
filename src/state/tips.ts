import type { GameEvent, HitQuality, ScoringConfig } from '../game';

// One-time moments: a tip on the scoring the first time play shows each
// rule, and the few things the game asks or suggests only once. They are
// remembered on this device alone and never follow the player to another,
// where a tip is as new as the device.

export type TipId =
  /** The first Perfect: what the bright core is worth. */
  | 'perfect'
  /** A Perfect with a multiplier still ahead: how a streak earns one. */
  | 'streak'
  /** The multiplier switching on: how long it lasts. */
  | 'multiplier'
  /** A plain hit ending a streak of Perfects. */
  | 'streakBroken'
  /** On iOS Safari, a browser tab: Add to Home Screen keeps the save. */
  | 'homeScreen'
  /** The browser was asked to keep this site's storage. */
  | 'persist';

/** The tips play itself brings up, most important first. */
const ROUND_TIPS = ['multiplier', 'perfect', 'streak', 'streakBroken'] as const;

export type RoundTip = (typeof ROUND_TIPS)[number];

/** Tips that only make sense once another has been read. */
const AFTER: Partial<Record<TipId, TipId>> = {
  streak: 'perfect',
  streakBroken: 'streak',
};

/**
 * What a tip id looks like. Ones this version doesn't know are kept, as
 * watch ids are, so a newer version's tips aren't shown again after this
 * one writes the save back.
 */
const TIP_ID = /^[a-z][A-Za-z0-9]{0,31}$/;
/** More than any version will ever have: a bound on a hand-edited save. */
const MAX_TIPS = 32;

/** The tips in saved data: well-formed ids, each once. */
export function restoreTips(saved: unknown): readonly string[] {
  if (!Array.isArray(saved)) return [];
  const ids = saved.filter(
    (id): id is string => typeof id === 'string' && TIP_ID.test(id)
  );
  return [...new Set(ids)].slice(0, MAX_TIPS);
}

/** Every tip seen in either: one tab showing a tip shows it for all. */
export function mergeTips(
  a: readonly string[],
  b: readonly string[]
): readonly string[] {
  return b.every(id => a.includes(id))
    ? a
    : restoreTips([...a, ...b.filter(id => !a.includes(id))]);
}

/** Perfects in a row at the end of a round's hits. */
export function trailingPerfects(qualities: readonly HitQuality[]): number {
  let count = 0;
  while (qualities[qualities.length - 1 - count] === 'perfect') count++;
  return count;
}

/**
 * The tip one transition of play calls for, if it is one not yet `seen`:
 * the first multiplier switching on, a Perfect, a Perfect on the way to the
 * first multiplier, or a plain hit ending a streak. `streakBefore` is the
 * streak the transition started from. The tips name the first multiplier,
 * so they wait for it: one put off past it comes up on a later run.
 */
export function tipFor(
  events: readonly GameEvent[],
  streakBefore: number,
  seen: readonly string[],
  scoring: ScoringConfig
): RoundTip | null {
  const [first] = scoring.multipliers;
  const called = new Set<RoundTip>();
  for (const event of events) {
    if (event.type === 'multiplier' && event.factor === first.factor) {
      called.add('multiplier');
    }
    if (event.type !== 'hit') continue;
    if (event.quality === 'perfect') {
      called.add('perfect');
      if (event.streak < first.streak) called.add('streak');
    } else if (streakBefore > 0) {
      called.add('streakBroken');
    }
  }
  return (
    ROUND_TIPS.find(tip => {
      const after = AFTER[tip];
      return (
        called.has(tip) &&
        !seen.includes(tip) &&
        (after === undefined || seen.includes(after))
      );
    }) ?? null
  );
}
