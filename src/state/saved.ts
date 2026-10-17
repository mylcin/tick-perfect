import { isLanguage } from '../i18n';
import { FIRST_WATCH, isWatchId, type WatchId } from '../watches/ids';
import { RETIRED_VARIANTS } from '../watches/variants';
import { MARKS, type DailyRecord } from './daily';
import {
  recordDailyBest,
  restoreDailies,
  type DailyArchive,
} from './daily-archive';
import { restoreEngravings, type Engravings } from './engravings';
import { restoreGhosts, type Ghosts } from './ghost';
import { restoreLines, type History, type RoundLine } from './history';
import { mergeProgress, withEarnedUnlocks, type Progress } from './progress';
import { RESERVE_DAYS, UNWOUND, type PowerReserve } from './reserve';
import { isThemeSetting, type Settings } from './settings';
import { restoreTips } from './tips';
import {
  restoreRecord,
  type TimingRecord,
  type TimingRecords,
} from './timegrapher';

// What survives a reload, and how it is read back. Saved data comes from
// outside the app (an older version, another tab, a hand-edited value), so
// every field is checked and anything unusable falls back to its default.

export const SAVE_KEY = 'tick-perfect';
export const SAVE_VERSION = 1;

export interface SavedState {
  readonly settings: Settings;
  readonly progress: Progress;
  /** The watch picked in the collection. */
  readonly selected: WatchId;
  /** The variant picked for each watch, earned or not (yet). */
  readonly variants: Readonly<Record<string, string>>;
  /** The latest Daily played and its best round. */
  readonly daily: DailyRecord | null;
  readonly reserve: PowerReserve;
  /** Every watch's timing record, for the timegrapher. */
  readonly timing: TimingRecords;
  /** What is engraved on the casebacks. */
  readonly engravings: Engravings;
  /** Each recent Daily's best, by number. */
  readonly dailies: DailyArchive;
  /** Each watch's latest rounds, a line each. Kept on this device only. */
  readonly history: History;
  /** Rounds kept to race again. Kept on this device only. */
  readonly ghosts: Ghosts;
  /**
   * The tips already shown and the questions already asked, once each
   * (a TipId, or one a newer version added). Kept on this device only.
   */
  readonly tips: readonly string[];
}

type Fields = Readonly<Record<string, unknown>>;

