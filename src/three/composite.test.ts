import { describe, expect, it } from 'vitest';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';

import { CARBON } from '../watches/metals';
import { cloneComposite, compositeMaterial } from './composite';

/** The bits of a standard shader a composite patches. */
function compile(material: ReturnType<typeof compositeMaterial>) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader:
      '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>',
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe('compositeMaterial', () => {
  it('reads as resin over fibre, not as metal', () => {
    const material = compositeMaterial(CARBON, { kind: 'forged' });
    expect(material.metalness).toBeLessThan(0.5);
    expect(material.clearcoat).toBeGreaterThan(0);
    expect(material.roughness).toBe(CARBON.roughness);
  });

  it('leaves ceramic plain, glazed but with no pattern', () => {
    const material = compositeMaterial(CARBON, { kind: 'ceramic' });
    expect(material.clearcoat).toBeGreaterThan(0);
    expect(compile(material).fragmentShader).not.toContain('composite');
  });

  it('patterns the surface from its own position', () => {
    const shader = compile(compositeMaterial(CARBON, { kind: 'forged' }));
    expect(shader.vertexShader).toContain('vCompositePosition = position;');
    expect(shader.fragmentShader).toContain('compositeFlake');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp(');
  });

  it('colours a share of a layered case’s plies', () => {
    const shader = compile(
      compositeMaterial(CARBON, {
        kind: 'layered',
        ply: '#a8f02a',
        share: 0.22,
      })
    );
    expect(shader.fragmentShader).toContain('compositePly');
    expect(shader.uniforms['compositeShare']?.value).toBe(0.22);
    expect(shader.uniforms['compositePlyColor']?.value).toMatchObject({
      r: expect.any(Number) as number,
    });
  });

  it('shares one program per pattern', () => {
    const layered = { kind: 'layered', ply: '#c8132f', share: 0.28 } as const;
    expect(compositeMaterial(CARBON, layered).customProgramCacheKey()).toBe(
      compositeMaterial(CARBON, {
        ...layered,
        ply: '#a8f02a',
      }).customProgramCacheKey()
    );
    expect(
      compositeMaterial(CARBON, { kind: 'forged' }).customProgramCacheKey()
    ).not.toBe(compositeMaterial(CARBON, layered).customProgramCacheKey());
  });

  it('patterns a copy for instanced meshes the same way', () => {
    const material = compositeMaterial(CARBON, { kind: 'forged' });
    const copy = cloneComposite(material);
    expect(copy).not.toBe(material);
    expect(copy.customProgramCacheKey()).toBe(material.customProgramCacheKey());
    expect(compile(copy).fragmentShader).toContain('compositeFlake');
  });
});
