import { createContext, useContext, useEffect, useRef } from 'react';

import type { WatchPose } from './pose';

// The watch asks for its pose once per frame and hands it to every part
// that moves. Parts register here instead of running their own useFrame:
// a pose source may advance a game when asked (the attract-mode bot does),
// so it must be asked exactly once per frame.

export interface WatchFrame {
  readonly pose: WatchPose;
  /** performance.now() for this frame. */
  readonly now: number;
  /** Seconds since the last frame. */
  readonly delta: number;
  readonly reducedMotion: boolean;
  /** The first frames show every effect once, so its shader compiles. */
  readonly warmingUp: boolean;
}

type FrameUpdater = (frame: WatchFrame) => void;

interface FrameBus {
  readonly add: (updater: FrameUpdater) => () => void;
  readonly run: (frame: WatchFrame) => void;
}

export function createFrameBus(): FrameBus {
  const updaters = new Set<FrameUpdater>();
  return {
    add: updater => {
      updaters.add(updater);
      return () => {
        updaters.delete(updater);
      };
    },
    run: frame => {
      updaters.forEach(updater => {
        updater(frame);
      });
    },
  };
}

export const FrameBusContext = createContext<FrameBus | null>(null);

/** Runs `updater` on every frame of the watch it is inside. */
export function useWatchFrame(updater: FrameUpdater): void {
  const bus = useContext(FrameBusContext);
  const latest = useRef(updater);
  useEffect(() => {
    latest.current = updater;
  });
  useEffect(() => {
    if (!bus) return;
    return bus.add(frame => {
      latest.current(frame);
    });
  }, [bus]);
}
