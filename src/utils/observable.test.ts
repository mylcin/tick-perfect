import { describe, expect, it, vi } from 'vitest';

import { createObservable } from './observable';

describe('createObservable', () => {
  it('reads and updates its value', () => {
    const score = createObservable(0);
    score.set(3);
    expect(score.get()).toBe(3);
  });

  it('notifies subscribers of changes only', () => {
    const score = createObservable(0);
    const listener = vi.fn();
    score.subscribe(listener);
    score.set(1);
    score.set(1);
    score.set(2);
    expect(listener.mock.calls).toEqual([[1], [2]]);
  });

  it('stops notifying after unsubscribe', () => {
    const score = createObservable(0);
    const listener = vi.fn();
    const unsubscribe = score.subscribe(listener);
    unsubscribe();
    score.set(5);
    expect(listener).not.toHaveBeenCalled();
  });
});
