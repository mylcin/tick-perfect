import { useFrame, useThree } from '@react-three/fiber';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import {
  HalfFloatType,
  NoToneMapping,
  Vector2,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';

import type { QualityTier } from './quality';
import type { Backdrop } from './studio';

interface Chain {
  readonly composer: EffectComposer;
  readonly bloom: BloomEffect | null;
}

/** The scene, then bloom (on tiers that have it) and tone mapping. */
function createChain(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  tier: QualityTier
): Chain {
  const composer = new EffectComposer(gl, {
    multisampling: tier.multisampling,
    frameBufferType: HalfFloatType,
  });
  const bloom = tier.bloom
    ? new BloomEffect({
        blendFunction: BlendFunction.ADD,
        mipmapBlur: true,
        luminanceSmoothing: 0.2,
        radius: 0.7,
      })
    : null;
  const toneMapping = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
  });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new EffectPass(camera, ...(bloom ? [bloom] : []), toneMapping)
  );
  return { composer, bloom };
}

/** Disposes the composer, its passes and every effect in them. */
function disposeChain({ composer }: Chain) {
  composer.dispose();
}

/**
 * Bloom only picks up what is brighter than white before tone mapping; with
 * the lights out it reaches lower, so the lume glows.
 */
function setBackdrop({ bloom }: Chain, backdrop: Backdrop) {
  if (!bloom) return;
  const night = backdrop === 'night';
  bloom.luminanceMaterial.threshold = night ? 0.9 : 1.2;
  bloom.intensity = night ? 1.1 : 0.3;
}

/** Tone mapping runs in the chain, so the renderer must not add its own. */
function handOverToneMapping(gl: WebGLRenderer): () => void {
  const own = gl.toneMapping;
  gl.toneMapping = NoToneMapping;
  return () => {
    gl.toneMapping = own;
  };
}

const drawn = new Vector2();

/** Draws a frame through the chain, resizing it to the canvas first. */
function render(
  { composer }: Chain,
  gl: WebGLRenderer,
  applied: { width: number; height: number; ratio: number },
  delta: number
) {
  gl.getSize(drawn);
  const ratio = gl.getPixelRatio();
  if (
    drawn.width !== applied.width ||
    drawn.height !== applied.height ||
    ratio !== applied.ratio
  ) {
    composer.setSize(drawn.width, drawn.height);
    Object.assign(applied, { width: drawn.width, height: drawn.height, ratio });
  }
  composer.render(delta);
}

/**
 * Post-processing. Bloom only picks up what is brighter than white before
 * tone mapping (lume, the target, the sharpest glints), so it stays a
 * subtle glow instead of a haze. Built on postprocessing directly: its
 * React wrapper brings every effect it offers into the bundle.
 */
export function Effects({
  tier,
  backdrop,
}: {
  tier: QualityTier;
  backdrop: Backdrop;
}) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const chain = useMemo(
    () => createChain(gl, scene, camera, tier),
    [gl, scene, camera, tier]
  );
  useEffect(
    () => () => {
      disposeChain(chain);
    },
    [chain]
  );
  useEffect(() => {
    setBackdrop(chain, backdrop);
  }, [chain, backdrop]);
  useEffect(() => handOverToneMapping(gl), [gl]);

  const applied = useRef({ width: -1, height: -1, ratio: -1 });
  // A positive priority: the chain draws every frame instead of R3F.
  useFrame((_, delta) => {
    render(chain, gl, applied.current, delta);
  }, 1);
  return null;
}
