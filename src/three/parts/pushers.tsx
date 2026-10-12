import { useRef } from 'react';
import type { BufferGeometry, Group } from 'three';

import { pusherAngles } from '../geometry/parts';
import { watchAngleToRotation } from '../layout';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

const PRESS_MS = 140;
const PRESS_DEPTH = 0.03;

/**
 * The chronograph pushers at 2 and 4 o'clock, or a digital's four buttons.
 * The top one presses in with each tap of a pair, as if it started and
 * stopped the stopwatch.
 */
export function Pushers({
  geometry,
  materials,
  caseRadius,
  axisZ,
  style,
}: {
  geometry: BufferGeometry;
  style: Parameters<typeof pusherAngles>[0];
  materials: WatchMaterials;
  caseRadius: number;
  /** Height of the pushers' axis, as the crown's. */
  axisZ: number;
}) {
  const start = useRef<Group>(null);

  useWatchFrame(({ pose, reducedMotion }) => {
    const { hit } = pose;
    const pressed =
      !reducedMotion &&
      hit !== null &&
      hit.leg !== 'single' &&
      hit.age < PRESS_MS;
    if (start.current) {
      start.current.position.x = pressed
        ? -PRESS_DEPTH * (1 - hit.age / PRESS_MS)
        : 0;
    }
  });

  return (
    <>
      {pusherAngles(style).map((angle, index) => (
        <group
          key={angle}
          rotation-z={watchAngleToRotation(angle) + Math.PI / 2}
        >
          <group ref={index === 0 ? start : null}>
            <mesh
              geometry={geometry}
              material={materials.polishedMetal}
              // Its inner face meets the case flank.
              position={[caseRadius, 0, axisZ]}
            />
          </group>
        </group>
      ))}
    </>
  );
}
