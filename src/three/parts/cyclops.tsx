import { useEffect, useMemo } from 'react';
import type { BufferGeometry } from 'three';

import { CYCLOPS } from '../geometry/dial-parts';
import type { WatchMaterials } from '../materials';

/** On the crystal dome above the date (it rises to 0.147 at the centre). */
const LENS_HEIGHT = 0.128;
/** Just over the date window's frame, under the hands. */
const MAGNIFIED_HEIGHT = 0.019;

/**
 * The cyclops over the date: a domed lens on the crystal and, under it,
 * the date wheel seen bigger, as the lens shows it.
 */
export function Cyclops({
  lens,
  date,
  materials,
  position,
}: {
  lens: BufferGeometry;
  date: BufferGeometry;
  materials: WatchMaterials;
  position: readonly [x: number, y: number];
}) {
  // The same painted wheel, zoomed in on its middle.
  const magnified = useMemo(() => {
    const material = materials.dateWheel.clone();
    const map = materials.dateWheel.map?.clone() ?? null;
    if (map) {
      const share = 1 / CYCLOPS.magnification;
      map.repeat.set(share, share);
      map.offset.set((1 - share) / 2, (1 - share) / 2);
      map.needsUpdate = true;
    }
    material.map = map;
    return material;
  }, [materials]);
  useEffect(
    () => () => {
      magnified.map?.dispose();
      magnified.dispose();
    },
    [magnified]
  );

  return (
    <group position={[position[0], position[1], 0]}>
      <mesh
        geometry={date}
        material={magnified}
        position-z={MAGNIFIED_HEIGHT}
      />
      <mesh
        geometry={lens}
        material={materials.cyclops}
        position-z={LENS_HEIGHT}
        renderOrder={12}
      />
    </group>
  );
}