function fields(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : {};
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function restoreSettings(saved: Fields, defaults: Settings): Settings {
  const reducedMotion = saved['reducedMotion'];
  const language = saved['language'];
  const theme = saved['theme'];
  return {
    sound: boolean(saved['sound'], defaults.sound),
    vibration: boolean(saved['vibration'], defaults.vibration),
    theme: isThemeSetting(theme) ? theme : defaults.theme,
    night: boolean(saved['night'], defaults.night),
    reducedMotion:
      typeof reducedMotion === 'boolean' || reducedMotion === null
        ? reducedMotion
        : defaults.reducedMotion,
    batterySaver: boolean(saved['batterySaver'], defaults.batterySaver),
    language: isLanguage(language) ? language : defaults.language,
  };
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * What a watch id looks like. Ids this version doesn't know are kept, so a
 * newer version's watches survive being written back by this one.
 */
const WATCH_ID = /^[a-z][A-Za-z0-9]{0,31}$/;

function isWatchKey(value: unknown): value is string {
  return typeof value === 'string' && WATCH_ID.test(value);
}

/**
 * Unknown watch ids a save keeps: plenty for watches a newer version adds,
 * few enough that a crafted backup can't bloat the save past what an
 * account can sync.
 */
export const MAX_UNKNOWN_WATCHES = 16;

/** `ids`, keeping every watch this version knows and the first few others. */
function withFewUnknown<T extends string>(ids: readonly T[]): T[] {
  const kept: T[] = [];
  let unknown = 0;
  for (const id of ids) {
    if (isWatchId(id)) {
      kept.push(id);
    } else if (unknown < MAX_UNKNOWN_WATCHES) {
      unknown += 1;
      kept.push(id);
    }
  }
  return kept;
}

/** The entries of `saved` whose keys `withFewUnknown` keeps. */
function entriesOf(saved: Fields): [string, unknown][] {
  const entries = Object.entries(saved).filter(([id]) => isWatchKey(id));
  const kept = new Set(withFewUnknown(entries.map(([id]) => id)));
  return entries.filter(([id]) => kept.has(id));
}

function restoreProgress(saved: Fields): Progress {
  const best: Record<string, number> = {};
  for (const [id, score] of entriesOf(fields(saved['best']))) {
    if (isScore(score)) best[id] = score;
  }

  const savedUnlocked = saved['unlocked'];
  const unlocked = Array.isArray(savedUnlocked)
    ? withFewUnknown(savedUnlocked.filter(isWatchKey))
    : [];

  // A save from before points kept none; its bests are points it earned.
  const savedPoints = saved['points'];
  const points = Math.max(
    isScore(savedPoints) ? savedPoints : 0,
    Object.values(best).reduce((sum, score) => sum + score, 0)
  );

  // Merging orders the ids; unlocking repairs any chain a score has earned.
  return withEarnedUnlocks(
    mergeProgress(
      { best: {}, unlocked: [FIRST_WATCH], points: 0 },
      { best, unlocked, points }
    )
  );
}

/** A variant id; ones this version doesn't know are kept, as watch ids are. */
const VARIANT_ID = /^[a-z][A-Za-z0-9]{0,31}$/;

function restoreVariants(saved: Fields): Record<string, string> {
  const variants: Record<string, string> = {};
  for (const [watch, variant] of entriesOf(saved)) {
    if (typeof variant === 'string' && VARIANT_ID.test(variant)) {
      variants[watch] = RETIRED_VARIANTS[watch]?.[variant] ?? variant;
    }
  }
  return variants;
}

function isDailyNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/**
 * How many days past today a saved day may be: another device can be a day
 * ahead across time zones, and a little more at their extremes. Anything
 * later came from a clock set ahead or a made-up file, and kept, it would
 * stop every Daily until then from counting.
 */
export const DAYS_AHEAD = 2;

/** A Daily number not yet too far ahead of `today` (if it is known). */
function isPastOrNear(day: number, today: number | undefined): boolean {
  return today === undefined || day <= today + DAYS_AHEAD;
}

/** A Daily record is kept whole or not at all: its fields belong together. */
function restoreDaily(
  saved: Fields,
  fallback: DailyRecord | null,
  today: number | undefined
): DailyRecord | null {
  const { number, best, marks } = saved;
  return isDailyNumber(number) &&
    isPastOrNear(number, today) &&
    isScore(best) &&
    typeof marks === 'string' &&
    MARKS.test(marks)
    ? { number, best, marks }
    : fallback;
}

function restoreReserve(
  saved: Fields,
  fallback: PowerReserve,
  today: number | undefined
): PowerReserve {
  const { days, woundOn } = saved;
  return isScore(days) &&
    days <= RESERVE_DAYS &&
    (woundOn === UNWOUND.woundOn ||
      (isDailyNumber(woundOn) && isPastOrNear(woundOn, today)))
    ? { days, woundOn }
    : fallback;
}

/** Each watch's lines, the valid ones; watches with none are left out. */
function restoreHistory(saved: Fields): History {
  const history: Record<string, readonly RoundLine[]> = {};
  for (const [id, value] of entriesOf(saved)) {
    const lines = restoreLines(value);
    if (lines.length > 0) history[id] = lines;
  }
  return history;
}

/** Each watch's record is kept whole or dropped on its own. */
function restoreTiming(saved: Fields): TimingRecords {
  const timing: Record<string, TimingRecord> = {};
  for (const [id, value] of entriesOf(saved)) {
    const record = restoreRecord(value);
    if (record) timing[id] = record;
  }
  return timing;
}

/**
 * Reads saved data back, keeping every valid field and defaulting the rest.
 * Given `today`'s Daily number, a Daily or a wind too far ahead of it is
 * dropped too (see DAYS_AHEAD).
 */
export function restoreSaved(
  saved: unknown,
  defaults: SavedState,
  today?: number
): SavedState {
  const state = fields(saved);
  const progress = restoreProgress(fields(state['progress']));
  const selected = state['selected'];
  const daily = restoreDaily(fields(state['daily']), defaults.daily, today);
  const dailies = restoreDailies(
    state['dailies'],
    today === undefined ? undefined : today + DAYS_AHEAD
  );
  return {
    settings: restoreSettings(fields(state['settings']), defaults.settings),
    progress,
    selected:
      isWatchId(selected) && progress.unlocked.includes(selected)
        ? selected
        : defaults.selected,
    variants: restoreVariants(fields(state['variants'])),
    daily,
    reserve: restoreReserve(fields(state['reserve']), defaults.reserve, today),
    timing: restoreTiming(fields(state['timing'])),
    engravings: restoreEngravings(state['engravings']),
    // The latest Daily is in the archive too, even in a save from before it.
    dailies: daily
      ? recordDailyBest(dailies, daily.number, daily.best)
      : dailies,
    history: restoreHistory(fields(state['history'])),
    ghosts: restoreGhosts(state['ghosts']),
    tips: restoreTips(state['tips']),
  };
}
