import { useSyncExternalStore } from 'react';

import type { ThemeSetting } from '../state/settings';

/** The studio the page is in: the light seamless or the dark one. */
export type Theme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

/** The theme a setting comes to, given whether the system is dark. */
export function resolveTheme(
  setting: ThemeSetting,
  systemDark: boolean
): Theme {
  if (setting !== 'system') return setting;
  return systemDark ? 'dark' : 'light';
}

/**
 * Whether the system is set to dark, as an external store: read at once,
 * and heard again whenever it changes (by hand, or at sunset).
 */
export function systemDarkStore(matchMedia: (query: string) => MediaQueryList) {
  return {
    subscribe: (onChange: () => void) => {
      const media = matchMedia(QUERY);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    read: () => matchMedia(QUERY).matches,
  };
}

const systemDark = systemDarkStore(query => window.matchMedia(query));

/** The theme `setting` comes to now, following the system's live. */
export function useResolvedTheme(setting: ThemeSetting): Theme {
  const dark = useSyncExternalStore(
    systemDark.subscribe,
    systemDark.read,
    () => false
  );
  return resolveTheme(setting, dark);
}
