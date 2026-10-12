import { useEffect } from 'react';

/**
 * Pauses when the player looks away (another tab or app, a locked screen,
 * the window losing focus) or turns the phone: the turn and the new layout
 * take longer than a sweep. A round never runs on unseen.
 */
export function usePauseWhenHidden(pause: () => void): void {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    // Follows the screen's shape rather than screen.orientation, which
    // older Safari lacks; a window resized past square counts too.
    const portrait = matchMedia('(orientation: portrait)');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', pause);
    window.addEventListener('pagehide', pause);
    portrait.addEventListener('change', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', pause);
      window.removeEventListener('pagehide', pause);
      portrait.removeEventListener('change', pause);
    };
  }, [pause]);
}
