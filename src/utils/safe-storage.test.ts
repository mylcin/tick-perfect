import { describe, expect, it } from 'vitest';

import { memoryStorage, safeStorage } from './safe-storage';

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('Blocked', 'SecurityError');
  };
  return {
    length: 0,
    clear: fail,
    key: fail,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  };
}

describe('safeStorage', () => {
  it('passes reads and writes through', () => {
    const backing = memoryStorage();
    const storage = safeStorage(() => backing as unknown as Storage);
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
  });

  it('swallows a storage that throws', () => {
    const storage = safeStorage(throwingStorage);
    expect(() => {
      storage.setItem('a', '1');
    }).not.toThrow();
    expect(storage.getItem('a')).toBeNull();
    expect(() => {
      storage.removeItem('a');
    }).not.toThrow();
  });

  it('reports whether each write reached storage', () => {
    const saves: boolean[] = [];
    const record = (saved: boolean) => {
      saves.push(saved);
    };
    safeStorage(() => memoryStorage() as unknown as Storage, record).setItem(
      'a',
      '1'
    );
    safeStorage(throwingStorage, record).setItem('a', '1');
    expect(saves).toEqual([true, false]);
  });

  it('swallows a storage that cannot even be reached', () => {
    const storage = safeStorage(() => {
      throw new DOMException('No access', 'SecurityError');
    });
    expect(storage.getItem('a')).toBeNull();
    expect(() => {
      storage.setItem('a', '1');
    }).not.toThrow();
  });
});
