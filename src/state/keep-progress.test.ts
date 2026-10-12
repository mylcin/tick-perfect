import { describe, expect, it, vi } from 'vitest';

import {
  persistStorage,
  shouldPersist,
  shouldSuggestHomeScreen,
} from './keep-progress';
import { INITIAL_PROGRESS, type Progress } from './progress';

const EARNED: Progress = {
  best: { diver: 15 },
  unlocked: ['diver', 'chronograph'],
  points: 150,
};

describe('shouldPersist', () => {
  it('asks once, as soon as a watch is earned', () => {
    expect(shouldPersist(INITIAL_PROGRESS, [])).toBe(false);
    expect(shouldPersist(EARNED, [])).toBe(true);
    expect(shouldPersist(EARNED, ['persist'])).toBe(false);
  });
});

describe('shouldSuggestHomeScreen', () => {
  it('suggests it in a Safari tab on iOS, after an unlock, until dismissed', () => {
    const tab = { standalone: false };
    expect(shouldSuggestHomeScreen(EARNED, [], tab)).toBe(true);
    expect(shouldSuggestHomeScreen(INITIAL_PROGRESS, [], tab)).toBe(false);
    expect(shouldSuggestHomeScreen(EARNED, ['homeScreen'], tab)).toBe(false);
  });

  it('leaves the Home Screen app and every other browser alone', () => {
    expect(shouldSuggestHomeScreen(EARNED, [], { standalone: true })).toBe(
      false
    );
    expect(shouldSuggestHomeScreen(EARNED, [], {})).toBe(false);
  });
});

describe('persistStorage', () => {
  it('asks the browser to keep the site’s storage', () => {
    const persist = vi.fn(() => Promise.resolve(true));
    persistStorage({ persist });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('carries on where it is missing, refused or not allowed', async () => {
    expect(() => {
      persistStorage(undefined);
    }).not.toThrow();
    expect(() => {
      persistStorage({});
    }).not.toThrow();
    const refused = vi.fn(() => Promise.reject(new Error('Refused')));
    persistStorage({ persist: refused });
    await Promise.resolve();
    expect(() => {
      persistStorage({
        persist: () => {
          throw new DOMException('Blocked', 'SecurityError');
        },
      });
    }).not.toThrow();
  });
});
