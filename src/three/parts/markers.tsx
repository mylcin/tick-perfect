import { useLayoutEffect, useRef } from 'react';
import { Matrix4, type InstancedMesh } from 'three';

import type { MarkerKind } from '../geometry/dial-parts';
import { polar, watchAngleToRotation } from '../layout';
import type { WatchMaterials } from '../materials';

/**
 * The applied hour markers of a dial style, each kind drawn as one
 * instanced mesh (and one more for its lume).
 */
export function Markers({
  kinds,
  materials,
}: {
  kinds: readonly MarkerKind[];
  materials: WatchMaterials;
}) {
  return (
    <>
      {kinds.map((kind, index) => (
        <MarkerInstances key={index} kind={kind} materials={materials} />
      ))}
    </>
  );
}

function MarkerInstances({
  kind,
  materials,
}: {
  kind: MarkerKind;
  materials: WatchMaterials;
}) {
  const frames = useRef<InstancedMesh>(null);
  const inlays = useRef<InstancedMesh>(null);
  const { hours, radius, radial, frame, inlay } = kind;

  useLayoutEffect(() => {
    const matrix = new Matrix4();
    const turn = new Matrix4();
    hours.forEach((hour, index) => {
      const [x, y] = polar(hour * 30, radius);
      matrix.makeTranslation(x, y, 0);
      if (radial) {
        matrix.multiply(turn.makeRotationZ(watchAngleToRotation(hour * 30)));
      }
      frames.current?.setMatrixAt(index, matrix);
      inlays.current?.setMatrixAt(index, matrix);
    });
    if (frames.current) frames.current.instanceMatrix.needsUpdate = true;
    if (inlays.current) inlays.current.instanceMatrix.needsUpdate = true;
    // A new material or geometry rebuilds the instanced mesh, so the
    // matrices are written again.
  }, [hours, radius, radial, frame, inlay, materials]);

  if (hours.length === 0) return null;
  return (
    <>
      <instancedMesh
        ref={frames}
        args={[frame, materials.instanced.handMetal, hours.length]}
      />
      {inlay && (
        <instancedMesh
          ref={inlays}
          args={[inlay, materials.instanced.lume, hours.length]}
        />
      )}
    </>
  );
}
