import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { WatchId } from '../watches/ids';
import { appStore } from './app';
import { takeChallenge, type Challenge, type ChallengeLink } from './challenge';
import { COLLECTION_MODE, modeWatch, type RoundMode } from './modes';

// Where the player is in the app right now. Nothing here is saved.

export type Screen = 'title' | 'game';

/**
 * Whether the 3D watch can be shown: still loading, drawing, lost for a
 * while (the GPU took the WebGL context back and may return it), or not at
 * all.
 */
export type SceneStatus = 'loading' | 'ready' | 'lost' | 'failed';

/**
 * Why the watch can't be drawn: no WebGL here, its code didn't load, or it
 * stopped drawing (the GPU kept its context, or the scene broke).
 */
export type SceneFailure = 'webgl' | 'network' | 'stopped';

export interface SessionState {
  readonly screen: Screen;
  readonly settingsOpen: boolean;
  readonly timegrapherOpen: boolean;
  /** The boards, with signing in and out. */
  readonly leaderboardOpen: boolean;
  /** How to play. */
  readonly helpOpen: boolean;
  /** The atelier: each open watch's story and what is left to master. */
  readonly atelierOpen: boolean;
  readonly scene: SceneStatus;
  /** Why the scene failed; null unless it has. */
  readonly sceneFailure: SceneFailure | null;
  /** The watch is turned over on the title, to show its caseback. */
  readonly caseback: boolean;
  /** The game over results are on screen, so the watch makes room. */
  readonly resultShown: boolean;
  /**
   * Where the text under the watch starts (the title's column, or the
   * results), as a share of the screen's height; null while none is shown.
   */
  readonly textTop: number | null;
  /**
   * The watch on show: the one being played, or the one the collection is
   * looking at (which may still be locked).
   */
  readonly watch: WatchId;
  /** What the rounds being played are for. */
  readonly mode: RoundMode;
  /** The challenge a link brought, shown on the title until dismissed. */
  readonly challenge: Challenge | null;
  /** A link brought a challenge that can't be read; said until dismissed. */
  readonly invalidChallenge: boolean;
  /** The watch the title showed before a Daily or a challenge took over. */
  readonly titleWatch: WatchId;
  /** Plays the watch on show for the collection. */
  readonly play: () => void;
  /** Plays a Daily or a challenge, on its own watch. */
  readonly playMode: (mode: RoundMode) => void;
  readonly dismissChallenge: () => void;
  readonly showTitle: () => void;
  readonly focus: (watch: WatchId) => void;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly setTimegrapherOpen: (open: boolean) => void;
  readonly setLeaderboardOpen: (open: boolean) => void;
  readonly setHelpOpen: (open: boolean) => void;
  readonly setAtelierOpen: (open: boolean) => void;
  /** `failure` says why, for 'failed' (WebGL unless told otherwise). */
  readonly setScene: (status: SceneStatus, failure?: SceneFailure) => void;
  readonly setResultShown: (shown: boolean) => void;
  readonly setCaseback: (shown: boolean) => void;
  readonly setTextTop: (top: number | null) => void;
}

export function createSessionStore(
  initialWatch: WatchId,
  { challenge = null, invalid = false }: ChallengeLink = {}
) {
  return createStore<SessionState>()(set => ({
    screen: 'title',
    settingsOpen: false,
    timegrapherOpen: false,
    leaderboardOpen: false,
    helpOpen: false,
    atelierOpen: false,
    scene: 'loading',
    sceneFailure: null,
    caseback: false,
    resultShown: false,
    textTop: null,
    watch: initialWatch,
    mode: COLLECTION_MODE,
    challenge,
    invalidChallenge: invalid,
    titleWatch: initialWatch,
    play: () => {
      set({
        screen: 'game',
        caseback: false,
        mode: COLLECTION_MODE,
        settingsOpen: false,
        timegrapherOpen: false,
        leaderboardOpen: false,
        helpOpen: false,
        atelierOpen: false,
        resultShown: false,
      });
    },
    playMode: mode => {
      set(state => ({
        screen: 'game',
        caseback: false,
        mode,
        watch: modeWatch(mode) ?? state.watch,
        titleWatch: state.watch,
        settingsOpen: false,
        timegrapherOpen: false,
        leaderboardOpen: false,
        helpOpen: false,
        atelierOpen: false,
        resultShown: false,
      }));
    },
    dismissChallenge: () => {
      set({ challenge: null, invalidChallenge: false });
    },
    // Back to the watch the title showed: a Daily's or a challenge's watch
    // was only borrowed.
    showTitle: () => {
      set(state => ({
        screen: 'title',
        mode: COLLECTION_MODE,
        watch:
          state.mode.kind === 'collection' ? state.watch : state.titleWatch,
        resultShown: false,
      }));
    },
    focus: watch => {
      set({ watch });
    },
    setSettingsOpen: open => {
      set({ settingsOpen: open });
    },
    setTimegrapherOpen: open => {
      set({ timegrapherOpen: open });
    },
    setCaseback: shown => {
      set({ caseback: shown });
    },
    setLeaderboardOpen: open => {
      set({ leaderboardOpen: open });
    },
    setHelpOpen: open => {
      set({ helpOpen: open });
    },
    setAtelierOpen: open => {
      set({ atelierOpen: open });
    },
    // A failure is final: a late "ready" from a dying canvas can't undo it.
    setScene: (status, failure = 'webgl') => {
      set(state =>
        state.scene === 'failed'
          ? state
          : {
              scene: status,
              sceneFailure: status === 'failed' ? failure : null,
            }
      );
    },
    setResultShown: shown => {
      set({ resultShown: shown });
    },
    setTextTop: top => {
      set({ textTop: top });
    },
  }));
}

/**
 * Takes a challenge link's challenge into the session (never saved) and out
 * of the address bar, so a reload or a bookmark doesn't bring it back.
 */
function challengeFromAddress(): ChallengeLink {
  const { challenge, invalid, rest } = takeChallenge(window.location.search);
  if (rest !== null) {
    const { pathname, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${rest}${hash}`
    );
  }
  return { challenge, invalid };
}

/** Opens on the watch picked last time, with any challenge a link brought. */
export const sessionStore = createSessionStore(
  appStore.getState().selected,
  challengeFromAddress()
);

export function useSession<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector);
}
