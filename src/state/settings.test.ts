import { describe, expect, it } from 'vitest';

import { defaultSettings, isThemeSetting, THEME_SETTINGS } from './settings';

describe('defaultSettings', () => {
  it('follows the system for the theme and the motion', () => {
    expect(defaultSettings(['tr-TR'])).toEqual({
      sound: true,
      vibration: true,
      theme: 'system',
      night: false,
      reducedMotion: null,
      batterySaver: false,
      language: 'tr',
    });
  });
});

describe('isThemeSetting', () => {
  it('accepts the three themes only', () => {
    expect(THEME_SETTINGS.every(isThemeSetting)).toBe(true);
    for (const value of ['night', 'Light', '', null, undefined, 0]) {
      expect(isThemeSetting(value)).toBe(false);
    }
  });
});
