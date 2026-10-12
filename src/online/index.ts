import { useStore } from 'zustand';

import { api } from './api';
import { AUTH_STORAGE_KEY, ONLINE } from './config';
import { createOnline, type OnlineState } from './online';

export type * from './online';
export { ONLINE } from './config';

/** The app's online side; inert in a build without one. */
export const online = createOnline({
  config: ONLINE,
  call: api,
  // Its own chunk, fetched only for a player who signs in.
  loadAuth: async config => (await import('./auth')).createAuth(config),
  hadSession: () => {
    try {
      return (
        localStorage.getItem(AUTH_STORAGE_KEY) !== null ||
        new URLSearchParams(location.search).has('code')
      );
    } catch {
      return false;
    }
  },
  now: () => Date.now(),
});

export function useOnline<T>(selector: (state: OnlineState) => T): T {
  return useStore(online.store, selector);
}
