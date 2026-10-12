import { describe, expect, it } from 'vitest';

import { framingFor } from '../three/camera';
import { poolFor, THEME_COLORS, themeColorFor } from './studio';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

describe('poolFor', () => {
  it('lights the middle of the box the watch is framed in', () => {
    expect(poolFor({ top: 0.1, bottom: 0.5, left: 0, right: 1 })).toEqual({
      x: 50,
      y: 30,
    });
    expect(poolFor({ top: 0.12, bottom: 0.9, left: 0, right: 0.56 })).toEqual({
      x: 28,
      y: 51,
    });
  });

  it('rounds to a tenth of a percent', () => {
    expect(poolFor({ top: 0, bottom: 1 / 3, left: 0, right: 1 / 7 })).toEqual({
      x: 7.1,
      y: 16.7,
    });
  });

  // The stylesheet's first place for the pool (src/index.css), so a load
  // never shows it gliding over.
  it('starts where the stylesheet puts it on the title', () => {
    expect(poolFor(framingFor('showcase', DESKTOP).box)).toEqual({
      x: 28,
      y: 51,
    });
    // Upright, the title's text moves the box's foot up a little.
    const upright = poolFor(framingFor('showcase', PHONE, 0.46).box);
    expect(upright.x).toBe(50);
    expect(Math.abs(upright.y - 29)).toBeLessThanOrEqual(2);
  });

  it('follows the watch into play and the results', () => {
    expect(poolFor(framingFor('play', DESKTOP).box)).toEqual({
      x: 50,
      y: 44,
    });
    expect(poolFor(framingFor('result', DESKTOP).box)).toEqual({
      x: 27.5,
      y: 50,
    });
  });
});

describe('themeColorFor', () => {
  it('gives each meta its own scheme while following the system', () => {
    expect(themeColorFor('system', false, 'light')).toBe(THEME_COLORS.light);
    expect(themeColorFor('system', false, 'dark')).toBe(THEME_COLORS.dark);
  });

  it('gives every meta the chosen theme, or night, whatever the system', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(themeColorFor('light', false, scheme)).toBe(THEME_COLORS.light);
      expect(themeColorFor('dark', false, scheme)).toBe(THEME_COLORS.dark);
      expect(themeColorFor('light', true, scheme)).toBe(THEME_COLORS.night);
      expect(themeColorFor('system', true, scheme)).toBe(THEME_COLORS.night);
    }
  });
});
