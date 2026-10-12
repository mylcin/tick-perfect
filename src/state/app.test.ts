import { afterEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from '../utils/safe-storage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** The app's own stores, on a page whose localStorage can fill up. */
async function loadApp() {
  const backing = memoryStorage();
  const storage = { full: false };
  vi.stubGlobal('navigator', { languages: ['en'] });
  vi.stubGlobal('window', {
    addEventListener: () => undefined,
    localStorage: {
      ...backing,
      setItem: (name: string, value: string) => {
        if (storage.full) {
          throw new DOMException('Full', 'QuotaExceededError');
        }
        backing.setItem(name, value);
      },
    },
  });
  const app = await import('./app');
  return { ...app, storage };
}

describe('storageWorks', () => {
  it('turns false when a save fails, and true again once one works', async () => {
    const { appStore, storageWorks, storage } = await loadApp();
    expect(storageWorks.get()).toBe(true);

    storage.full = true;
    appStore.getState().recordScore('diver', 12);
    expect(storageWorks.get()).toBe(false);

    storage.full = false;
    appStore.getState().updateSettings({ night: true });
    expect(storageWorks.get()).toBe(true);
  });

  it('turns false when storage cannot be reached at all', async () => {
    const { appStore, storageWorks } = await loadApp();
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    appStore.getState().updateSettings({ sound: false });
    expect(storageWorks.get()).toBe(false);
    expect(appStore.getState().settings.sound).toBe(false);
  });
});
