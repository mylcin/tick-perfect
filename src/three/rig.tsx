import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import { MathUtils, PerspectiveCamera, type Group } from 'three';

import { sessionStore } from '../state/session';
import { fitInBox, framingFor, type RigMode } from './camera';

export type { RigMode } from './camera';

const DAMPING = 4;
const DEFAULT_FOV = 26;

const POSES = {
  // A slow, tilted turn that shows off the case and the sunburst. Only a
  // touch of parallax: a watch that leans after the pointer looks as if it
  // could be grabbed and dragged.
  showcase: { tiltX: -0.42, swayY: 0.38, swaySpeed: 0.32, parallax: 0.05 },
  // Nearly face-on so the hand and target read clearly while playing.
  play: { tiltX: -0.1, swayY: 0, swaySpeed: 0, parallax: 0.05 },
  // Face-on and still above the results, so the crack shows.
  result: { tiltX: -0.16, swayY: 0, swaySpeed: 0, parallax: 0.04 },
} as const;

/**
 * Frames the watch for any viewport and moves it: a gentle turntable on the
 * title screen, face-on with a touch of pointer parallax in play, raised
 * above the results after a miss. With animations off it holds still and
 * changes framing without gliding. While `snap` is on (the watch is still
 * hidden) it goes straight to its framing and pose, so it is ready to show
 * at once instead of gliding into place unseen first.
 */
export function Rig({
  mode,
  reducedMotion,
  snap = false,
  children,
}: {
  mode: RigMode;
  reducedMotion: boolean;
  snap?: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);

  // Camera, size and pointer come from the frame state: R3F hands them over
  // to be mutated every frame.
  useFrame((state, delta) => {
    const { camera, size, pointer } = state;
    const aspect = size.width / Math.max(size.height, 1);
    const fov = camera instanceof PerspectiveCamera ? camera.fov : DEFAULT_FOV;
    // Read each frame: the text under the watch moves without a render.
    const { textTop } = sessionStore.getState();
    const framing = fitInBox({
      fov,
      aspect,
      ...framingFor(mode, size, textTop),
    });
    const ease = (from: number, to: number) =>
      reducedMotion || snap ? to : MathUtils.damp(from, to, DAMPING, delta);
    camera.position.z = ease(camera.position.z, framing.distance);

    const node = group.current;
    if (!node) return;
    node.position.x = ease(node.position.x, framing.x);
    node.position.y = ease(node.position.y, framing.y);
    const pose = POSES[mode];
    const time = state.clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    const goalX = pose.tiltX + motion * pointer.y * pose.parallax;
    // Turned over on the title, to show the caseback: half a turn about
    // the 12–6 axis, nearly flat on, with a little less sway.
    const turned = mode === 'showcase' && sessionStore.getState().caseback;
    const goalY =
      (turned ? Math.PI : 0) +
      motion *
        (Math.sin(time * pose.swaySpeed) * pose.swayY * (turned ? 0.4 : 1) +
          pointer.x * pose.parallax);
    node.rotation.x = ease(node.rotation.x, goalX);
    node.rotation.y = ease(node.rotation.y, goalY);
  });

  return <group ref={group}>{children}</group>;
}
