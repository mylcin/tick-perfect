import { describe, expect, it } from 'vitest';

import { shade } from './textures';

describe('shade', () => {
  it('darkens towards black and lightens towards white', () => {
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#123456', 0)).toBe('#123456');
    expect(shade('#ffffff', -1)).toBe('#000000');
    expect(shade('#000000', 1)).toBe('#ffffff');
  });
});
