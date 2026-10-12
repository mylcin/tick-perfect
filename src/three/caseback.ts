import { MeshPhysicalMaterial, type Texture } from 'three';

import type { EngravingId } from '../state/engravings';
import type { WatchSpec } from '../watches';
import {
  arcText,
  canvas,
  colorTexture,
  planar,
  printText,
  ring,
  SANS,
  type TextStyle,
} from './canvas';

// The caseback's engraving: the maker's name round the edge, and in the
// middle every engraving the watch has earned, one per line, as a
// watchmaker would cut them. Engraved names are English in every language.

const SIZE = 1024;
/** As they are cut, the same in every language. */
const ENGRAVED_NAMES: Readonly<Record<EngravingId, string>> = {
  isochronism: 'Isochronism',
  beatError: 'Beat error',
  positionalTest: 'Positional test',
  powerReserve: 'Power reserve',
  escapement: 'Escapement',
};
const STYLE: TextStyle = { size: 0.07, weight: 500, tracking: 0.28 };
const LINE = 0.15;

/** Where a cut catches the light (its lower edge) and where it is shadowed. */
const LIT = 'rgba(244, 245, 247, 0.95)';
const CUT = 'rgba(28, 30, 34, 0.92)';
/** How far the lit edge shows below each cut, in scene units. */
const EDGE = 0.007;

/**
 * Draws one pass of the engraving in `color`, `dy` lower: the maker's name
 * round the edge, and the engravings in the middle.
 */
function engravingPass(
  context: CanvasRenderingContext2D,
  radius: number,
  name: string,
  engraved: readonly string[],
  color: string,
  dy: number
) {
  context.save();
  context.translate(0, dy);
  context.fillStyle = color;
  context.strokeStyle = color;
  ring(context, radius * 0.9, 0.007);
  ring(context, radius * 0.62, 0.005);
  const edge = radius * 0.78;
  arcText(context, 'TICK PERFECT', 0, edge, STYLE, 8.5);
  arcText(context, name.toUpperCase(), 180, edge, STYLE, 8.5);
  if (engraved.length === 0) {
    // A blank cartouche, waiting for the first.
    ring(context, radius * 0.08, 0.005);
  }
  const top = ((engraved.length - 1) * LINE) / 2;
  engraved.forEach((line, index) => {
    printText(context, line.toUpperCase(), 0, top - index * LINE, {
      size: 0.08,
      weight: 600,
      tracking: 0.16,
      family: SANS,
    });
  });
  context.restore();
}

/**
 * The engraving in its own colours on clear: each cut dark, with its lower
 * edge lit, so it reads over bright and dark reflections alike.
 */
function drawCaseback(
  context: CanvasRenderingContext2D,
  size: number,
  radius: number,
  name: string,
  engraved: readonly string[]
) {
  context.clearRect(0, 0, size, size);
  planar(context, size, radius);
  engravingPass(context, radius, name, engraved, LIT, -EDGE);
  engravingPass(context, radius, name, engraved, CUT, 0);
}

interface CasebackMaterial {
  readonly material: MeshPhysicalMaterial;
  readonly dispose: () => void;
}

/**
 * The engraving over `spec`'s caseback. A cut through a polished back is
 * frosted: it scatters the light instead of mirroring the studio.
 */
export function casebackMaterial(
  spec: WatchSpec,
  radius: number,
  engraved: readonly EngravingId[]
): CasebackMaterial {
  const { element, context } = canvas(SIZE);
  drawCaseback(
    context,
    SIZE,
    radius,
    spec.name,
    engraved.map(id => ENGRAVED_NAMES[id])
  );
  const texture: Texture = colorTexture(element);
  const material = new MeshPhysicalMaterial({
    map: texture,
    transparent: true,
    metalness: 0,
    roughness: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  return {
    material,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}
