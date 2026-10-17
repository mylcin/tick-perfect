// Each recent Daily's best, by number, so the days played can be looked
// back on and the run of days counted. The current day's marks stay in its
// DailyRecord; this keeps only a score a day.

/** Daily number to that day's best. */
export type DailyArchive = Readonly<Record<string, number>>;

export const NO_DAILIES: DailyArchive = {};

/** The most days kept: about two months back. */
export const MAX_DAILIES = 60;

const DAY = /^[1-9][0-9]{0,6}$/;

/** The latest MAX_DAILIES days, in order. */
function latest(entries: readonly (readonly [number, number])[]): DailyArchive {
  return Object.fromEntries(
    [...entries]
      .sort((a, b) => a[0] - b[0])
      .slice(-MAX_DAILIES)
      .map(([day, best]) => [String(day), best])
  );
}

const entriesOf = (archive: DailyArchive) =>
  Object.entries(archive).map(([day, best]) => [Number(day), best] as const);

/** `archive` with Daily `number`'s best raised to `score` if higher. */
export function recordDailyBest(
  archive: DailyArchive,
  number: number,
  score: number
): DailyArchive {
  const best = archive[String(number)];
  if (best !== undefined && best >= score) return archive;
  return latest([
    ...entriesOf(archive).filter(([day]) => day !== number),
    [number, score],
  ]);
}

/** Every day in either, at the higher best. */
export function mergeDailies(a: DailyArchive, b: DailyArchive): DailyArchive {
  const merged = new Map(entriesOf(a));
  for (const [day, best] of entriesOf(b)) {
    merged.set(day, Math.max(merged.get(day) ?? 0, best));
  }
  return latest([...merged]);
}

/**
 * A saved archive read back: days that look like Daily numbers (none past
 * `latestDay`, if given), each with a whole-number best.
 */
export function restoreDailies(
  saved: unknown,
  latestDay?: number
): DailyArchive {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
    return NO_DAILIES;
  }
  const entries: [number, number][] = [];
  for (const [day, best] of Object.entries(saved)) {
    const number = Number(day);
    if (
      DAY.test(day) &&
      (latestDay === undefined || number <= latestDay) &&
      typeof best === 'number' &&
      Number.isSafeInteger(best) &&
      best >= 0
    ) {
      entries.push([number, best]);
    }
  }
  return latest(entries);
}

/**
 * Days played in a row up to `today`. Today counts once played; until
 * then the run still stands from yesterday.
 */
export function runOfDays(archive: DailyArchive, today: number): number {
  const played = (day: number) => String(day) in archive;
  let day = played(today) ? today : today - 1;
  let run = 0;
  while (day >= 1 && played(day)) {
    run += 1;
    day -= 1;
  }
  return run;
}
