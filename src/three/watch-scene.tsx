import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Group,
  type Object3D,
  type WebGLRenderer,
} from 'three';

import type { CertificateTier } from '../state/certificates';
import type { EngravingId } from '../state/engravings';
import { sessionStore } from '../state/session';
import type { Observable } from '../utils/observable';
import { safeStorage } from '../utils/safe-storage';
import type { WatchSpec } from '../watches';
import { CAMERA_FAR, CAMERA_NEAR, fitInBox, framingFor } from './camera';
import { Effects } from './effects';
import type { PoseSource } from './pose';
import {
  drawnTier,
  pixelRatio,
  rememberedTierState,
  rememberTier,
  stepTier,
  tierBounds,
} from './quality';
import { Rig, type RigMode } from './rig';
import { Studio, type Backdrop } from './studio';
import { WatchModel, type WatchAppearance } from './watch-model';

export const CAMERA_FOV = 26;

/**
 * How long a compiled watch waits for the studio HDRI before it shows
 * under the fallback lights instead (and changes look when it arrives).
 */
const HDRI_WAIT_MS = 1000;
/** ...and for its framing to settle, so it fades in where it will stay. */
const SETTLE_WAIT_MS = 800;
/** Settled: the watch moves less than this a frame, in screen halves. */
const SETTLED = 0.002;

/** The device's own storage, for the tier it settles on. */
const deviceStorage = safeStorage(() => window.localStorage);

interface WatchSceneProps {
  readonly spec: WatchSpec;
  readonly pose: PoseSource;
  readonly score: Observable<number>;
  readonly mode: RigMode;
  /** The page's studio, which the lighting and the lume follow. */
  readonly backdrop: Backdrop;
  readonly reducedMotion: boolean;
  /** Draws at the cheapest tier, whatever the device could manage. */
  readonly batterySaver?: boolean;
  readonly appearance?: WatchAppearance;
  readonly certificate?: CertificateTier | null;
  /** Engraved on the caseback. */
  readonly engraved?: readonly EngravingId[];
  /** Turned over to show the caseback. */
  readonly turned?: boolean;
  /**
   * Called once the first frame with the watch has been drawn: its shaders
   * compiled, the studio lit (or given up on) and its framing settled.
   */
  readonly onReady?: () => void;
  /** The GPU took the WebGL context back; nothing draws until it returns. */
  readonly onLost?: () => void;
  /**
   * The context is back, but what was on the GPU is gone: the scene must
   * be mounted again.
   */
  readonly onRestored?: () => void;
}

/** The 3D watch on a transparent canvas; the page paints the backdrop. */
export function WatchScene({
  spec,
  pose,
  score,
  mode,
  backdrop,
  reducedMotion,
  batterySaver = false,
  appearance = 'full',
  certificate = null,
  engraved,
  turned = false,
  onReady,
  onLost,
  onRestored,
}: WatchSceneProps) {
  // Starts where this device settled last visit, and remembers each real
  // change for the next.
  const [tierState, setTierState] = useState(() =>
    rememberedTierState(deviceStorage)
  );
  useEffect(() => {
    if (tierState.changes > 0) rememberTier(deviceStorage, tierState.index);
  }, [tierState]);
  const tier = drawnTier(tierState, batterySaver);
  const [lit, setLit] = useState(false);
  const [shown, setShown] = useState(false);
  const anchor = useRef<Group>(null);
  // A lost context can't take a new effect chain, and its frames, drawn
  // as nothing, look fast. A restore mounts a fresh scene, so it never
  // needs clearing.
  const contextLost = useRef(false);
  const lost = useCallback(() => {
    contextLost.current = true;
    onLost?.();
  }, [onLost]);
  // Starts at the distance the framing wants, so the watch doesn't glide
  // out to it as it appears. Read once: a new camera prop would replace
  // the camera.
  const [camera] = useState(() => ({
    fov: CAMERA_FOV,
    position: [0, 0, framedDistance(mode)] as [number, number, number],
    near: CAMERA_NEAR,
    far: CAMERA_FAR,
  }));

  return (
    <Canvas
      data-testid="watch-scene"
      data-quality={tier.name}
      dpr={pixelRatio(tier, window.devicePixelRatio)}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      camera={camera}
      onCreated={state => {
        // Lets dev tools and local tests read draw calls and memory.
        if (import.meta.env.DEV) {
          Object.assign(window, {
            __tickRenderer: state.gl,
            __tickScene: state.scene,
          });
        }
      }}
    >
      <ContextEvents onLost={lost} {...(onRestored && { onRestored })} />
      {/* drei counts every incline as a flip-flop, even on the top tier where
          nothing changes, and would fall back to the lowest tier on a smooth
          60 Hz screen. stepTier counts only real changes instead. Battery
          saver holds its tier, so nothing measures meanwhile. */}
      {!batterySaver && (
        <PerformanceMonitor
          flipflops={Infinity}
          bounds={tierBounds}
          onDecline={() => {
            if (contextLost.current) return;
            setTierState(state => stepTier(state, 'down'));
          }}
          onIncline={() => {
            if (contextLost.current) return;
            setTierState(state => stepTier(state, 'up'));
          }}
        />
      )}
      <Studio
        backdrop={backdrop}
        reducedMotion={reducedMotion}
        onLit={() => {
          setLit(true);
        }}
      />
      {/* Hidden until it can be drawn without stalling the page. */}
      <group visible={shown}>
        <Rig mode={mode} reducedMotion={reducedMotion} snap={!shown}>
          <group ref={anchor} />
          <WatchModel
            spec={spec}
            pose={pose}
            score={score}
            night={backdrop === 'night'}
            reducedMotion={reducedMotion}
            appearance={appearance}
            certificate={certificate}
            {...(engraved && { engraved })}
            turned={turned}
          />
        </Rig>
      </group>
      <Effects tier={tier} backdrop={backdrop} />
      {shown ? (
        onReady && <FirstFrame onDrawn={onReady} />
      ) : (
        <Reveal
          lit={lit}
          anchor={anchor}
          onReveal={() => {
            setShown(true);
          }}
        />
      )}
    </Canvas>
  );
}

