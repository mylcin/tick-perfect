import { useRef } from 'react';
import type { BufferGeometry, Group } from 'three';

import { watchAngleToRotation } from '../layout';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/**
 * A raced ghost's seconds hand: the hand's own shape and colour, see-through,
 * just under the real one, exactly where the ghost's round has it. Hidden
 * while there is no ghost, or once its round is over.
 */
export function GhostHand({
  geometry,
  materials,
  z,
}: {
  geometry: BufferGeometry;
  materials: WatchMaterials;
  z: number;
}) {
  const hand = useRef<Group>(null);

  useWatchFrame(({ pose }) => {
    const group = hand.current;
    if (!group) return;
    group.visible = pose.ghost !== null;
    if (pose.ghost !== null) {
      group.rotation.z = watchAngleToRotation(pose.ghost);
    }
  });

  return (
    <group ref={hand} position-z={z} visible={false}>
      <mesh
        geometry={geometry}
        material={materials.ghostHand}
        renderOrder={1}
      />
    </group>
  );
}
