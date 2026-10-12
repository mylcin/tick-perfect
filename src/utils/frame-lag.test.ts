import { describe, expect, it } from 'vitest';

import { createFrameLag } from './frame-lag';

describe('createFrameLag', () => {
  it('trails the present by two frames once it has seen them', () => {
    const lag = createFrameLag(2);
    expect(lag(100)).toBe(100);
    expect(lag(116)).toBe(100);
    expect(lag(133)).toBe(100);
    expect(lag(150)).toBe(116);
    expect(lag(500)).toBe(133);
  });

  it('trails by as long as the frames took', () => {
    const lag = createFrameLag(2);
    [0, 300, 600].forEach(lag);
    expect(lag(900)).toBe(300);
  });

  it('can judge the present', () => {
    const lag = createFrameLag(0);
    expect(lag(10)).toBe(10);
    expect(lag(20)).toBe(20);
  });
});