/** Hears the canvas lose its WebGL context, and get it back. */
function ContextEvents({
  onLost,
  onRestored,
}: Pick<WatchSceneProps, 'onLost' | 'onRestored'>) {
  const canvas = useThree(state => state.gl.domElement);
  useEffect(() => {
    const lost = (event: Event) => {
      // Asks the browser to give the context back when it can.
      event.preventDefault();
      onLost?.();
    };
    const restored = () => {
      onRestored?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [canvas, onLost, onRestored]);
  return null;
}

/** How far back the camera stands to frame the watch for `mode`. */
function framedDistance(mode: RigMode): number {
  const size = { width: window.innerWidth, height: window.innerHeight };
  return fitInBox({
    fov: CAMERA_FOV,
    aspect: size.width / Math.max(size.height, 1),
    ...framingFor(mode, size, sessionStore.getState().textTop),
  }).distance;
}

/**
 * Compiles every shader the scene draws with, without blocking the page
 * where the browser can (KHR_parallel_shader_compile). The post-processing
 * draws the scene into a render target, which changes the shaders, so they
 * are compiled for one.
 */
function compileScene(
  gl: WebGLRenderer,
  scene: Object3D,
  camera: Camera
): Promise<unknown> {
  const target = new WebGLRenderTarget(1, 1);
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  const compiling = gl.compileAsync(scene, camera);
  gl.setRenderTarget(previous);
  return compiling.finally(() => {
    target.dispose();
  });
}

/**
 * Compiles the hidden watch, then reveals it once the studio HDRI lights it
 * and its framing has settled (or each has had its time).
 */
function Reveal({
  lit,
  anchor,
  onReveal,
}: {
  lit: boolean;
  anchor: RefObject<Object3D | null>;
  onReveal: () => void;
}) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const progress = useRef({
    compiledAt: null as number | null,
    revealed: false,
    last: new Vector3(Infinity, Infinity, 0),
    now: new Vector3(),
  });

  useEffect(() => {
    let cancelled = false;
    void compileScene(gl, scene, camera).then(() => {
      if (!cancelled) progress.current.compiledAt = performance.now();
    });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    const state = progress.current;
    const node = anchor.current;
    if (!node || state.revealed) return;
    // Where the watch is on screen, and how far it moved since last frame.
    state.now.setFromMatrixPosition(node.matrixWorld).project(camera);
    const moved = state.now.distanceTo(state.last);
    state.last.copy(state.now);
    if (state.compiledAt === null) return;
    const waited = performance.now() - state.compiledAt;
    if (
      (lit || waited > HDRI_WAIT_MS) &&
      (moved < SETTLED || waited > SETTLE_WAIT_MS)
    ) {
      state.revealed = true;
      onReveal();
    }
  });
  return null;
}

/**
 * Reports the first frame, so the page knows the watch is on screen. (The
 * default priority: a positive one would take over rendering from R3F.)
 */
function FirstFrame({ onDrawn }: { onDrawn: () => void }) {
  const reported = useRef(false);
  useFrame(() => {
    if (reported.current) return;
    reported.current = true;
    onDrawn();
  });
  return null;
}
