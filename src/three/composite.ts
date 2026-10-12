import { Color, MeshPhysicalMaterial } from 'three';

import type { CompositeSpec, MetalSpec } from '../watches';

// Carbon composites, drawn on the case by its shader rather than a texture:
// the pattern follows the surface's own position, so it needs no UVs, and a
// machined curve cuts through the plies the way a real case does.

/** Plies per scene unit, across the stack: a few tenths of a millimetre each. */
const PLY_DENSITY = 70;
/** How far the plies wander, in plies, as the lay-up ripples. */
const PLY_WAVE = 9;
/** Forged carbon's flakes per scene unit. */
const FLAKE_SCALE = 9;
/**
 * Inside this radius is the case's floor, seen through a skeleton: plain,
 * as the inside of a real case is.
 */
const INNER_RADIUS = 1.04;

const NOISE = /* glsl */ `
varying vec3 vCompositePosition;
float compositeHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float compositeHash1(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}
float compositeNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(compositeHash(i), compositeHash(i + vec3(1, 0, 0)), f.x),
      mix(compositeHash(i + vec3(0, 1, 0)), compositeHash(i + vec3(1, 1, 0)), f.x),
      f.y),
    mix(
      mix(compositeHash(i + vec3(0, 0, 1)), compositeHash(i + vec3(1, 0, 1)), f.x),
      mix(compositeHash(i + vec3(0, 1, 1)), compositeHash(i + vec3(1, 1, 1)), f.x),
      f.y),
    f.z);
}
`;

/** How much of the pattern shows: none on the floor inside the bezel. */
const OUTSIDE = /* glsl */ `
float compositeOutside = smoothstep(
  ${(INNER_RADIUS - 0.02).toFixed(3)},
  ${INNER_RADIUS.toFixed(3)},
  length(vCompositePosition.xy)
);
`;

/**
 * Forged: chopped fibres pressed every which way. Two octaves of noise,
 * pushed along a direction that turns across the case, cut sharply into
 * flakes; each flake is a shade darker or lighter, with its own sheen.
 */
const FORGED = /* glsl */ `
${OUTSIDE}
vec3 compositeAt = vCompositePosition * ${FLAKE_SCALE.toFixed(1)};
float compositeTurn = compositeNoise(compositeAt * 0.3) * 6.2831;
vec3 compositeGrain = vec3(cos(compositeTurn), sin(compositeTurn), 0.0);
float compositeFlake = compositeNoise(compositeAt + compositeGrain * 2.0)
  + 0.5 * compositeNoise(compositeAt * 2.7 - compositeGrain * 3.0);
float compositeEdge = max(fwidth(compositeFlake), 0.02);
float compositeShade = smoothstep(0.78 - compositeEdge, 0.78 + compositeEdge, compositeFlake)
  - 0.5 * (1.0 - smoothstep(0.42 - compositeEdge, 0.42 + compositeEdge, compositeFlake));
diffuseColor.rgb *= mix(1.0, 0.85 + 0.45 * compositeShade, compositeOutside);
// Coloured fibres, where there are any, in the brightest flakes.
float compositeColoured = compositeShare * compositeOutside
  * smoothstep(1.0 - compositeEdge, 1.0 + compositeEdge, compositeFlake);
diffuseColor.rgb = mix(diffuseColor.rgb, compositePlyColor, compositeColoured);
float compositeRoughness = mix(1.0, 1.0 - 0.35 * compositeShade, compositeOutside);
`;

/**
 * Layered: thin plies stacked almost flat with the dial, rippling a
 * little, so the curved case cuts them into fine contour lines; a ply in
 * every few is coloured, picked by its number. Across a pixel the plies
 * blend, and where many share one, their average shows: never a shimmer.
 */
const LAYERED = /* glsl */ `
${OUTSIDE}
vec3 compositeAt = vCompositePosition;
float compositePly = dot(compositeAt, vec3(0.35, 0.55, 1.0)) * ${PLY_DENSITY.toFixed(1)}
  + compositeNoise(compositeAt * 1.1) * ${PLY_WAVE.toFixed(1)};
float compositeEdge = fwidth(compositePly);
float compositeIndex = floor(compositePly);
float compositeThis = step(compositeHash1(compositeIndex), compositeShare);
float compositeNext = step(compositeHash1(compositeIndex + 1.0), compositeShare);
float compositeColoured = mix(
  compositeThis,
  compositeNext,
  smoothstep(1.0 - compositeEdge, 1.0, fract(compositePly))
);
compositeColoured = mix(compositeColoured, compositeShare, smoothstep(0.5, 1.5, compositeEdge));
compositeColoured *= compositeOutside;
float compositeFibre = 0.85 + 0.3 * compositeNoise(compositeAt * 40.0);
diffuseColor.rgb = mix(diffuseColor.rgb * compositeFibre, compositePlyColor, compositeColoured);
float compositeRoughness = mix(1.0, 0.8, compositeColoured);
`;

/**
 * A case material made as `composite`: carbon under a clear resin coat, so
 * it reads as fibre rather than metal, ceramic under its polish, or matte
 * moulded resin, in the metal's colour and roughness.
 */
export function compositeMaterial(
  metal: MetalSpec,
  composite: CompositeSpec
): MeshPhysicalMaterial {
  if (composite.kind === 'resin') {
    return new MeshPhysicalMaterial({
      color: metal.color,
      metalness: 0,
      roughness: metal.roughness,
      sheen: 0.2,
      sheenRoughness: 0.7,
    });
  }
  const material = new MeshPhysicalMaterial({
    color: metal.color,
    metalness: 0.2,
    roughness: metal.roughness,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });
  if (composite.kind === 'ceramic') return material;
  const plyColor = new Color(
    composite.kind === 'layered'
      ? composite.ply
      : (composite.flake ?? '#000000')
  );
  // A forged case's coloured fibres show in full, or not at all.
  const share =
    composite.kind === 'layered' ? composite.share : composite.flake ? 1 : 0;
  const pattern = composite.kind === 'layered' ? LAYERED : FORGED;
  material.onBeforeCompile = shader => {
    shader.uniforms['compositePlyColor'] = { value: plyColor };
    shader.uniforms['compositeShare'] = { value: share };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCompositePosition;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCompositePosition = position;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 compositePlyColor;\nuniform float compositeShare;\n${NOISE}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${pattern}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * compositeRoughness, 0.04, 1.0);'
      );
  };
  // One program per pattern, shared by every case that wears it.
  material.customProgramCacheKey = () => `composite-${composite.kind}`;
  return material;
}

/** A copy for instanced meshes, patterned the same way. */
export function cloneComposite(
  material: MeshPhysicalMaterial
): MeshPhysicalMaterial {
  const copy = material.clone();
  copy.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer);
  };
  copy.customProgramCacheKey = () => material.customProgramCacheKey();
  return copy;
}
