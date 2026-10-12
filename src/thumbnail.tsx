/* eslint-disable react-refresh/only-export-components -- an entry point,
   not a module: nothing imports it, so there is nothing to refresh. */
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { fitInBox, FULL_SCREEN } from './three/camera';
import { RESTING, type WatchPose } from './three/pose';
import { Studio } from './three/studio';
import { THUMBNAIL_RADIUS } from './three/thumbnails';
import { WatchModel } from './three/watch-model';
import { CAMERA_FOV } from './three/watch-scene';
import { createObservable } from './utils/observable';
import {
  isWatchId,
  STANDARD,
  variantOf,
  WATCHES,
  withVariant,
} from './watches';

// Draws one watch, still, for the collection's thumbnails: open
// /thumbnail.html?watch=gmt (&variant=blueBlack for a variant) on the dev
// server and wait for
// window.__thumbnailReady. Only scripts/render-thumbnails.js uses it.

const POSE: WatchPose = { ...RESTING, seconds: 228 };
const SCORE = createObservable(0);
const FRAMES_BEFORE_READY = 8;

const params = new URLSearchParams(location.search);
const id = params.get('watch');
if (!isWatchId(id)) throw new Error(`Unknown watch: ${String(id)}`);
const variant = params.get('variant') ?? STANDARD;
if (!variantOf(id, variant)) throw new Error(`Unknown variant: ${variant}`);
const spec = withVariant(WATCHES[id], variant);
const { distance } = fitInBox({
  fov: CAMERA_FOV,
  aspect: 1,
  radius: THUMBNAIL_RADIUS,
  box: FULL_SCREEN,
});

/** Ready a few frames after the studio lights the watch, never before. */
function Ready({ lit }: { lit: boolean }) {
  const frames = useRef(0);
  useFrame(() => {
    if (!lit) return;
    frames.current += 1;
    if (frames.current === FRAMES_BEFORE_READY) {
      Object.assign(window, { __thumbnailReady: true });
    }
  });
  return null;
}

function Thumbnail() {
  const [lit, setLit] = useState(false);
  return (
    <Canvas
      dpr={1}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: CAMERA_FOV, position: [0, 0, distance] }}
    >
      <Suspense fallback={null}>
        <Studio
          backdrop="dark"
          onLit={() => {
            setLit(true);
          }}
        />
        <group rotation={[-0.28, 0.22, 0]}>
          <WatchModel
            spec={spec}
            pose={() => POSE}
            score={SCORE}
            night={false}
            reducedMotion
            showroom
          />
        </group>
        <Ready lit={lit} />
      </Suspense>
    </Canvas>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
createRoot(container).render(<Thumbnail />);
