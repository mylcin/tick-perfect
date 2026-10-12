import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SceneFailure, SceneStatus } from '../state/session';
import { createSceneRecovery, RESTORE_WAIT_MS } from './use-scene-recovery';

/** A page that can be hidden and shown again. */
function fakePage() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: () => void) => {
      listeners.delete(listener);
    },
    set(state: DocumentVisibilityState) {
      this.visibilityState = state;
      listeners.forEach(listener => {
        listener();
      });
    },
    listeners,
  };
}

function recovery() {
  const scenes: [SceneStatus, SceneFailure?][] = [];
  const remount = vi.fn();
  const page = fakePage();
  const recover = createSceneRecovery(
    (status, failure) => {
      scenes.push(failure ? [status, failure] : [status]);
    },
    remount,
    page as unknown as Document
  );
  return { scenes, remount, recover, page };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSceneRecovery', () => {
  it('waits for a lost context, then mounts the scene again', () => {
    const { scenes, remount, recover } = recovery();
    recover.lost();
    expect(scenes).toEqual([['lost']]);
    vi.advanceTimersByTime(RESTORE_WAIT_MS - 1);
    recover.restored();
    expect(remount).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RESTORE_WAIT_MS);
    expect(scenes).toEqual([['lost']]);
  });

  it('gives up on a context that stays lost', () => {
    const { scenes, remount, recover } = recovery();
    recover.lost();
    vi.advanceTimersByTime(RESTORE_WAIT_MS);
    expect(scenes).toEqual([['lost'], ['failed', 'stopped']]);
    recover.restored();
    expect(remount).not.toHaveBeenCalled();
  });

  it('waits afresh each time the context is lost', () => {
    const { scenes, remount, recover } = recovery();
    recover.lost();
    recover.restored();
    vi.advanceTimersByTime(RESTORE_WAIT_MS / 2);
    recover.lost();
    vi.advanceTimersByTime(RESTORE_WAIT_MS - 1);
    expect(scenes).toEqual([['lost'], ['lost']]);
    recover.restored();
    expect(remount).toHaveBeenCalledTimes(2);
  });

  it('starts the clock only once a hidden page is shown again', () => {
    const { scenes, remount, recover, page } = recovery();
    page.set('hidden');
    recover.lost();
    vi.advanceTimersByTime(RESTORE_WAIT_MS * 5);
    expect(scenes).toEqual([['lost']]);
    page.set('visible');
    vi.advanceTimersByTime(RESTORE_WAIT_MS - 1);
    recover.restored();
    expect(remount).toHaveBeenCalledTimes(1);
    expect(page.listeners.size).toBe(0);
  });

  it('stops waiting for the page on dispose', () => {
    const { scenes, recover, page } = recovery();
    page.set('hidden');
    recover.lost();
    recover.dispose();
    expect(page.listeners.size).toBe(0);
    page.set('visible');
    vi.advanceTimersByTime(RESTORE_WAIT_MS);
    expect(scenes).toEqual([['lost']]);
  });

  it('ignores a restore it never waited for, and stops waiting on dispose', () => {
    const { scenes, remount, recover } = recovery();
    recover.restored();
    expect(remount).not.toHaveBeenCalled();
    recover.lost();
    recover.dispose();
    vi.advanceTimersByTime(RESTORE_WAIT_MS);
    expect(scenes).toEqual([['lost']]);
  });
});
