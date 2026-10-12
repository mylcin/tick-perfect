import { describe, expect, it, vi } from 'vitest';

import { whenVisible } from './when-visible';

describe('whenVisible', () => {
  function page(visibilityState: DocumentVisibilityState) {
    const listeners = new Set<() => void>();
    return {
      visibilityState,
      addEventListener: (_: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: () => void) => {
        listeners.delete(listener);
      },
      show() {
        this.visibilityState = 'visible';
        listeners.forEach(listener => {
          listener();
        });
      },
      listeners,
    };
  }

  it('runs at once on a page in view', () => {
    const then = vi.fn();
    whenVisible(then, page('visible') as unknown as Document);
    expect(then).toHaveBeenCalledOnce();
  });

  it('waits for a hidden page to come back, once', () => {
    const then = vi.fn();
    const hidden = page('hidden');
    whenVisible(then, hidden as unknown as Document);
    expect(then).not.toHaveBeenCalled();
    hidden.show();
    hidden.show();
    expect(then).toHaveBeenCalledOnce();
    expect(hidden.listeners.size).toBe(0);
  });

  it('can be called off while it waits', () => {
    const then = vi.fn();
    const hidden = page('hidden');
    const cancel = whenVisible(then, hidden as unknown as Document);
    cancel();
    hidden.show();
    expect(then).not.toHaveBeenCalled();
  });
});
