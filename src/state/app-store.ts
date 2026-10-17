import {
  persist,
  type PersistStorage,
  type StorageValue,
} from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import type { SyncStorage } from '../utils/safe-storage';
import type { HitQuality } from '../game';
import { variantOf, type VariantId } from '../watches';
import type { WatchId } from '../watches/ids';
import {
  mergeDaily,
  recordDailyRound,
  todaysDaily,
  type DailyOutcome,
} from './daily';
import {
  mergeEngravings,
  newEngravings,
  type RoundForEngraving,
} from './engravings';
import {
  isUnlocked,
  mergeProgress,
  recordScore,
  withEarnedUnlocks,
  type ScoreRecord,
} from './progress';
import { mergeDailies, recordDailyBest } from './daily-archive';
import { addLine, mergeHistory, type RoundLine } from './history';
import { mergeReserve } from './reserve';
import { restoreSaved, SAVE_KEY, SAVE_VERSION, type SavedState } from './saved';
import type { Settings } from './settings';
import { addRound, mergeTiming } from './timegrapher';
import { mergeTips, type TipId } from './tips';
import { isVariantEarned } from './variants';

export interface AppState extends SavedState {
  readonly updateSettings: (patch: Partial<Settings>) => void;
  /** Saves a finished round's score and reports how it compares. */
  readonly recordScore: (watch: WatchId, score: number) => ScoreRecord;
  /**
   * Saves a finished round of Daily `number` towards the day's best and the
   * power reserve (never the collection), and reports how it counted.
   */
  readonly recordDaily: (
    number: number,
    score: number,
    qualities: readonly HitQuality[]
  ) => DailyOutcome;
  /**
   * Saves a finished round's hits towards `watch`'s timing record, in any
   * mode: their errors in ms and, in the same order, how they landed.
   */
  readonly recordTiming: (
    watch: WatchId,
    errors: readonly number[],
    qualities: readonly HitQuality[]
  ) => void;
  /** Adds a finished round's line to `watch`'s history, in any mode. */
  readonly recordLine: (watch: WatchId, line: RoundLine) => void;
  /**
   * Engraves what a finished round on `watch` earned (null: what the
   * collection alone has), once its score and timing are saved. Returns
   * the keys engraved now.
   */
  readonly engrave: (
    watch: WatchId,
    round: RoundForEngraving | null
  ) => string[];
  /** Picks a watch in the collection; locked watches can't be picked. */
  readonly select: (watch: WatchId) => void;
  /** Picks the variant `watch` is worn in; unearned ones can't be picked. */
  readonly chooseVariant: (watch: WatchId, variant: VariantId) => void;
  /** Remembers that a tip was shown (or a question asked), for good. */
  readonly markTip: (tip: TipId) => void;
  /**
   * Takes in what another device saved (from the player's account): the
   * best of both of everything earned, and its variant picks where this
   * one has none. Nothing earned here is ever lost.
   */
  readonly mergeSaved: (saved: unknown) => void;
  /** Puts every setting back to its default; progress stays. */
  readonly resetSettings: () => void;
  /**
   * Erases everything earned on this device (settings and tips stay), so
   * it starts as new. Written over rather than merged, which every other
   * save is, so the stored progress doesn't come straight back.
   */
  readonly eraseProgress: () => void;
}

/** What follows a player to another device: all they earned, not settings. */
export type CloudSave = Pick<
  SavedState,
  | 'progress'
  | 'variants'
  | 'daily'
  | 'dailies'
  | 'reserve'
  | 'timing'
  | 'engravings'
>;

export function cloudSaveOf(state: SavedState): CloudSave {
  const { progress, variants, daily, dailies, reserve, timing, engravings } =
    state;
  return { progress, variants, daily, dailies, reserve, timing, engravings };
}

/** Added to the save's key for a copy of a save that couldn't be read. */
export const UNREADABLE = '.unreadable';

/**
 * Everything earned in both: bests, unlocks, the Daily and the days before
 * it, the reserve, the timing records and the engravings. A watch the two
 * earn only together (one side's best, the other's points) opens as well.
 */
function mergeEarned(
  a: SavedState,
  b: SavedState
): Pick<
  SavedState,
  'progress' | 'daily' | 'dailies' | 'reserve' | 'timing' | 'engravings'
> {
  return {
    progress: withEarnedUnlocks(mergeProgress(a.progress, b.progress)),
    daily: mergeDaily(a.daily, b.daily),
    dailies: mergeDailies(a.dailies, b.dailies),
    reserve: mergeReserve(a.reserve, b.reserve),
    timing: mergeTiming(a.timing, b.timing),
    engravings: mergeEngravings(a.engravings, b.engravings),
  };
}

/**
 * JSON in `storage`, where writing never loses progress: each save keeps the
 * best of what is being saved and what is already there, so a tab writing
 * from stale memory can't wipe a score (a Daily best, a wound reserve)
 * another tab just set.
 *
 * A save from a newer version (another tab, or before a rollback) is read
 * field by field like any other, never migrated or written over: writes
 * keep its version number and every field this version doesn't know.
 */
