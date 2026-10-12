import { useEffect } from 'react';

import { poolFor, themeColorFor } from '../screens/studio';
import { useSession } from '../state/session';
import type { ThemeSetting } from '../state/settings';
import { framingFor, type RigMode } from '../three/camera';
import { useViewport } from './use-viewport';

// The page is the studio the watch is shot in: src/index.css paints it from
// the attributes and variables set here, and public/boot.js sets the same
// attributes from the saved settings before the first paint.

/**
 * Puts the page in the studio the settings ask for: a theme of its own or
 * the system's, with the lights out at night. The backdrop crossfades as
 * they change (src/index.css).
 */
export function usePageTheme(theme: ThemeSetting, night: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.dataset['theme'] = theme;
    root.toggleAttribute('data-night', night);
    // One meta for each system scheme, as index.html has them.
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]'
    )) {
      const scheme = meta.media.includes('dark') ? 'dark' : 'light';
      meta.content = themeColorFor(theme, night, scheme);
    }
  }, [theme, night]);
}

/**
 * Keeps the pool of light behind the watch as it moves between the title,
 * play and the results, and as the screen changes. Its first place matches
 * the stylesheet's, so a load never shows the light gliding in.
 */
export function useStudioPool(mode: RigMode): void {
  const viewport = useViewport();
  const textTop = useSession(state => state.textTop);
  const { box } = framingFor(mode, viewport, textTop);
  const { x, y } = poolFor(box);
  useEffect(() => {
    const { style } = document.documentElement;
    style.setProperty('--pool-x', `${String(x)}%`);
    style.setProperty('--pool-y', `${String(y)}%`);
  }, [x, y]);
}
