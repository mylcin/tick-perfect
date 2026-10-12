import type { Theme } from '../hooks/use-resolved-theme';
import type { ThemeSetting } from '../state/settings';
import type { Box } from '../three/camera';

// The page is the studio the watch is shot in (src/index.css). What it
// shows, worked out here; src/hooks/use-studio.ts puts it on the page.

/**
 * The browser's own colour around the page (its bar, the status bar) in
 * each studio: the backdrop's edge, so the two run together. The same as
 * --studio-edge in src/index.css, the theme-color metas in index.html and
 * public/boot.js.
 */
export const THEME_COLORS: Readonly<Record<Theme | 'night', string>> = {
  light: '#E2DED6',
  dark: '#0C0D0E',
  night: '#050506',
};

/**
 * What the theme-color meta for the system's `scheme` says: the studio the
 * settings force on the page, or else the scheme's own.
 */
export function themeColorFor(
  theme: ThemeSetting,
  night: boolean,
  scheme: Theme
): string {
  if (night) return THEME_COLORS.night;
  return THEME_COLORS[theme === 'system' ? scheme : theme];
}

/**
 * Where the backdrop's pool of light sits: behind the middle of the box the
 * watch is framed in, as percentages of the screen.
 */
export function poolFor(box: Box): { x: number; y: number } {
  const percent = (fraction: number) => Math.round(fraction * 1000) / 10;
  return {
    x: percent((box.left + box.right) / 2),
    y: percent((box.top + box.bottom) / 2),
  };
}