function progressKeepingStorage(
  storage: SyncStorage,
  defaults: SavedState,
  today: () => number
): PersistStorage<SavedState> {
  const read = (name: string): StorageValue<SavedState> | null => {
    const raw = storage.getItem(name);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as StorageValue<SavedState>;
    } catch {
      // The next save writes over it, so it is kept aside first: a later
      // version, or someone helping the player, may get the progress back.
      // Only the first, so one bad save can't bury an older one.
      const aside = `${name}${UNREADABLE}`;
      if (storage.getItem(aside) === null) storage.setItem(aside, raw);
      return null;
    }
  };
  return {
    getItem: name => {
      const stored = read(name);
      // Newer than this version: restore what it can, as if current.
      return stored && (stored.version ?? 0) > SAVE_VERSION
        ? { ...stored, version: SAVE_VERSION }
        : stored;
    },
    setItem: (name, value) => {
      const stored = read(name);
      const restored = stored && restoreSaved(stored.state, defaults, today());
      // Tips and history, too: one another tab just showed isn't shown
      // again, and a round it just finished stays in the history.
      const earned = restored
        ? {
            ...mergeEarned(value.state, restored),
            tips: mergeTips(value.state.tips, restored.tips),
            history: mergeHistory(value.state.history, restored.history),
          }
        : {};
      storage.setItem(
        name,
        JSON.stringify({
          ...value,
          version: Math.max(value.version ?? 0, stored?.version ?? 0),
          state: { ...stored?.state, ...value.state, ...earned },
        })
      );
    },
    removeItem: name => {
      storage.removeItem(name);
    },
  };
}

/**
 * Settings and progress, saved to `storage` after every change. `today` is
 * the Daily number now, for keeping days from the future out.
 */
export function createAppStore(
  storage: SyncStorage,
  defaults: SavedState,
  today: () => number = () => todaysDaily(new Date())
) {
  return createStore<AppState>()(
    persist(
      (set, get, api) => ({
        ...defaults,
        updateSettings: patch => {
          set(state => ({ settings: { ...state.settings, ...patch } }));
        },
        recordScore: (watch, score) => {
          const result = recordScore(get().progress, watch, score);
          set({ progress: result.progress });
          return result.record;
        },
        recordDaily: (number, score, qualities) => {
          const { progress, outcome } = recordDailyRound(
            get(),
            number,
            score,
            qualities
          );
          set({
            ...progress,
            ...(outcome.counted && {
              dailies: recordDailyBest(get().dailies, number, score),
            }),
          });
          return outcome;
        },
        recordTiming: (watch, errors, qualities) => {
          set(state => ({
            timing: addRound(state.timing, watch, errors, qualities),
          }));
        },
        recordLine: (watch, line) => {
          set(state => ({ history: addLine(state.history, watch, line) }));
        },
        engrave: (watch, round) => {
          const state = get();
          const keys = newEngravings(state.engravings, state, watch, round);
          if (keys.length > 0) {
            const day = todaysDaily(new Date());
            set({
              engravings: {
                ...state.engravings,
                ...Object.fromEntries(keys.map(key => [key, day])),
              },
            });
          }
          return keys;
        },
        select: watch => {
          if (isUnlocked(get().progress, watch)) set({ selected: watch });
        },
        chooseVariant: (watch, id) => {
          const { progress, variants } = get();
          const variant = variantOf(watch, id);
          if (variant && isVariantEarned(progress, watch, variant)) {
            set({ variants: { ...variants, [watch]: id } });
          }
        },
        markTip: tip => {
          const { tips } = get();
          if (!tips.includes(tip)) set({ tips: mergeTips(tips, [tip]) });
        },
        mergeSaved: saved => {
          const current = get();
          const restored = restoreSaved(saved, current, today());
          set({
            ...mergeEarned(current, restored),
            variants: { ...restored.variants, ...current.variants },
          });
        },
        resetSettings: () => {
          set({ settings: defaults.settings });
        },
        eraseProgress: () => {
          api.persist.clearStorage();
          set({
            progress: defaults.progress,
            selected: defaults.selected,
            variants: defaults.variants,
            daily: defaults.daily,
            reserve: defaults.reserve,
            timing: defaults.timing,
            engravings: defaults.engravings,
            dailies: defaults.dailies,
            history: defaults.history,
          });
        },
      }),
      {
        name: SAVE_KEY,
        version: SAVE_VERSION,
        storage: progressKeepingStorage(storage, defaults, today),
        partialize: ({
          settings,
          progress,
          selected,
          variants,
          daily,
          reserve,
          timing,
          engravings,
          dailies,
          history,
          tips,
        }): SavedState => ({
          settings,
          progress,
          selected,
          variants,
          daily,
          reserve,
          timing,
          engravings,
          dailies,
          history,
          tips,
        }),
        // Older versions are read field by field like any other saved data.
        migrate: saved => restoreSaved(saved, defaults, today()),
        // Settings and the picks follow the latest save; everything earned
        // keeps the best of both, so a second tab rehydrating can't wipe it,
        // and a tip shown in either stays shown.
        merge: (saved, current) => {
          const restored = restoreSaved(saved, defaults, today());
          return {
            ...current,
            ...mergeEarned(current, restored),
            tips: mergeTips(current.tips, restored.tips),
            history: mergeHistory(current.history, restored.history),
            settings: restored.settings,
            selected: restored.selected,
            variants: restored.variants,
          };
        },
      }
    )
  );
}
