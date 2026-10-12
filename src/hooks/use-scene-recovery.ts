import { useEffect, useState } from 'react';

import type { SessionState } from '../state/session';
import { whenVisible } from '../utils/when-visible';

/**
 * How long the GPU has to give a lost WebGL context back, once the page is
 * in view, before the watch counts as gone for good.
 */
export const RESTORE_WAIT_MS = 3000;

interface SceneRecovery {
  /** The canvas lost its context: the scene waits for it. */
  readonly lost: () => void;
  /** The context is back: the scene mounts again. */
  readonly restored: () => void;
  readonly dispose: () => void;
}

/**
 * Takes the scene through a lost WebGL context: 'lost' at once, then
 * remounted when the context returns, or 'failed' if it doesn't in time.
 * (The remounted scene reports 'ready' once it draws.) A hidden page may
 * only get its context back once shown, so the clock starts then.
 */
export function createSceneRecovery(
  setScene: SessionState['setScene'],
  remount: () => void,
  page?: Parameters<typeof whenVisible>[1]
): SceneRecovery {
  let waiting: (() => void) | null = null;
  const stopWaiting = () => {
    waiting?.();
    waiting = null;
  };
  return {
    lost: () => {
      stopWaiting();
      setScene('lost');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cancelShown = whenVisible(() => {
        timer = setTimeout(() => {
          waiting = null;
          setScene('failed', 'stopped');
        }, RESTORE_WAIT_MS);
      }, page);
      waiting = () => {
        cancelShown();
        clearTimeout(timer);
      };
    },
    restored: () => {
      // Too late, or never lost: a failure stays a failure.
      if (waiting === null) return;
      stopWaiting();
      remount();
    },
    dispose: stopWaiting,
  };
}

/**
 * Recovers the scene from a lost WebGL context. `generation` changes each
 * time it must be mounted again, for use as its key.
 */
export function useSceneRecovery(setScene: SessionState['setScene']) {
  const [generation, setGeneration] = useState(0);
  const [recovery] = useState(() =>
    createSceneRecovery(setScene, () => {
      setGeneration(count => count + 1);
    })
  );
  useEffect(() => recovery.dispose, [recovery]);
  return { generation, onLost: recovery.lost, onRestored: recovery.restored };
}
