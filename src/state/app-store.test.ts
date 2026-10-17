import { describe, expect, it } from 'vitest';

import { memoryStorage, safeStorage } from '../utils/safe-storage';
import { cloudSaveOf, createAppStore, UNREADABLE } from './app-store';
import { backupFile, readBackup } from './backup';
import { INITIAL_PROGRESS } from './progress';
import { UNWOUND } from './reserve';
import { SAVE_KEY, SAVE_VERSION, type SavedState } from './saved';
import { defaultSettings } from './settings';
import { NO_TIMING } from './timegrapher';

const DEFAULTS: SavedState = {
  settings: defaultSettings(['en']),
  progress: INITIAL_PROGRESS,
  selected: 'diver',
  variants: {},
  daily: null,
  reserve: UNWOUND,
  timing: NO_TIMING,
  engravings: {},
  dailies: {},
  history: {},
  ghosts: { best: {}, daily: null },
  tips: [],
};

function savedIn(storage: ReturnType<typeof memoryStorage>): unknown {
  const raw = storage.items.get(SAVE_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe('createAppStore', () => {
  it('starts from the defaults with nothing saved', () => {
    const store = createAppStore(memoryStorage(), DEFAULTS);
    expect(store.getState().settings).toEqual(DEFAULTS.settings);
    expect(store.getState().progress).toEqual(INITIAL_PROGRESS);
  });

  it('saves settings as they change and restores them', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    store.getState().updateSettings({ sound: false, language: 'tr' });

    expect(savedIn(storage)).toEqual({
      state: {
        settings: { ...DEFAULTS.settings, sound: false, language: 'tr' },
        progress: INITIAL_PROGRESS,
        selected: 'diver',
        variants: {},
        daily: null,
        reserve: UNWOUND,
        timing: NO_TIMING,
        engravings: {},
        dailies: {},
        history: {},
        ghosts: { best: {}, daily: null },
        tips: [],
      },
      version: SAVE_VERSION,
    });

    const reloaded = createAppStore(storage, DEFAULTS);
    expect(reloaded.getState().settings.sound).toBe(false);
    expect(reloaded.getState().settings.language).toBe('tr');
  });

  it('saves best scores and keeps them across reloads', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    expect(store.getState().recordScore('diver', 14)).toEqual({
      score: 14,
      best: 14,
      isNewBest: true,
      unlocked: [],
      certificate: null,
      points: 14,
      levelUp: null,
    });
    store.getState().recordScore('diver', 3);

    const reloaded = createAppStore(storage, DEFAULTS);
    expect(reloaded.getState().progress.best).toEqual({ diver: 14 });
    expect(reloaded.getState().progress.points).toBe(17);
    expect(reloaded.getState().recordScore('diver', 10).isNewBest).toBe(false);
  });

  it('keeps unlocked watches across reloads', () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        state: { progress: { best: {}, unlocked: ['diver'] } },
        version: SAVE_VERSION,
      }),
    });
    const store = createAppStore(storage, DEFAULTS);
    expect(store.getState().progress.unlocked).toEqual(['diver']);
  });

  it('recovers from corrupt or foreign saved data', () => {
    for (const raw of ['{not json', '"hello"', 'null', '{"state":[1,2]}']) {
      const store = createAppStore(
        memoryStorage({ [SAVE_KEY]: raw }),
        DEFAULTS
      );
      expect(store.getState().settings).toEqual(DEFAULTS.settings);
      expect(store.getState().progress).toEqual(INITIAL_PROGRESS);
    }
  });

  it('keeps an unreadable save aside before writing over it', () => {
    const torn = '{"state":{"progress":{"best":{"diver":40}';
    const storage = memoryStorage({ [SAVE_KEY]: torn });
    const store = createAppStore(storage, DEFAULTS);
    store.getState().updateSettings({ night: true });

    expect(storage.items.get(`${SAVE_KEY}${UNREADABLE}`)).toBe(torn);
    expect(savedIn(storage)).toMatchObject({
      state: { settings: { night: true } },
    });

    // A second bad save doesn't bury the first one kept aside.
    storage.items.set(SAVE_KEY, '{also torn');
    createAppStore(storage, DEFAULTS).getState().updateSettings({});
    expect(storage.items.get(`${SAVE_KEY}${UNREADABLE}`)).toBe(torn);
  });

  it('reads data saved by another version field by field', () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        state: { settings: { night: true }, progress: { best: { diver: 8 } } },
        version: SAVE_VERSION + 1,
      }),
    });
    const store = createAppStore(storage, DEFAULTS);
    expect(store.getState().settings.night).toBe(true);
    expect(store.getState().progress.best).toEqual({ diver: 8 });
  });

  it('leaves a newer version’s save its version and unknown fields', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        state: {
          settings: { sound: false },
          progress: {
            best: { diver: 20, worldtimer: 9 },
            unlocked: ['diver', 'chronograph', 'worldtimer'],
          },
          selected: 'diver',
          stats: { hits: 120 },
        },
        version: SAVE_VERSION + 1,
      })
    );
    const store = createAppStore(storage, DEFAULTS);
    expect(store.getState().settings.sound).toBe(false);
    expect(store.getState().progress.best).toEqual({
      diver: 20,
      worldtimer: 9,
    });

    store.getState().updateSettings({ night: true });
    const saved = savedIn(storage) as {
      version: number;
      state: { stats: unknown; progress: { best: unknown } };
    };
    expect(saved.version).toBe(SAVE_VERSION + 1);
    expect(saved.state.stats).toEqual({ hits: 120 });
    expect(saved.state.progress.best).toEqual({ diver: 20, worldtimer: 9 });
  });

  it('never loses a best score to another tab saving', async () => {
    const storage = memoryStorage();
    const first = createAppStore(storage, DEFAULTS);
    const second = createAppStore(storage, DEFAULTS);

    first.getState().recordScore('diver', 50);
    // The second tab, opened earlier, changes a setting from stale memory…
    second.getState().updateSettings({ night: true });
    // …and picks up the first tab's save when told about it.
    await second.persist.rehydrate();
    expect(second.getState().progress.best).toEqual({ diver: 50 });
    expect(second.getState().settings.night).toBe(true);

    second.getState().updateSettings({ sound: false });
    const reloaded = createAppStore(storage, DEFAULTS);
    expect(reloaded.getState().progress.best).toEqual({ diver: 50 });
  });

  it('saves an earned variant and keeps it across reloads', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    store.getState().chooseVariant('diver', 'green');
    expect(store.getState().variants).toEqual({});

    store.getState().recordScore('diver', 41);
    store.getState().chooseVariant('diver', 'blue');
    store.getState().chooseVariant('diver', 'panda');
    expect(store.getState().variants).toEqual({});
    store.getState().chooseVariant('diver', 'green');

    const reloaded = createAppStore(storage, DEFAULTS);
    expect(reloaded.getState().variants).toEqual({ diver: 'green' });
  });

  it('follows the latest pick of variant across tabs', async () => {
    const storage = memoryStorage();
    const first = createAppStore(storage, DEFAULTS);
    const second = createAppStore(storage, DEFAULTS);
    first.getState().recordScore('diver', 80);
    await second.persist.rehydrate();

    first.getState().chooseVariant('diver', 'blue');
    second.getState().chooseVariant('diver', 'green');
    await first.persist.rehydrate();
    expect(first.getState().variants).toEqual({ diver: 'green' });
    expect(first.getState().progress.best).toEqual({ diver: 80 });
  });

  it('saves Daily rounds apart from the collection', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    expect(store.getState().recordDaily(2, 23, ['perfect', 'good'])).toEqual({
      counted: true,
      best: 23,
      isNewBest: true,
      reserve: 1,
      wound: true,
    });
    store.getState().recordDaily(2, 9, ['good']);

    const reloaded = createAppStore(storage, DEFAULTS).getState();
    expect(reloaded.daily).toEqual({ number: 2, best: 23, marks: 'PG' });
    expect(reloaded.reserve).toEqual({ days: 1, woundOn: 2 });
    // Nothing towards the collection: no best, no unlock.
    expect(reloaded.progress).toEqual(INITIAL_PROGRESS);
  });

  it('never loses a Daily best or a wind to another tab saving', async () => {
    const storage = memoryStorage();
    const first = createAppStore(storage, DEFAULTS);
    const second = createAppStore(storage, DEFAULTS);

    first.getState().recordDaily(3, 30, ['perfect']);
    // The second tab, opened the day before, saves from stale memory…
    second.getState().updateSettings({ night: true });
    let saved = createAppStore(storage, DEFAULTS).getState();
    expect(saved.daily).toEqual({ number: 3, best: 30, marks: 'P' });
    expect(saved.reserve).toEqual({ days: 1, woundOn: 3 });

    // …and its own, worse round of the same Daily keeps the better one.
    second.getState().recordDaily(3, 12, ['good']);
    saved = createAppStore(storage, DEFAULTS).getState();
    expect(saved.daily?.best).toBe(30);
    expect(saved.reserve).toEqual({ days: 1, woundOn: 3 });

    // An older Daily from stale memory never replaces a later one.
    const third = createAppStore(storage, DEFAULTS);
    first.getState().recordDaily(4, 5, []);
    third.getState().updateSettings({ sound: false });
    saved = createAppStore(storage, DEFAULTS).getState();
    expect(saved.daily).toEqual({ number: 4, best: 5, marks: '' });
    expect(saved.reserve).toEqual({ days: 2, woundOn: 4 });

    // Rehydrating keeps the best of this tab's memory and the save.
    await second.persist.rehydrate();
    expect(second.getState().daily).toEqual({ number: 4, best: 5, marks: '' });
    expect(second.getState().reserve).toEqual({ days: 2, woundOn: 4 });
  });

  it('records every round’s timing and never loses it to another tab', async () => {
    const storage = memoryStorage();
    const first = createAppStore(storage, DEFAULTS);
    const second = createAppStore(storage, DEFAULTS);

    first.getState().recordTiming('diver', [4, -2, 7], ['good', 'perfect']);
    // The second tab saves from stale memory, with a record of its own.
    second.getState().recordTiming('gmt', [1], ['perfect']);
    let saved = createAppStore(storage, DEFAULTS).getState().timing;
    expect(saved['diver']).toMatchObject({ count: 3, recent: [4, -2, 7] });
    expect(saved['gmt']).toMatchObject({ count: 1, perfects: 1 });

    // A record with fewer hits, from stale memory, never replaces one
    // with more.
    second.getState().recordTiming('diver', [9], ['good']);
    saved = createAppStore(storage, DEFAULTS).getState().timing;
    expect(saved['diver']?.count).toBe(3);

    await second.persist.rehydrate();
    expect(second.getState().timing['diver']?.count).toBe(3);
    expect(second.getState().timing['gmt']?.count).toBe(1);
  });

  it('keeps working in memory when storage throws', () => {
    const fail = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    const blocked = safeStorage(() => ({
      length: 0,
      clear: fail,
      key: fail,
      getItem: fail,
      setItem: fail,
      removeItem: fail,
    }));
    const store = createAppStore(blocked, DEFAULTS);
    store.getState().updateSettings({ vibration: false });
    expect(store.getState().settings.vibration).toBe(false);
    expect(store.getState().recordScore('diver', 5).best).toBe(5);
  });

  it('reports a failed save, and the next one that works', () => {
    const backing = memoryStorage();
    let full = true;
    const saves: boolean[] = [];
    const storage = safeStorage(
      () =>
        ({
          ...backing,
          setItem: (name: string, value: string) => {
            if (full) throw new DOMException('Full', 'QuotaExceededError');
            backing.setItem(name, value);
          },
        }) as unknown as Storage,
      saved => {
        saves.push(saved);
      }
    );
    const store = createAppStore(storage, DEFAULTS);
    store.getState().recordScore('diver', 12);
    expect(saves.at(-1)).toBe(false);
    full = false;
    store.getState().recordScore('diver', 13);
    expect(saves.at(-1)).toBe(true);
    expect(savedIn(backing)).toMatchObject({
      state: { progress: { best: { diver: 13 } } },
    });
  });
  it('remembers each tip once, across reloads', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    store.getState().markTip('perfect');
    store.getState().markTip('perfect');
    store.getState().markTip('streak');
    expect(store.getState().tips).toEqual(['perfect', 'streak']);
    expect(createAppStore(storage, DEFAULTS).getState().tips).toEqual([
      'perfect',
      'streak',
    ]);
  });

  it('never shows a tip again that another tab showed', async () => {
    const storage = memoryStorage();
    const first = createAppStore(storage, DEFAULTS);
    const second = createAppStore(storage, DEFAULTS);
    first.getState().markTip('perfect');
    // The second tab, from stale memory, saves a tip of its own…
    second.getState().markTip('multiplier');
    const seen = (tips: readonly string[]) => [...tips].sort();
    expect(seen(createAppStore(storage, DEFAULTS).getState().tips)).toEqual([
      'multiplier',
      'perfect',
    ]);
    // …and the first takes the second's in as it rehydrates.
    await first.persist.rehydrate();
    expect(seen(first.getState().tips)).toEqual(['multiplier', 'perfect']);
  });

  it('keeps tips on this device: never in what an account or backup holds', () => {
    const store = createAppStore(memoryStorage(), DEFAULTS);
    store.getState().markTip('perfect');
    expect(cloudSaveOf(store.getState())).not.toHaveProperty('tips');
    // Another device's progress leaves this one's tips alone.
    store.getState().mergeSaved({ tips: [], progress: { best: { diver: 3 } } });
    expect(store.getState().tips).toEqual(['perfect']);
  });

  it('reads a save from before versions were numbered, and saves it as current', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        state: {
          progress: { best: { diver: 20 }, unlocked: ['diver'], points: 400 },
          settings: { sound: false, theme: 'neon' },
        },
        version: 0,
      })
    );
    const store = createAppStore(storage, DEFAULTS);
    const { progress, settings } = store.getState();
    expect(progress.best).toEqual({ diver: 20 });
    // Its requirements met, the Chronograph opens on the way in.
    expect(progress.unlocked).toEqual(['diver', 'chronograph']);
    expect(settings.sound).toBe(false);
    expect(settings.theme).toBe(DEFAULTS.settings.theme);
    expect(savedIn(storage)).toMatchObject({ version: SAVE_VERSION });
  });

  it('opens a watch that a merge earns, though neither side had', () => {
    const store = createAppStore(memoryStorage(), DEFAULTS);
    // This device has the Diver's score; another has the points.
    store.getState().recordScore('diver', 20);
    store.getState().mergeSaved({ progress: { best: {}, points: 400 } });
    expect(store.getState().progress.unlocked).toContain('chronograph');
  });

  it('keeps counting Dailies after a backup from a clock set ahead', () => {
    const today = 10;
    const store = createAppStore(memoryStorage(), DEFAULTS, () => today);
    store.getState().mergeSaved({
      daily: { number: today + 30, best: 99, marks: '' },
      reserve: { days: 7, woundOn: today + 30 },
    });
    expect(store.getState().daily).toBeNull();
    expect(store.getState().recordDaily(today, 12, ['good']).counted).toBe(
      true
    );
    expect(store.getState().daily).toEqual({
      number: today,
      best: 12,
      marks: 'G',
    });
  });

  it('resets the settings and leaves progress alone', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    store.getState().updateSettings({ sound: false, theme: 'dark' });
    store.getState().recordScore('diver', 20);
    store.getState().resetSettings();
    const reloaded = createAppStore(storage, DEFAULTS).getState();
    expect(reloaded.settings).toEqual(DEFAULTS.settings);
    expect(reloaded.progress.best).toEqual({ diver: 20 });
  });

  it('erases progress for good, keeping the settings and tips', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    store.getState().updateSettings({ language: 'tr' });
    store.getState().markTip('perfect');
    store.getState().recordScore('diver', 50);
    store.getState().recordDaily(4, 12, ['good']);
    store.getState().recordTiming('diver', [3, -2], ['perfect', 'good']);
    store.getState().engrave('diver', { errors: [1], bestStreak: 10 });
    store.getState().recordLine('diver', [1000, 0, 50, 50, 9, 1, 8]);
    store.getState().eraseProgress();

    // Not merged back from what was stored, unlike every other save.
    for (const state of [
      store.getState(),
      createAppStore(storage, DEFAULTS).getState(),
    ]) {
      expect(state.progress).toEqual(INITIAL_PROGRESS);
      expect(state.daily).toBeNull();
      expect(state.reserve).toEqual(UNWOUND);
      expect(state.timing).toEqual(NO_TIMING);
      expect(state.engravings).toEqual({});
      expect(state.dailies).toEqual({});
      expect(state.history).toEqual({});
      expect(state.settings.language).toBe('tr');
      expect(state.tips).toEqual(['perfect']);
    }
  });

  it('keeps every tab’s round lines, on this device only', () => {
    const storage = memoryStorage();
    const first = createAppStore(storage, DEFAULTS);
    const second = createAppStore(storage, DEFAULTS);
    first.getState().recordLine('diver', [1000, 0, 12, 12, 3, 2, 9]);
    // The second tab writes from memory that never saw the first's round.
    second.getState().recordLine('diver', [2000, 1, 5, 5, 1, -1, 7]);
    const reloaded = createAppStore(storage, DEFAULTS).getState();
    expect(reloaded.history['diver']?.map(([at]) => at)).toEqual([1000, 2000]);
    expect(cloudSaveOf(reloaded)).not.toHaveProperty('history');
  });

  it('keeps each Daily’s best in the archive, and takes in another device’s', () => {
    const store = createAppStore(memoryStorage(), DEFAULTS, () => 12);
    store.getState().recordDaily(11, 7, ['good']);
    store.getState().recordDaily(12, 9, ['good']);
    store.getState().recordDaily(12, 4, ['good']);
    expect(store.getState().dailies).toEqual({ '11': 7, '12': 9 });
    store.getState().mergeSaved({ dailies: { '10': 3, '11': 8 } });
    expect(store.getState().dailies).toEqual({ '10': 3, '11': 8, '12': 9 });
  });

  it('restores a backup without losing anything earned since', () => {
    // A player at level 3, with the GMT's level reached.
    const backedUp = createAppStore(memoryStorage(), {
      ...DEFAULTS,
      progress: { ...DEFAULTS.progress, points: 400 },
    });
    backedUp.getState().recordScore('diver', 20);
    backedUp.getState().recordScore('chronograph', 41);
    backedUp.getState().chooseVariant('chronograph', 'panda');
    backedUp.getState().recordDaily(4, 12, ['good']);
    const file = backupFile(
      cloudSaveOf(backedUp.getState()),
      new Date(2026, 9, 3, 12)
    );

    // This device has since scored more on the Diver, and less elsewhere.
    const store = createAppStore(memoryStorage(), DEFAULTS);
    store.getState().recordScore('diver', 33);
    const reading = readBackup(file.text);
    if (!reading.ok) throw new Error(reading.error);
    store.getState().mergeSaved(reading.saved);

    const { progress, variants, daily } = store.getState();
    expect(progress.best).toEqual({ diver: 33, chronograph: 41 });
    expect(progress.unlocked).toEqual(['diver', 'chronograph', 'gmt']);
    expect(progress.points).toBe(461);
    expect(variants).toEqual({ chronograph: 'panda' });
    expect(daily).toEqual({ number: 4, best: 12, marks: 'G' });
  });

  it('engraves a round’s feat once, and keeps it across reloads', () => {
    const storage = memoryStorage();
    const store = createAppStore(storage, DEFAULTS);
    const round = { errors: [3, -3, 2], bestStreak: 10 };
    expect(store.getState().engrave('diver', round)).toEqual([
      'beatError:diver',
    ]);
    expect(store.getState().engrave('diver', round)).toEqual([]);
    const reloaded = createAppStore(storage, DEFAULTS);
    expect(Object.keys(reloaded.getState().engravings)).toEqual([
      'beatError:diver',
    ]);
  });
});
