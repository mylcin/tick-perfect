import { Lightformer } from '@react-three/drei';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  AdditiveBlending,
  DoubleSide,
  HalfFloatType,
  MathUtils,
  Scene,
  WebGLCubeRenderTarget,
  type AmbientLight,
  type CubeCamera,
  type MeshBasicMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';

import { STUDIO_HDRI } from './studio-hdri';
import { softboxTexture } from './textures';
import { useHdri } from './use-hdri';

/**
 * The page's studio the watch sits in: the light or dark seamless, or the
 * dark one with the lights out (night mode).
 */
export type Backdrop = 'light' | 'dark' | 'night';

/**
 * The environment's level in each studio. A bright backdrop lights the
 * watch a touch more, as a pale sweep bounces more light back at it; at
 * night only a glimmer is left, so the lume carries the dial.
 */
const LEVELS: Readonly<Record<Backdrop, number>> = {
  light: 1,
  dark: 0.85,
  night: 0.12,
};
const FADE_DAMPING = 3;
/**
 * The front card's level in each studio (FrontCard): only the light one
 * has it; the dark ones keep their contrasty look.
 */
const FRONT_LEVELS: Readonly<Record<Backdrop, number>> = {
  light: 0.35,
  dark: 0,
  night: 0,
};
/** Near enough its level for the card to stop being captured again. */
const FRONT_SETTLED = 0.005;
/**
 * Capped (in the file) so they don't flare off every polished edge, the
 * HDRI's bulbs no longer give the painted parts most of their light, so a
 * flat fill gives it back: it lights only what diffuses light (dials,
 * prints, hands, straps) and is mirrored by nothing. A share of the
 * environment's level, so it dims with it at night. (A hemisphere light
 * would shade by normal, but it flared into a white blob on the hands'
 * central cap.)
 */
const FILL_PER_LEVEL = 2;
/** Each softbox fades over most of its face, so nothing mirrors an edge. */
const SOFTBOX_FEATHER = 0.85;

/** Turns the HDRI so the dark curtains sit behind the camera. */
const ENVIRONMENT_TURN = Math.PI / 2;

/** Fills the room like the HDRI does, so swapping to it doesn't pop. */
const FALLBACK_FILL = '#4b4e53';
const RESOLUTION = 256;

type Triple = [number, number, number];

/**
 * Softboxes placed for the shot, in world coordinates (the group undoes the
 * environment's turn): a broad high strip to the right lays a band along the
 * bezel and case, a panel beside the camera gives the case its silver and
 * the dial a faint sheen face-on, a side panel grazes the left flank and
 * two behind the watch light the flanks facing away. A broad, dim ceiling
 * and floor fill the room the capped bulbs left dark, so mirror-polished
 * cases read as bright metal rather than black chrome. Every face fades to
 * its rim, so the crystal and the polish mirror a glow, never a rectangle.
 */
const SOFTBOXES: readonly {
  intensity: number;
  position: Triple;
  scale: Triple;
}[] = [
  { intensity: 3.1, position: [2.2, 6, 0], scale: [10, 4.5, 1] },
  { intensity: 2, position: [2.4, 2, 6], scale: [3.2, 7, 1] },
  { intensity: 1.1, position: [-2.5, 0, 6], scale: [5, 10, 1] },
  { intensity: 1.2, position: [-2.5, 1, -6], scale: [4, 10, 1] },
  { intensity: 0.95, position: [1, 3, -6], scale: [9, 5, 1] },
  { intensity: 0.7, position: [0, 7, 2], scale: [22, 14, 1] },
  { intensity: 0.35, position: [0, -6, 3], scale: [22, 10, 1] },
];

/** The softboxes, each a feathered card facing the watch. */
function KeyLights({ face }: { face: Texture }) {
  return (
    <group rotation-y={-ENVIRONMENT_TURN}>
      {SOFTBOXES.map(({ intensity, position, scale }) => (
        <Lightformer
          key={position.join()}
          form="rect"
          map={face}
          intensity={intensity}
          position={position}
          scale={scale}
          target={[0, 0, 0]}
        />
      ))}
    </group>
  );
}

/**
 * A broad, dim card behind the camera, for the light studio. Face-on, the
 * polished case and bracelet mirror what is behind the camera, the HDRI's
 * dark curtains, and on an ivory sweep that reads as black chrome. Its
 * light adds to the room's (at nothing it changes nothing), and it leaves
 * the room in the dark studios, so they look as they always have. Studio
 * sets its level.
 */
