import { FIRST_SERIES, type WatchId } from '../watches/ids';
import { CERTIFICATES } from './certificates';
import { bestScore, type Progress } from './progress';
import { RESERVE_DAYS, type PowerReserve } from './reserve';
import { roundStats, type TimingRecords } from './timegrapher';

// Horological achievements, engraved on the caseback rather than shown as a
// wall of badges. Each is named after a real idea of chronometry. Two are
// earned in a round and engraved on the watch it was played on; three are
// earned across the collection and engraved on every caseback.

export type EngravingId =
  | 'isochronism'
  | 'beatError'
  | 'positionalTest'
  | 'powerReserve'
  | 'escapement';

/** Earned in one round, on the watch it was played on. */
export const ROUND_ENGRAVINGS = ['isochronism', 'beatError'] as const;
/** Earned across the collection, on every caseback. */
export const COLLECTION_ENGRAVINGS = [
  'positionalTest',
  'powerReserve',
  'escapement',
] as const;
/** In the order a caseback lists them. */
export const ENGRAVINGS: readonly EngravingId[] = [
  ...ROUND_ENGRAVINGS,
  ...COLLECTION_ENGRAVINGS,
];

/** What earns each one. */
const ENGRAVING_RULES = {
  /** A steady rate: a round's spread under this, over at least `hits` taps. */
  isochronism: { hits: 50, spreadMs: 15 },
  /** Perfects in a row in one round. */
  beatError: { streak: 10 },
  /** The Observatory certificate on every watch of the first series. */
  positionalTest: {
    score: CERTIFICATES.find(({ tier }) => tier === 'observatory')?.score ?? 75,
  },
  /** The power reserve fully wound. */
  powerReserve: { days: RESERVE_DAYS },
  /** Perfects in all, on every watch and in every mode. */
  escapement: { perfects: 1000 },
} as const;

/**
 * What has been engraved, by key: an engraving's id, and for one earned in
 * a round the watch too (`isochronism:diver`). Each holds the Daily number
 * of the day it was earned. Keys this version doesn't know are kept, as
 * watch ids are.
 */
export type Engravings = Readonly<Record<string, number>>;

export const NO_ENGRAVINGS: Engravings = {};

type RoundEngraving = (typeof ROUND_ENGRAVINGS)[number];

function isRoundEngraving(id: EngravingId): id is RoundEngraving {
  return ROUND_ENGRAVINGS.some(round => round === id);
}

/** Where `id` is kept: on `watch`, for one earned in a round. */
export function engravingKey(id: EngravingId, watch: WatchId): string {
  return isRoundEngraving(id) ? `${id}:${watch}` : id;
}

/** The engravings on `watch`'s caseback, in caseback order. */
export function engravedOn(
  engravings: Engravings,
  watch: WatchId
): EngravingId[] {
  return ENGRAVINGS.filter(id => engravingKey(id, watch) in engravings);
}

/** All a round brings to the engravings, and the collection around it. */
export interface EngravingContext {
  readonly progress: Progress;
  readonly reserve: PowerReserve;
  readonly timing: TimingRecords;
}

/** One round, as engravings judge it. */
export interface RoundForEngraving {
  /** Every tap's error, in ms. */
  readonly errors: readonly number[];
  readonly bestStreak: number;
}

function totalPerfects(timing: TimingRecords): number {
  return Object.values(timing).reduce(
    (sum, record) => sum + record.perfects,
    0
  );
}

/** How far the collection is towards each engraving earned across it. */
export function collectionProgress(
  context: EngravingContext
): Readonly<
  Record<(typeof COLLECTION_ENGRAVINGS)[number], { now: number; of: number }>
> {
  const rules = ENGRAVING_RULES;
  return {
    positionalTest: {
      now: FIRST_SERIES.filter(
        watch =>
          bestScore(context.progress, watch) >= rules.positionalTest.score
      ).length,
      of: FIRST_SERIES.length,
    },
    powerReserve: {
      now: Math.min(context.reserve.days, rules.powerReserve.days),
      of: rules.powerReserve.days,
    },
    escapement: {
      now: Math.min(totalPerfects(context.timing), rules.escapement.perfects),
      of: rules.escapement.perfects,
    },
  };
}

function earnedInRound(id: RoundEngraving, round: RoundForEngraving): boolean {
  if (id === 'beatError') {
    return round.bestStreak >= ENGRAVING_RULES.beatError.streak;
  }
  const { hits, spreadMs } = ENGRAVING_RULES.isochronism;
  return (
    round.errors.length >= hits && roundStats(round.errors).spread < spreadMs
  );
}

/**
 * The keys of what `round` on `watch` engraves that `engravings` doesn't
 * hold yet, with `context` already including the round. No round (null)
 * checks the collection alone.
 */
export function newEngravings(
  engravings: Engravings,
  context: EngravingContext,
  watch: WatchId,
  round: RoundForEngraving | null
): string[] {
  const progress = collectionProgress(context);
  const earned = ENGRAVINGS.filter(id =>
    isRoundEngraving(id)
      ? round !== null && earnedInRound(id, round)
      : progress[id].now >= progress[id].of
  );
  return earned
    .map(id => engravingKey(id, watch))
    .filter(key => !(key in engravings));
}

/** The id an engraving's key names, if this version knows it. */
export function engravingOf(key: string): EngravingId | null {
  const [id] = key.split(':');
  return ENGRAVINGS.find(known => known === id) ?? null;
}

/** Both sets of engravings, each on the earlier day it was earned. */
export function mergeEngravings(a: Engravings, b: Engravings): Engravings {
  const merged: Record<string, number> = { ...a };
  for (const [key, day] of Object.entries(b)) {
    merged[key] = Math.min(merged[key] ?? day, day);
  }
  return merged;
}

/** What an engraving's key looks like: `id` or `id:watch`. */
const KEY = /^[a-z][A-Za-z0-9]{0,31}(:[a-z][A-Za-z0-9]{0,31})?$/;
/** Plenty for every engraving on every watch a newer version adds. */
export const MAX_ENGRAVINGS = 200;

/**
 * Saved engravings, read back: any key that looks like one, on a real day,
 * up to MAX_ENGRAVINGS. Those this version knows come first, so keys it
 * doesn't (a newer version's, or junk) can never push them out.
 */
export function restoreEngravings(saved: unknown): Engravings {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
    return NO_ENGRAVINGS;
  }
  const valid = Object.entries(saved).filter(
    (entry): entry is [string, number] => {
      const [key, day] = entry as [string, unknown];
      return (
        KEY.test(key) &&
        typeof day === 'number' &&
        Number.isSafeInteger(day) &&
        day >= 1
      );
    }
  );
  const known = valid.filter(([key]) => engravingOf(key) !== null);
  const unknown = valid.filter(([key]) => engravingOf(key) === null);
  return Object.fromEntries([...known, ...unknown].slice(0, MAX_ENGRAVINGS));
}
