import {
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  RingGeometry,
  Shape,
  Vector2,
  type BufferGeometry,
} from 'three';

import { DEG_TO_RAD } from '../layout';
import type { Point } from './outlines';

/** Spins a [radius, height] profile around the watch axis (+Z). */
export function lathe(
  profile: readonly Point[],
  segments = 128
): BufferGeometry {
  const geometry = new LatheGeometry(
    profile.map(([radius, height]) => new Vector2(radius, height)),
    segments
  );
  // Lathe geometry spins around +Y; the watch faces +Z.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function toShape(outline: readonly Point[]): Shape {
  return new Shape(outline.map(([x, y]) => new Vector2(x, y)));
}

function toPath(outline: readonly Point[]): Path {
  return new Path(outline.map(([x, y]) => new Vector2(x, y)));
}

/**
 * Extrudes a front-facing outline towards the viewer by `depth`, with a
 * small bevel so polished edges catch the light.
 */
export function extrude(
  outline: readonly Point[],
  {
    depth,
    bevel = 0,
    holes = [],
    curveSegments = 32,
    bevelSegments = 2,
  }: {
    depth: number;
    bevel?: number;
    holes?: readonly (readonly Point[])[];
    curveSegments?: number;
    /** More for a large rounded edge that catches reflections. */
    bevelSegments?: number;
  }
): BufferGeometry {
  const shape = toShape(outline);
  shape.holes = holes.map(toPath);
  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(depth - bevel * 2, 0.0005),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments,
  });
  geometry.translate(0, 0, bevel);
  // Caps and sides share one material; a single group is one draw call.
  geometry.clearGroups();
  return geometry;
}

/**
 * A flat arc band centred on 12 o'clock, `width` degrees wide. Rotate the
 * mesh to place it on the dial.
 */
export function arcBand(
  inner: number,
  outer: number,
  width: number,
  segments = 48
): BufferGeometry {
  const thetaLength = width * DEG_TO_RAD;
  return new RingGeometry(
    inner,
    outer,
    segments,
    1,
    Math.PI / 2 - thetaLength / 2,
    thetaLength
  );
}
