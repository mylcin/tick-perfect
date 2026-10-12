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
  type ScoreRecord,
} from './progress';
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
}

/** What follows a player to another device: all they earned, not settings. */
export type CloudSave = Pick<
  SavedState,
  'progress' | 'variants' | 'daily' | 'reserve' | 'timing' | 'engravings'
>;

export function cloudSaveOf(state: SavedState): CloudSave {
  const { progress, variants, daily, reserve, timing, engravings } = state;
  return { progress, variants, daily, reserve, timing, engravings };
}

/** Added to the save's key for a copy of a save that couldn't be read. */
export const UNREADABLE = '.unreadable';

/**
 * Everything earned in both: bests, unlocks, the Daily, the reserve, the
 * timing records and the engravings.
 */
function mergeEarned(
  a: SavedState,
  b: SavedState
): Pick<
  SavedState,
  'progress' | 'daily' | 'reserve' | 'timing' | 'engravings'
> {
  return {
    progress: mergeProgress(a.progress, b.progress),
    daily: mergeDaily(a.daily, b.daily),
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
  defaults: SavedState
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
      const restored = stored && restoreSaved(stored.state, defaults);
      // Tips, too: one another tab just showed isn't shown again.
      const earned = restored
        ? {
            ...mergeEarned(value.state, restored),
            tips: mergeTips(value.state.tips, restored.tips),
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

/** Settings and progress, saved to `storage` after every change. */
export function createAppStore(storage: SyncStorage, defaults: SavedState) {
  return createStore<AppState>()(
    persist(
      (set, get) => ({
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
          set(progress);
          return outcome;
        },
        recordTiming: (watch, errors, qualities) => {
          set(state => ({
            timing: addRound(state.timing, watch, errors, qualities),
          }));
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
          const restored = restoreSaved(saved, current);
          set({
            ...mergeEarned(current, restored),
            variants: { ...restored.variants, ...current.variants },
          });
        },
      }),
      {
        name: SAVE_KEY,
        version: SAVE_VERSION,
        storage: progressKeepingStorage(storage, defaults),
        partialize: ({
          settings,
          progress,
          selected,
          variants,
          daily,
          reserve,
          timing,
          engravings,
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
          tips,
        }),
        // Older versions are read field by field like any other saved data.
        migrate: saved => restoreSaved(saved, defaults),
        // Settings and the picks follow the latest save; everything earned
        // keeps the best of both, so a second tab rehydrating can't wipe it,
        // and a tip shown in either stays shown.
        merge: (saved, current) => {
          const restored = restoreSaved(saved, defaults);
          return {
            ...current,
            ...mergeEarned(current, restored),
            tips: mergeTips(current.tips, restored.tips),
            settings: restored.settings,
            selected: restored.selected,
            variants: restored.variants,
          };
        },
      }
    )
  );
}
