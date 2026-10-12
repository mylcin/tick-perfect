import { afterEach, describe, expect, it, vi } from 'vitest';

import { canVibrate, vibrate } from './haptics';

/** A browser with or without the Vibration API, touch and a coarse pointer. */
function device({
  api = true,
  touchPoints = 5,
  coarse = true,
}: { api?: boolean; touchPoints?: number; coarse?: boolean } = {}) {
  const shake = vi.fn(() => true);
  vi.stubGlobal('navigator', {
    maxTouchPoints: touchPoints,
    ...(api && { vibrate: shake }),
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)' && coarse,
    }))
  );
  return shake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canVibrate', () => {
  it('vibrates a phone that has the API', () => {
    const shake = device();
    expect(canVibrate()).toBe(true);
    vibrate([10, 20, 10]);
    expect(shake).toHaveBeenCalledWith([10, 20, 10]);
  });

  it('turns it off on a desktop, which has the API but nothing to shake', () => {
    const shake = device({ touchPoints: 0, coarse: false });
    expect(canVibrate()).toBe(false);
    vibrate(12);
    expect(shake).not.toHaveBeenCalled();
  });

  it('turns it off on a touchscreen laptop, whose main pointer is fine', () => {
    device({ touchPoints: 10, coarse: false });
    expect(canVibrate()).toBe(false);
  });

  it('turns it off without the API, as on iOS', () => {
    device({ api: false });
    expect(canVibrate()).toBe(false);
  });
});
