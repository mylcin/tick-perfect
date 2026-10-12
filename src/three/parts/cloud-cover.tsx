import { useEffect, useRef } from 'react';
import { MathUtils, type BufferGeometry, type Mesh } from 'three';

import { cloudGeometry } from '../geometry/cloud';
import { setCloudOpacity, type WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/** Above the hands, under the crystal: the hand flies on beneath it. */
const CLOUD_Z = 0.1;
/** Its thickest: a mist the hand still shows through. */
const CLOUD_OPACITY = 0.5;
/** How quickly it rolls in (about 0.1 s), and drifts away (about 0.6 s). */
const ROLL_IN = 20;
const CLEAR = 4;
/** Thin enough to swap for the next sweep's cloud without a jump. */
const SWAP_AT = 0.02;
/** Shown while the watch warms up, so its shader compiles then. */
const WARM_UP = { from: 0, length: 90 } as const;

/**
 * The cloud a Pilot's seconds hand flies through: built for each clouded
 * sweep across the stretch ahead of the marker, thickening as the hand
 * comes on and drifting away once it is through. A cloud still in view
 * clears before the next sweep's takes its place. The game's own motion,
 * so it plays even with animations off.
 */
export function CloudCover({ materials }: { materials: WatchMaterials }) {
  const mesh = useRef<Mesh>(null);
  const shown = useRef({
    key: '',
    geometry: null as BufferGeometry | null,
    density: 0,
  });

  useEffect(
    () => () => {
      shown.current.geometry?.dispose();
    },
    []
  );

  useWatchFrame(({ pose, delta, warmingUp }) => {
    const state = shown.current;
    const span = warmingUp ? WARM_UP : pose.cloud;
    const key = span
      ? `${span.from.toFixed(3)}:${span.length.toFixed(3)}`
      : state.key;
    // Another cloud waits while this one clears.
    if (
      key !== state.key &&
      (state.geometry === null || state.density < SWAP_AT)
    ) {
      state.geometry?.dispose();
      state.geometry = span ? cloudGeometry(span.from, span.length) : null;
      state.key = key;
      if (mesh.current && state.geometry) {
        mesh.current.geometry = state.geometry;
      }
    }
    const waiting = key !== state.key;
    const goal = warmingUp ? 1 : waiting ? 0 : (pose.cloud?.density ?? 0);
    state.density = warmingUp
      ? goal
      : MathUtils.damp(
          state.density,
          goal,
          goal > state.density ? ROLL_IN : CLEAR,
          delta
        );
    setCloudOpacity(materials, state.density * CLOUD_OPACITY);
    if (mesh.current) {
      mesh.current.visible = state.geometry !== null && state.density > 0.005;
    }
  });

  return (
    <mesh
      ref={mesh}
      material={materials.cloud}
      position-z={CLOUD_Z}
      renderOrder={5}
      visible={false}
    />
  );
}
