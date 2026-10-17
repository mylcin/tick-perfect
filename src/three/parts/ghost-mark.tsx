import { useEffect, useMemo, useRef } from 'react';
import { RingGeometry, type Group } from 'three';

import { LAYOUT, watchAngleToRotation } from '../layout';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/** Where the mark rides: the dial's very edge, outside every marker. */
const MARK_RADIUS = LAYOUT.dialRadius - 0.045;
/** A small open ring: nothing on a dial is shaped like it, least of all a hand. */
const RING = { inner: 0.02, outer: 0.034 } as const;
/** On the dial, under every hand. */
const MARK_Z = 0.012;

/**
 * Where a raced ghost's seconds hand is, as a small ring at the dial's
 * edge: the player's own hand stays the only hand on the dial. Hidden
 * while there is no ghost, or once its round is over.
 */
export function GhostMark({ materials }: { materials: WatchMaterials }) {
  const mark = useRef<Group>(null);
  const geometry = useMemo(
    () => new RingGeometry(RING.inner, RING.outer, 32),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry]
  );

  useWatchFrame(({ pose }) => {
    const group = mark.current;
    if (!group) return;
    group.visible = pose.ghost !== null;
    if (pose.ghost !== null) {
      group.rotation.z = watchAngleToRotation(pose.ghost);
    }
  });

  return (
    <group ref={mark} position-z={MARK_Z} visible={false}>
      <mesh
        geometry={geometry}
        material={materials.ghostHand}
        position-y={MARK_RADIUS}
        renderOrder={1}
      />
    </group>
  );
}
