import { useRef } from 'react';
import type { Group } from 'three';

import type { DialSlot } from '../../watches';
import type { WatchGeometry } from '../geometry/parts';
import { DIAL_SLOTS } from '../layout';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/** A real tourbillon cage turns once a minute. */
const CAGE_TURN_MS = 60_000;
/** The balance swings back and forth this many times a second. */
const BALANCE_HZ = 2.5;
const BALANCE_SWING = 1.1;

/**
 * The cage in its aperture: a three-armed bridge that turns once a minute
 * and a balance wheel swinging inside it. Both hold still with reduced
 * motion; neither has anything to do with the game.
 */
export function TourbillonCage({
  geometry,
  materials,
  slot,
  still,
}: {
  geometry: NonNullable<WatchGeometry['cage']>;
  materials: WatchMaterials;
  slot: DialSlot;
  still: boolean;
}) {
  const cage = useRef<Group>(null);
  const balance = useRef<Group>(null);
  const { x, y } = DIAL_SLOTS[slot];

  useWatchFrame(({ now, reducedMotion }) => {
    if (still || reducedMotion) return;
    if (cage.current) {
      cage.current.rotation.z =
        -((now % CAGE_TURN_MS) / CAGE_TURN_MS) * Math.PI * 2;
    }
    if (balance.current) {
      balance.current.rotation.z =
        Math.sin((now / 1000) * BALANCE_HZ * Math.PI * 2) * BALANCE_SWING;
    }
  });

  return (
    <group position={[x, y, 0]}>
      <group ref={cage}>
        <mesh geometry={geometry.bridge} material={materials.bridge} />
        <group ref={balance}>
          <mesh
            geometry={geometry.balance}
            material={materials.polishedMetal}
          />
        </group>
      </group>
    </group>
  );
}
