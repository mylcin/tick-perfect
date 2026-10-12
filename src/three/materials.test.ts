import { describe, expect, it } from 'vitest';

import { createSilhouetteMaterials, setLume } from './materials';

describe('createSilhouetteMaterials', () => {
  it('gives instanced meshes materials of their own', () => {
    // A material drawn both instanced and plain makes three.js pick its
    // shader program again at every switch between the two, each frame.
    const materials = createSilhouetteMaterials();
    const { instanced, ...plain } = materials;
    const drawnPlain = new Set<unknown>(Object.values(plain));
    const shared = Object.values(instanced).filter(material =>
      drawnPlain.has(material)
    );
    expect(shared).toEqual([]);
    materials.dispose();
  });

  it('lights the instanced lume with the rest', () => {
    const materials = createSilhouetteMaterials();
    setLume(materials, 3, 1);
    expect(materials.instanced.lume.emissiveIntensity).toBe(3);
  });
});
