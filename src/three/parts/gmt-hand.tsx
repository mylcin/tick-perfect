import { useRef } from 'react';
import type { Group } from 'three';

import { rotate, signedDelta } from '../../game';
import type { WatchGeometry } from '../geometry/parts';
import { watchAngleToRotation } from '../layout';
import type { WatchMaterials } from '../materials';
import { useWatchFrame } from '../watch-frame';

/** Fastest the GMT hand moves on its own, in degrees per second. */
const MAX_SPEED = 90;
const GMT_HAND_Z = 0.061;
/** How quickly it glides to a new position when the game moves it. */
const GLIDE = 18;
/** Degrees off at which the glide counts as done. */
const SETTLED = 0.05;

/**
 * The GMT hand: exactly where the game has it while it sweeps, gliding
 * when a new target moves it (instantly with animations off). The game only
 * moves it between targets, well before the next window opens.
 */
export function GmtHand({
  geometry,
  materials,
  restAngle,
}: {
  geometry: NonNullable<WatchGeometry['gmtHand']>;
  materials: WatchMaterials;
  restAngle: number;
}) {
  const hand = useRef<Group>(null);
  const glide = useRef({ goal: restAngle, offset: 0 });

  useWatchFrame(({ pose, delta, reducedMotion, warmingUp }) => {
    const state = glide.current;
    const goal = pose.gmt ?? restAngle;
    // A jump in the game's own position (a new target moving the hand) is
    // eased out as an offset that fades; the sweep itself is followed
    // exactly, so the drawn hand never trails a gate.
    const jump = Math.abs(signedDelta(state.goal, goal));
    if (!reducedMotion && !warmingUp && jump > MAX_SPEED * delta + 1) {
      state.offset = signedDelta(goal, rotate(state.goal, state.offset));
    }
    state.offset *= Math.exp(-GLIDE * delta);
    if (reducedMotion || Math.abs(state.offset) < SETTLED) state.offset = 0;
    state.goal = goal;
    if (hand.current) {
      hand.current.rotation.z = watchAngleToRotation(
        rotate(goal, state.offset)
      );
    }
  });

  return (
    // Between the minute and seconds hands; its parts carry their own
    // heights, the hand riding on its dark outline.
    <group ref={hand} position-z={GMT_HAND_Z}>
      <mesh geometry={geometry.outline} material={materials.gmtOutline} />
      <mesh geometry={geometry.hand} material={materials.gmtHand} />
      {geometry.lume && (
        <mesh geometry={geometry.lume} material={materials.lume} />
      )}
    </group>
  );
}
