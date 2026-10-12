import { useMemo, useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => {
  window.addEventListener('resize', listener);
  return () => {
    window.removeEventListener('resize', listener);
  };
};
const read = () => `${String(window.innerWidth)}x${String(window.innerHeight)}`;

/** The window's size in CSS pixels, following every resize. */
export function useViewport(): { width: number; height: number } {
  const size = useSyncExternalStore(subscribe, read);
  return useMemo(() => {
    const [width = 0, height = 0] = size.split('x').map(Number);
    return { width, height };
  }, [size]);
}
