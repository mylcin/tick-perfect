// The watches by id, in collection order. Kept apart from the specs so the
// saved-progress code can name watches without loading how they look.

/** The first series: five watches, unlocked one after another. */
export const COLLECTION = [
  'diver',
  'chronograph',
  'gmt',
  'moonphase',
  'tourbillon',
] as const;

/** Endless, unlocked once the first series is. */
export const ENDLESS_WATCH = 'grandComplication';

/**
 * The second series, after Endless: tool watches made for the field, the
 * air and hard knocks, each unlocked from the one before it.
 */
export const SECOND_SERIES = ['field', 'pilot', 'digital'] as const;

/** A watch with a rule of its own, as the Dailies take turns on. */
export type CollectionWatchId =
  (typeof COLLECTION)[number] | (typeof SECOND_SERIES)[number];
export type WatchId = CollectionWatchId | typeof ENDLESS_WATCH;

/** Every watch, in the order the collection shows them. */
export const WATCH_ORDER: readonly [WatchId, ...WatchId[]] = [
  ...COLLECTION,
  ENDLESS_WATCH,
  ...SECOND_SERIES,
];

/** The first series and Endless, whose rules Endless mixes. */
export const FIRST_SERIES: readonly WatchId[] = [...COLLECTION, ENDLESS_WATCH];

/** Always unlocked. */
export const FIRST_WATCH: WatchId = WATCH_ORDER[0];

export function isWatchId(value: unknown): value is WatchId {
  return WATCH_ORDER.some(id => id === value);
}
