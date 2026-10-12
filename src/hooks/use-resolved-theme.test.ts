import { describe, expect, it, vi } from 'vitest';

import { resolveTheme, systemDarkStore } from './use-resolved-theme';

describe('resolveTheme', () => {
  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
  ] as const)('%s with a dark system %s → %s', (setting, dark, theme) => {
    expect(resolveTheme(setting, dark)).toBe(theme);
  });
});

/** A system colour scheme that can be switched, as matchMedia sees it. */
function fakeSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  const state = { dark };
  const matchMedia = (query: string) => {
    queries.push(query);
    return {
      get matches() {
        return state.dark;
      },
      addEventListener: (_: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: () => void) => {
        listeners.delete(listener);
      },
    } as unknown as MediaQueryList;
  };
  const switchTo = (next: boolean) => {
    state.dark = next;
    listeners.forEach(listener => {
      listener();
    });
  };
  return { matchMedia, listeners, queries, switchTo };
}

describe('systemDarkStore', () => {
  it('reads the system scheme and hears it change, until unsubscribed', () => {
    const system = fakeSystem(false);
    const store = systemDarkStore(system.matchMedia);
    expect(store.read()).toBe(false);
    expect(system.queries).toEqual(['(prefers-color-scheme: dark)']);

    const onChange = vi.fn();
    const unsubscribe = store.subscribe(onChange);
    system.switchTo(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.read()).toBe(true);
    expect(resolveTheme('system', store.read())).toBe('dark');

    unsubscribe();
    expect(system.listeners.size).toBe(0);
    system.switchTo(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
