/** The synchronous subset of Web Storage the app saves through. */
export interface SyncStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

/**
 * Web Storage that never throws. Private modes, blocked cookies and full
 * quotas make localStorage throw; the game then keeps its state in memory
 * for the session instead of failing. `onSave` hears whether each write
 * reached storage, so the player can be told when progress isn't kept.
 */
export function safeStorage(
  getStorage: () => Storage,
  onSave: (saved: boolean) => void = () => undefined
): SyncStorage {
  return {
    getItem(name) {
      try {
        return getStorage().getItem(name);
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      try {
        getStorage().setItem(name, value);
        onSave(true);
      } catch {
        // Not saved; the in-memory state carries on.
        onSave(false);
      }
    },
    removeItem(name) {
      try {
        getStorage().removeItem(name);
      } catch {
        // Nothing to remove from.
      }
    },
  };
}

/** A Storage-like map, for tests and environments without localStorage. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (name: string) => items.get(name) ?? null,
    setItem: (name: string, value: string) => {
      items.set(name, value);
    },
    removeItem: (name: string) => {
      items.delete(name);
    },
    items,
  } satisfies SyncStorage & { items: Map<string, string> };
}
