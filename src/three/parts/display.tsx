import { useEffect, useRef } from 'react';
import type { BufferGeometry } from 'three';

import type { Observable } from '../../utils/observable';
import { SHOWROOM_TIME } from '../layout';
import { displayKey, type DisplayContent } from '../lcd';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/** Just above the dial print, under everything on the dial. */
const DISPLAY_Z = 0.002;
/** How long a beat's flash takes to fade, in ms. */
const FLASH_MS = 140;

/**
 * An analog-digital's windows, live: the score, and the time to the
 * second or a countdown's beats, the light flashing on each beat.
 * Repainted only when what they show changes.
 */
export function Display({
  geometry,
  materials,
  score,
  showroom,
}: {
  geometry: BufferGeometry;
  materials: WatchMaterials;
  score: Observable<number>;
  showroom: boolean;
}) {
  const shown = useRef({ key: '', score: score.get() });

  // New materials (another variant) start blank: paint them at once.
  useEffect(() => {
    shown.current.key = '';
  }, [materials]);
  useEffect(() => {
    shown.current.score = score.get();
    return score.subscribe(value => {
      shown.current.score = value;
    });
  }, [score]);

  useWatchFrame(({ pose }) => {
    const state = shown.current;
    const date = new Date();
    const time = showroom
      ? SHOWROOM_TIME
      : {
          hours: date.getHours(),
          minutes: date.getMinutes(),
          seconds: date.getSeconds(),
        };
    const content: DisplayContent = {
      score: state.score,
      main:
        pose.countdown === null
          ? { kind: 'time', ...time }
          : { kind: 'count', count: pose.countdown.count },
    };
    materials.lightDisplay({
      flash: pose.countdown
        ? Math.exp(-pose.countdown.sinceBeat / FLASH_MS)
        : 0,
    });
    const key = displayKey(content);
    if (key === state.key) return;
    state.key = key;
    materials.showDisplay(content);
  });

  return materials.display ? (
    <mesh
      geometry={geometry}
      material={materials.display}
      position-z={DISPLAY_Z}
    />
  ) : null;
}
