import { detectLanguage, type Language } from '../i18n';

/**
 * The studio's colours: the light or the dark seamless, or whichever the
 * system is set to (and following it as it changes).
 */
export type ThemeSetting = 'system' | 'light' | 'dark';

export const THEME_SETTINGS: readonly ThemeSetting[] = [
  'system',
  'light',
  'dark',
];

export function isThemeSetting(value: unknown): value is ThemeSetting {
  return THEME_SETTINGS.some(theme => theme === value);
}

export interface Settings {
  readonly sound: boolean;
  readonly vibration: boolean;
  readonly theme: ThemeSetting;
  /**
   * The lume-lit night presentation: the lights go out in either theme's
   * studio.
   */
  readonly night: boolean;
  /**
   * Animations off: nothing moves or fades for show, only the game's own
   * motion plays (the hand, the turning ring, the GMT hand, the stopwatch,
   * a target hiding, the Tourbillon's sway). An explicit choice, or `null`
   * to follow the system's reduce-motion setting. Saved under its old name,
   * so earlier saves keep loading.
   */
  readonly reducedMotion: boolean | null;
  /**
   * The watch drawn at the cheapest quality (no glow, no extra pixels),
   * however much the device could manage, to spare its battery. A choice
   * for this device, so it stays here with the others, never synced.
   */
  readonly batterySaver: boolean;
  readonly language: Language;
}

export function defaultSettings(
  preferredLanguages: readonly string[]
): Settings {
  return {
    sound: true,
    vibration: true,
    theme: 'system',
    night: false,
    reducedMotion: null,
    batterySaver: false,
    language: detectLanguage(preferredLanguages),
  };
}
