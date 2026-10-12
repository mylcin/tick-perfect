import { describe, expect, it, vi } from 'vitest';

import { createFrameBus, type WatchFrame } from './watch-frame';

const FRAME = { now: 1, delta: 0.016 } as unknown as WatchFrame;

describe('createFrameBus', () => {
  it('runs every registered updater with the frame', () => {
    const bus = createFrameBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.add(first);
    bus.add(second);
    bus.run(FRAME);
    expect(first).toHaveBeenCalledWith(FRAME);
    expect(second).toHaveBeenCalledWith(FRAME);
  });

  it('stops running an updater once it is removed', () => {
    const bus = createFrameBus();
    const updater = vi.fn();
    const remove = bus.add(updater);
    remove();
    bus.run(FRAME);
    expect(updater).not.toHaveBeenCalled();
  });
});
