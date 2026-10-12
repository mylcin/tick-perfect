import { RoundedBox } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import type { InstancedMesh, Matrix4 } from 'three';

import type { BraceletGeometry, BraceletLinks } from '../geometry/bracelet';
import {
  STRAP_LENGTH,
  STRAP_RADIUS,
  STRAP_THICKNESS,
  STRAP_TILT,
  STRAP_WRAP,
} from '../geometry/strap';
import type { WatchMaterials } from '../materials';

interface StrapAnchor {
  readonly y: number;
  readonly z: number;
  readonly width: number;
}

/** Both halves of a strap, at 12 and (turned half a turn) at 6. */
function BothSides({ children }: { children: React.ReactNode }) {
  return (
    <>
      {[0, Math.PI].map(turn => (
        <group key={turn} rotation-z={turn}>
          {children}
        </group>
      ))}
    </>
  );
}

/** A pilot's strap's rivets: their size, and where they sit on it. */
const RIVET = { radius: 0.042, height: 0.022, along: 0.3, across: 0.3 };

/**
 * A leather, alligator, canvas or rubber strap, folded round the spring
 * bars; a riveted one held by two rivets on each half, near the lugs.
 */
export function Strap({
  anchor,
  materials,
  riveted = false,
}: {
  anchor: StrapAnchor;
  materials: WatchMaterials;
  riveted?: boolean;
}) {
  return (
    <BothSides>
      <group position={[0, anchor.y, anchor.z]} rotation-x={STRAP_TILT}>
        <RoundedBox
          args={[anchor.width, STRAP_LENGTH, STRAP_THICKNESS]}
          radius={STRAP_RADIUS}
          smoothness={3}
          material={materials.strap}
          position-y={STRAP_LENGTH / 2 - STRAP_WRAP}
        />
        {riveted &&
          [-1, 1].map(side => (
            <mesh
              key={side}
              material={materials.polishedMetal}
              position={[
                side * anchor.width * RIVET.across,
                RIVET.along,
                STRAP_THICKNESS / 2,
              ]}
              rotation-x={Math.PI / 2}
            >
              <cylinderGeometry
                args={[RIVET.radius * 0.8, RIVET.radius, RIVET.height, 20]}
              />
            </mesh>
          ))}
      </group>
    </BothSides>
  );
}

function Links({
  geometry,
  matrices,
  material,
}: {
  geometry: BraceletGeometry[keyof BraceletGeometry];
  matrices: readonly Matrix4[];
  material: WatchMaterials['instanced']['caseMetal'];
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    matrices.forEach((matrix, index) => {
      mesh.current?.setMatrixAt(index, matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
    // A new material or geometry rebuilds the mesh: write them again.
  }, [matrices, geometry, material]);
  if (matrices.length === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[geometry, material, matrices.length]} />
  );
}

/**
 * A metal bracelet of instanced links: broad outer links in the case's
 * brushed metal, centre links polished on a jubilee.
 */
export function Bracelet({
  geometry,
  links,
  polishedCentre,
  materials,
}: {
  geometry: BraceletGeometry;
  links: BraceletLinks;
  polishedCentre: boolean;
  materials: WatchMaterials;
}) {
  return (
    <BothSides>
      <Links
        geometry={geometry.outer}
        matrices={links.outer}
        material={materials.instanced.caseMetal}
      />
      <Links
        geometry={geometry.centre}
        matrices={links.centre}
        material={
          polishedCentre
            ? materials.instanced.polishedMetal
            : materials.instanced.caseMetal
        }
      />
      <Links
        geometry={geometry.end}
        matrices={[links.end]}
        material={materials.instanced.caseMetal}
      />
    </BothSides>
  );
}
