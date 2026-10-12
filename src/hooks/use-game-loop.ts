import { useEffect, useRef } from 'react';

import type { GameController } from '../state/game-controller';
import { createFrameLag } from '../utils/frame-lag';

/**
 * Ticks the game on every animation frame while mounted, so a hand that
 * runs past its target ends the round even if nobody taps. It runs on its
 * own, apart from the 3D scene: the game keeps time even if the watch can't
 * be drawn.
 *
 * Each tick judges a moment a couple of frames back, not the present. After
 * long frames (a slow phone, a garbage collection) the browser may run
 * frames before the taps that arrived meanwhile; trailing a little lets
 * those taps be judged first, at their own timestamps, instead of the hand
 * being declared gone while they wait.
 */
export function useGameLoop(
  controller: GameController,
  onFrame?: (now: number) => void
): void {
  const frameCallback = useRef(onFrame);
  useEffect(() => {
    frameCallback.current = onFrame;
  });

  useEffect(() => {
    let frame = 0;
    const judgedAt = createFrameLag();
    const loop = () => {
      const now = performance.now();
      controller.dispatch({ type: 'tick', time: judgedAt(now) }, now);
      frameCallback.current?.(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [controller]);
}
