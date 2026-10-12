import { useEffect } from 'react';

import type { GameController } from '../state/game-controller';

export function isSpace(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key === ' ';
}

/** Escape, or the key labelled P on any layout. */
function isPauseKey(event: KeyboardEvent): boolean {
  return event.key === 'Escape' || event.key.toLowerCase() === 'p';
}

/**
 * Space taps, Escape or P pauses. Space belongs to the game while a round
 * runs (it never scrolls the page or presses a focused button); in the
 * pause and results dialogs it presses buttons as usual. Shortcuts with
 * Ctrl, Alt or Cmd (print, browser tabs) are left to the browser.
 */
export function useGameKeys(
  controller: GameController,
  {
    tap,
    pause,
    canPause,
  }: {
    tap: (timeStamp: number) => void;
    pause: () => void;
    /** Whether Escape or P pauses right now (playing, or counting down). */
    canPause: () => boolean;
  }
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const { phase } = controller.snapshot().state;
      if (isSpace(event)) {
        if (phase !== 'playing' && phase !== 'idle') return;
        event.preventDefault();
        if (phase === 'playing' && !event.repeat) tap(event.timeStamp);
        return;
      }
      if (isPauseKey(event) && canPause()) {
        event.preventDefault();
        // A held key pauses once; its repeats mustn't resume straight away.
        if (!event.repeat) pause();
      }
    };
    // Capture, so the game sees the key before a focused control does.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [controller, tap, pause, canPause]);
}
