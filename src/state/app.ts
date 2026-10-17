import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';

import { createObservable } from '../utils/observable';
import { safeStorage } from '../utils/safe-storage';
import { createAppStore, type AppState } from './app-store';
import { persistStorage, shouldPersist } from './keep-progress';
import { INITIAL_PROGRESS } from './progress';
import { UNWOUND } from './reserve';
import { SAVE_KEY } from './saved';
import { NO_DAILIES } from './daily-archive';
import { NO_ENGRAVINGS } from './engravings';
import { NO_GHOSTS } from './ghost';
import { NO_HISTORY } from './history';
import { NO_TIMING } from './timegrapher';
import { FIRST_WATCH } from '../watches/ids';
import { defaultSettings } from './settings';

/** Whether the last save reached storage; false while it can't keep any. */
export const storageWorks = createObservable(true);

/** The player's settings and progress, kept in localStorage. */
export const appStore = createAppStore(
  safeStorage(
    () => window.localStorage,
    saved => {
      storageWorks.set(saved);
    }
  ),
  {
    settings: defaultSettings(navigator.languages),
    progress: INITIAL_PROGRESS,
    selected: FIRST_WATCH,
    variants: {},
    daily: null,
    reserve: UNWOUND,
    timing: NO_TIMING,
    engravings: NO_ENGRAVINGS,
    dailies: NO_DAILIES,
    history: NO_HISTORY,
    ghosts: NO_GHOSTS,
    tips: [],
  }
);

// Another tab saved: read its changes in, so this tab's next save carries
// them instead of writing over them.
window.addEventListener('storage', event => {
  if (event.key === SAVE_KEY) void appStore.persist.rehydrate();
});

/**
 * Once the player has earned a watch, asks the browser to keep the save, the
 * first time only (see persistStorage). Call it from a press: some browsers
 * ask the player.
 */
export function askToKeepProgress(): void {
  const { progress, tips, markTip } = appStore.getState();
  if (!shouldPersist(progress, tips)) return;
  markTip('persist');
  persistStorage(navigator.storage);
}

/** Follows {@link storageWorks}: false once a save has failed. */
export function useStorageWorks(): boolean {
  return useSyncExternalStore(
    listener => storageWorks.subscribe(listener),
    () => storageWorks.get()
  );
}

/** Selects from the app store; pick primitives or stable objects. */
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
