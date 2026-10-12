import type { SyncStorage } from './safe-storage';

// A deploy replaces the build's chunks, each named after a hash of its
// code. A page still running the build before (a tab left open while the
// service worker moved on) then fails to load a chunk it hasn't fetched
// yet: the 3D scene, sign-in, the privacy notice. Vite says so with a
// 'vite:preloadError' event, and a reload brings the current build.

/** The build that last reloaded itself in this tab. */
export const RELOADED_KEY = 'tick-perfect.reloaded';

interface StaleBuildDeps {
  /** The tab's session storage, which outlives a reload. */
  readonly storage: SyncStorage;
  /** This build's version, VITE_APP_VERSION. */
  readonly version: string;
  readonly reload: () => void;
  /** Whether a round is being played, its results included. */
  readonly inRound: () => boolean;
  /** Calls `then` once, when the player is back on the title. */
  readonly onTitle: (then: () => void) => void;
  /** Told once a reload is on its way, at once or after the round. */
  readonly willReload?: () => void;
}

/**
 * Hears a chunk that failed to load and reloads the page, at once or, mid
 * round, once the player is back on the title: a reload never cuts a round
 * short. Each build reloads at most once a tab, so a chunk a reload can't
 * bring (offline, say) never loops: the error then takes its course, as
 * where storage can't remember the reload at all.
 */
export function reloadOnStaleBuild(deps: StaleBuildDeps): () => void {
  let waiting = false;
  return () => {
    if (waiting || deps.storage.getItem(RELOADED_KEY) === deps.version) {
      return;
    }
    // Remembered before anything else: a tab that can't remember never
    // reloads, so it never loops.
    deps.storage.setItem(RELOADED_KEY, deps.version);
    if (deps.storage.getItem(RELOADED_KEY) !== deps.version) return;
    waiting = true;
    deps.willReload?.();
    if (deps.inRound()) {
      deps.onTitle(deps.reload);
    } else {
      deps.reload();
    }
  };
}