function FrontCard({
  face,
  ref,
}: {
  face: Texture;
  ref: Ref<MeshBasicMaterial>;
}) {
  return (
    <group rotation-y={-ENVIRONMENT_TURN}>
      <mesh position={[0, 2.5, 8]} scale={[14, 10, 1]}>
        <planeGeometry />
        <meshBasicMaterial
          ref={ref}
          map={face}
          color="black"
          visible={false}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Puts the front card at `level`, out of the room at nothing. */
function setFront(card: MeshBasicMaterial, level: number) {
  card.color.setScalar(level);
  card.visible = level > 0;
}

/**
 * Stands in for the HDRI until it has downloaded, and for good if it never
 * arrives: a grey room with a dim ceiling, a floor bounce and one softbox.
 */
function FallbackRoom() {
  return (
    <>
      <color attach="background" args={[FALLBACK_FILL]} />
      <Lightformer
        form="rect"
        intensity={0.6}
        position={[0, 8, -2]}
        scale={[22, 12, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        position={[0, -7, 1]}
        scale={[22, 8, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="circle"
        intensity={2}
        position={[4, 3, 4]}
        scale={1.6}
        target={[0, 0, 0]}
      />
    </>
  );
}

/**
 * Captures `room`, over `map` when there is one, into `cube`'s render
 * target, and lights `scene` with it.
 */
function light(
  gl: WebGLRenderer,
  scene: Scene,
  room: Scene,
  cube: CubeCamera,
  map: Texture | null
) {
  if (map) room.background = map;
  const autoClear = gl.autoClear;
  gl.autoClear = true;
  cube.update(gl, room);
  gl.autoClear = autoClear;
  scene.environment = cube.renderTarget.texture;
  scene.environmentRotation.set(0, ENVIRONMENT_TURN, 0);
}

function unlight(scene: Scene) {
  scene.environment = null;
}

/**
 * Lights the scene with `children`, a little scene of its own, captured
 * into a cube map whenever they change, over `map` when there is one, or
 * when `ref`'s function is called. (What drei's EnvironmentPortal does,
 * without the file loaders it brings along.)
 */
function EnvironmentCapture({
  map,
  ref,
  children,
}: {
  map: Texture | null;
  ref?: Ref<() => void>;
  children: ReactNode;
}) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const [room] = useState(() => new Scene());
  const [target] = useState(() => {
    const cube = new WebGLCubeRenderTarget(RESOLUTION);
    cube.texture.type = HalfFloatType;
    return cube;
  });
  const camera = useRef<CubeCamera>(null);
  useEffect(
    () => () => {
      target.dispose();
    },
    [target]
  );

  useLayoutEffect(() => {
    if (camera.current) light(gl, scene, room, camera.current, map);
    return () => {
      unlight(scene);
    };
  }, [children, map, room, scene, gl]);
  useImperativeHandle(
    ref,
    () => () => {
      if (camera.current) light(gl, scene, room, camera.current, map);
    },
    [map, room, scene, gl]
  );

  return createPortal(
    <>
      {children}
      <cubeCamera ref={camera} args={[0.1, 1000, target]} />
    </>,
    room
  );
}

/**
 * Image-based studio lighting with a soft fill, changing level smoothly with
 * the backdrop (at once with animations off).
 *
 * One capture serves both the fallback room and the HDRI: when the HDRI
 * arrives only its contents change, so it re-captures into the same render
 * target (no shader recompiles, nothing left behind) with the same rotation
 * and resolution (no jump in exposure).
 */
export function Studio({
  backdrop,
  reducedMotion = false,
  onLit,
}: {
  backdrop: Backdrop;
  reducedMotion?: boolean;
  /** Called once the studio HDRI is lighting the scene. */
  onLit?: () => void;
}) {
  const hdri = useHdri(STUDIO_HDRI);
  useEffect(() => {
    if (hdri) onLit?.();
  }, [hdri, onLit]);

  const face = useMemo(() => softboxTexture(SOFTBOX_FEATHER), []);
  useEffect(
    () => () => {
      face.dispose();
    },
    [face]
  );

  // The cube is captured again whenever its contents change identity, so
  // they are rebuilt only when the HDRI arrives.
  const front = useRef<MeshBasicMaterial>(null);
  const contents = useMemo(
    () => (
      <>
        <KeyLights face={face} />
        <FrontCard face={face} ref={front} />
        {!hdri && <FallbackRoom />}
      </>
    ),
    [hdri, face]
  );
  const capture = useRef<() => void>(null);

  // A change of backdrop changes levels, never the room's contents at a
  // stroke: those would be captured again in one step, and pop.
  const level = useRef(LEVELS[backdrop]);
  const fill = useRef<AmbientLight>(null);
  // The card starts out of the room, as drawn, and goes straight to its
  // first level; after that it glides with the studio, the room captured
  // again each frame until it settles (a little work, for a moment).
  const frontLevel = useRef(0);
  const started = useRef(false);
  useFrame(({ scene }, delta) => {
    const goal = LEVELS[backdrop];
    level.current = reducedMotion
      ? goal
      : MathUtils.damp(level.current, goal, FADE_DAMPING, delta);
    scene.environmentIntensity = level.current;
    if (fill.current) fill.current.intensity = level.current * FILL_PER_LEVEL;

    const frontGoal = FRONT_LEVELS[backdrop];
    const card = front.current;
    if (card && frontLevel.current !== frontGoal) {
      const from = frontLevel.current;
      frontLevel.current =
        reducedMotion ||
        !started.current ||
        Math.abs(frontGoal - from) < FRONT_SETTLED
          ? frontGoal
          : MathUtils.damp(from, frontGoal, FADE_DAMPING, delta);
      setFront(card, frontLevel.current);
      capture.current?.();
    }
    started.current = true;
  });

  return (
    <>
      {/* Its intensity follows the level, every frame. */}
      <ambientLight ref={fill} intensity={0} />
      <EnvironmentCapture map={hdri} ref={capture}>
        {contents}
      </EnvironmentCapture>
    </>
  );
}
