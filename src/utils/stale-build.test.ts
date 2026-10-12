import { describe, expect, it, vi } from 'vitest';

import { memoryStorage, type SyncStorage } from './safe-storage';
import { RELOADED_KEY, reloadOnStaleBuild } from './stale-build';

function page({
  storage = memoryStorage(),
  inRound = false,
}: { storage?: SyncStorage; inRound?: boolean } = {}) {
  const titles: (() => void)[] = [];
  const reload = vi.fn();
  const willReload = vi.fn();
  const onFailure = reloadOnStaleBuild({
    storage,
    version: '1.0.0+3f2c1ab',
    reload,
    inRound: () => inRound,
    onTitle: then => {
      titles.push(then);
    },
    willReload,
  });
  return {
    onFailure,
    reload,
    willReload,
    storage,
    backOnTitle: () => {
      titles.splice(0).forEach(then => {
        then();
      });
    },
  };
}

describe('reloadOnStaleBuild', () => {
  it('reloads once for any number of failed chunks', () => {
    const { onFailure, reload, storage } = page();
    onFailure();
    onFailure();
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.getItem(RELOADED_KEY)).toBe('1.0.0+3f2c1ab');
  });

  it('lets a chunk that still fails after the reload fail', () => {
    const storage = memoryStorage({ [RELOADED_KEY]: '1.0.0+3f2c1ab' });
    const { onFailure, reload } = page({ storage });
    onFailure();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads a later build that went stale in turn', () => {
    const storage = memoryStorage({ [RELOADED_KEY]: '1.0.0+9e8d7c6' });
    const { onFailure, reload } = page({ storage });
    onFailure();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('waits for the title to reload mid round', () => {
    const { onFailure, reload, backOnTitle } = page({ inRound: true });
    onFailure();
    onFailure();
    expect(reload).not.toHaveBeenCalled();
    backOnTitle();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('never reloads where storage can’t remember it did', () => {
    const forgetful: SyncStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const { onFailure, reload, willReload } = page({ storage: forgetful });
    onFailure();
    expect(reload).not.toHaveBeenCalled();
    expect(willReload).not.toHaveBeenCalled();
  });

  it('says a reload is coming only when one is', () => {
    const now = page();
    now.onFailure();
    expect(now.willReload).toHaveBeenCalledOnce();

    const later = page({ inRound: true });
    later.onFailure();
    later.onFailure();
    expect(later.willReload).toHaveBeenCalledOnce();

    const done = page({
      storage: memoryStorage({ [RELOADED_KEY]: '1.0.0+3f2c1ab' }),
    });
    done.onFailure();
    expect(done.willReload).not.toHaveBeenCalled();
  });
});
