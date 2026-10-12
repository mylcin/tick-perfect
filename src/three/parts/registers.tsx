import { useRef } from 'react';
import type { BufferGeometry, Group } from 'three';

import { easeAngle } from '../feedback';
import { watchAngleToRotation, type SlotLayout } from '../layout';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/** The counter laps once a second while a pair runs. */
const COUNTER_LAP_MS = 1000;
/** How fast the counter flies back to zero once a pair is stopped. */
const FLYBACK = 16;
const HAND_HEIGHT = 0.012;
const MINUTE_MS = 60_000;
/** Where a showroom watch holds its running seconds: on the 30. */
const SHOWROOM_SECONDS_ANGLE = 180;

/**
 * The stopwatch counter: still at zero, running between a pair's taps and
 * flying back after. A silhouette holds it still.
 */
export function CounterHand({
  at,
  hand,
  hub,
  materials,
  still,
}: {
  /** The register it turns in. */
  at: SlotLayout;
  hand: BufferGeometry;
  hub: BufferGeometry;
  materials: WatchMaterials;
  still: boolean;
}) {
  const turning = useRef<Group>(null);
  const angle = useRef(0);
  const { x, y } = at;

  useWatchFrame(({ pose, delta, reducedMotion }) => {
    if (still) return;
    const elapsed = pose.chrono?.elapsed ?? null;
    angle.current =
      elapsed !== null
        ? ((elapsed % COUNTER_LAP_MS) / COUNTER_LAP_MS) * 360
        : reducedMotion
          ? 0
          : easeAngle(angle.current, 0, FLYBACK, delta);
    if (turning.current) {
      turning.current.rotation.z = watchAngleToRotation(angle.current);
    }
  });

  return (
    <group position={[x, y, HAND_HEIGHT]}>
      <group ref={turning}>
        <mesh geometry={hand} material={materials.subdialHand} />
      </group>
      <mesh
        geometry={hub}
        material={materials.subdialHand}
        position-z={0.007}
      />
    </group>
  );
}

/**
 * The running seconds: the wall clock's seconds, swept smoothly. A
 * showroom watch or a silhouette holds it still, and so does every watch
 * with animations off: it is the one time-telling hand that visibly moves,
 * and none of the game hangs on it.
 */
export function SmallSecondsHand({
  at,
  hand,
  hub,
  materials,
  still,
}: {
  /** The register it turns in. */
  at: SlotLayout;
  hand: BufferGeometry;
  hub: BufferGeometry;
  materials: WatchMaterials;
  still: boolean;
}) {
  const turning = useRef<Group>(null);

  useWatchFrame(({ reducedMotion }) => {
    const angle =
      still || reducedMotion
        ? SHOWROOM_SECONDS_ANGLE
        : ((Date.now() % MINUTE_MS) / MINUTE_MS) * 360;
    if (turning.current) {
      turning.current.rotation.z = watchAngleToRotation(angle);
    }
  });

  return (
    <group position={[at.x, at.y, HAND_HEIGHT]}>
      <group ref={turning}>
        <mesh geometry={hand} material={materials.subdialHand} />
      </group>
      <mesh
        geometry={hub}
        material={materials.subdialHand}
        position-z={0.007}
      />
    </group>
  );
}

/** A perpetual calendar's date hand, pointing at today on its ring. */
export function DateHand({
  at,
  hand,
  hub,
  materials,
}: {
  /** The moon's sub-dial, which the date ring surrounds. */
  at: SlotLayout;
  hand: BufferGeometry;
  hub: BufferGeometry;
  materials: WatchMaterials;
}) {
  const { x, y } = at;
  const angle = ((new Date().getDate() - 1) / 31) * 360;
  return (
    <group position={[x, y, HAND_HEIGHT]}>
      <mesh
        geometry={hand}
        material={materials.subdialHand}
        rotation-z={watchAngleToRotation(angle)}
      />
      <mesh
        geometry={hub}
        material={materials.subdialHand}
        position-z={0.007}
      />
    </group>
  );
}
