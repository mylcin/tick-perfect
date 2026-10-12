import { Box3, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import {
  CHRONOGRAPH,
  DIVER,
  GMT,
  GRAND_COMPLICATION,
  MOONPHASE,
  TOURBILLON,
  WATCH_ORDER,
  WATCHES,
  type BezelSpec,
} from '../../watches';
import { LAYOUT } from '../layout';
import {
  bezelGeometry,
  bezelInsertHeight,
  HOBNAIL_REPEATS,
  SCREW_RADIUS,
  screwPlacements,
  tonneauOutline,
  tonneauSag,
  type BezelGeometry,
} from './bezels';
import type { Point } from './outlines';

const CASE_TOP = 0.1;
const TOLERANCE = 0.002;

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

function vertices(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute('position');
  return Array.from(
    { length: position.count },
    (_, index) =>
      new Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index)
      )
  );
}

const radial = (vertex: Vector3) => Math.hypot(vertex.x, vertex.y);

function radialRange(geometry: BufferGeometry): [min: number, max: number] {
  const radii = vertices(geometry).map(radial);
  return [Math.min(...radii), Math.max(...radii)];
}

function zRange(geometry: BufferGeometry): [min: number, max: number] {
  const { min, max } = box(geometry);
  return [min.z, max.z];
}

interface Face {
  readonly centroid: Vector3;
  /** From the winding: the side a renderer draws. */
  readonly normal: Vector3;
  readonly area: number;
}

function faces(geometry: BufferGeometry): Face[] {
  const points = vertices(geometry);
  const index = geometry.getIndex();
  const corners = index
    ? Array.from({ length: index.count }, (_, at) => index.getX(at))
    : points.map((_, at) => at);
  const result: Face[] = [];
  for (let at = 0; at + 2 < corners.length; at += 3) {
    const [a, b, c] = [corners[at], corners[at + 1], corners[at + 2]].map(
      corner => points[corner ?? 0] ?? new Vector3()
    ) as [Vector3, Vector3, Vector3];
    const cross = new Vector3()
      .subVectors(b, a)
      .cross(new Vector3().subVectors(c, a));
    const area = cross.length() / 2;
    if (area < 1e-12) continue;
    result.push({
      centroid: new Vector3().add(a).add(b).add(c).divideScalar(3),
      normal: cross.normalize(),
      area,
    });
  }
  return result;
}

function present(part: BufferGeometry | null): BufferGeometry {
  if (part === null) throw new Error('The bezel lacks this part.');
  return part;
}

const triangles = (geometry: BufferGeometry) =>
  (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;

function partsOf(bezel: BezelGeometry): BufferGeometry[] {
  return [
    bezel.body,
    bezel.edge,
    bezel.insert,
    bezel.wall,
    bezel.screws,
  ].filter(part => part !== null);
}

/** Connected pieces of a mesh, joining triangles that share a vertex. */
function islands(geometry: BufferGeometry): number {
  const points = vertices(geometry);
  const parent = points.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] ?? root;
    parent[index] = root;
    return root;
  };
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const byPosition = new Map<string, number>();
  points.forEach((point, index) => {
    const key = point
      .toArray()
      .map(value => value.toFixed(5))
      .join();
    const twin = byPosition.get(key);
    if (twin === undefined) byPosition.set(key, index);
    else join(index, twin);
    if (index % 3 === 2) {
      join(index, index - 1);
      join(index, index - 2);
    }
  });
  return new Set(points.map((_, index) => find(index))).size;
}

function insideConvex(outline: readonly Point[], [x, y]: Point): boolean {
  return outline.every(([ax, ay], index) => {
    const [bx, by] = outline[(index + 1) % outline.length] ?? [ax, ay];
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
  });
}

const all = WATCH_ORDER.map(id => WATCHES[id]);

describe.each(all)('the $name bezel', watch => {
  const bezel = bezelGeometry(watch.bezel, watch.case);
  const parts = partsOf(bezel);

  it('builds every part with finite vertices and one draw call each', () => {
    for (const part of parts) {
      const positions = Array.from(part.getAttribute('position').array);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.every(Number.isFinite)).toBe(true);
      expect(part.getAttribute('normal').count).toBe(
        part.getAttribute('position').count
      );
      expect(part.getAttribute('uv').count).toBe(
        part.getAttribute('position').count
      );
      expect(part.groups).toHaveLength(0);
    }
  });

  it('stays light enough for a phone', () => {
    const total = parts.reduce((sum, part) => sum + triangles(part), 0);
    expect(total).toBeLessThan(25_000);
  });

  it('sits on the case top and rises to its height', () => {
    const lowest = Math.min(...parts.map(part => zRange(part)[0]));
    const highest = Math.max(
      ...[bezel.body, bezel.edge]
        .filter(part => part !== null)
        .map(part => zRange(part)[1])
    );
    if (watch.bezel.type !== 'screwPlate') {
      expect(lowest).toBeGreaterThanOrEqual(LAYOUT.crystalHeight - 0.01);
      expect(lowest).toBeLessThanOrEqual(CASE_TOP);
    }
    expect(highest).toBeCloseTo(watch.bezel.height, 3);
  });

  it('keeps every part within its outer radius', () => {
    if (watch.bezel.type === 'screwPlate') return;
    // An eight-sided guard's outer radius is across its flats; its corners
    // reach further, as far as a sharp corner would.
    const reach =
      watch.bezel.type === 'octagon'
        ? watch.bezel.outer / Math.cos(Math.PI / 8)
        : watch.bezel.outer;
    for (const part of parts) {
      expect(radialRange(part)[1]).toBeLessThanOrEqual(reach + TOLERANCE);
    }
    const outermost = Math.max(...parts.map(part => radialRange(part)[1]));
    expect(outermost).toBeGreaterThan(watch.bezel.outer - TOLERANCE);
  });

  it('draws its top faces towards the viewer', () => {
    for (const part of parts) {
      const highest = faces(part).reduce((best, face) =>
        face.centroid.z > best.centroid.z ? face : best
      );
      expect(highest.normal.z).toBeGreaterThan(0.5);
    }
  });

  it('turns the wall towards the dial, up from the crystal', () => {
    const facing = faces(bezel.wall).reduce((sum, face) => {
      const outward = new Vector3(face.centroid.x, face.centroid.y, 0)
        .normalize()
        .dot(face.normal);
      return sum + outward * face.area;
    }, 0);
    expect(facing).toBeLessThan(0);
    const [inner] = radialRange(bezel.wall);
    expect(inner).toBeCloseTo(
      Math.min(watch.bezel.inner, LAYOUT.crystalRadius),
      3
    );
  });

  it('carries an insert only on the insert bezels', () => {
    const hasInsert = 'insert' in watch.bezel;
    expect(bezel.insert !== null).toBe(hasInsert);
    expect(bezel.screws !== null).toBe(watch.bezel.type === 'screwPlate');
  });
});

describe.each([DIVER, GMT, CHRONOGRAPH])('the $name insert bezel', watch => {
  const spec = watch.bezel as Extract<BezelSpec, { insert: unknown }>;
  const bezel = bezelGeometry(spec, watch.case);

  it('lays a flat insert between its radii, under the top', () => {
    const insert = present(bezel.insert);
    const [low, high] = zRange(insert);
    expect(low).toBeCloseTo(bezelInsertHeight(spec), 6);
    expect(high).toBeCloseTo(bezelInsertHeight(spec), 6);
    expect(bezelInsertHeight(spec)).toBeCloseTo(spec.height - 0.02, 9);
    const [inner, outer] = radialRange(insert);
    expect(inner).toBeCloseTo(spec.insert.inner, 6);
    expect(outer).toBeCloseTo(spec.insert.outer, 6);
  });

  it('maps the print planar over the insert’s outer radius', () => {
    const insert = present(bezel.insert);
    const uv = insert.getAttribute('uv');
    const position = insert.getAttribute('position');
    for (let index = 0; index < uv.count; index += 17) {
      expect(uv.getX(index)).toBeCloseTo(
        (position.getX(index) / spec.insert.outer + 1) / 2,
        5
      );
      expect(uv.getY(index)).toBeCloseTo(
        (position.getY(index) / spec.insert.outer + 1) / 2,
        5
      );
    }
  });

  it('runs the grip from the case top to just under the top edge', () => {
    const [low, high] = zRange(bezel.body);
    expect(low).toBeCloseTo(CASE_TOP, 2);
    expect(high).toBeLessThan(spec.height);
    expect(high).toBeGreaterThan(spec.height - 0.012);
  });

  it('frames the insert with a polished edge out to the grip', () => {
    const edge = present(bezel.edge);
    const [inner, outer] = radialRange(edge);
    expect(inner).toBeGreaterThan(spec.insert.outer - 0.004);
    expect(outer).toBeLessThan(spec.outer);
    expect(zRange(edge)[1]).toBeCloseTo(spec.height, 6);
  });

  it('rises the wall from the crystal to the insert', () => {
    const [low, high] = zRange(bezel.wall);
    expect(low).toBeCloseTo(LAYOUT.crystalHeight, 6);
    expect(high).toBeCloseTo(bezelInsertHeight(spec), 6);
    expect(radialRange(bezel.wall)[1]).toBeLessThan(spec.insert.inner + 0.004);
  });
});

/** How deep the grip's notches cut, measured on its upright flank. */
function notchDepth(bezel: BezelGeometry, spec: BezelSpec): number {
  const normal = bezel.body.getAttribute('normal');
  const flank = vertices(bezel.body)
    .filter((_, index) => Math.abs(normal.getZ(index)) < 0.1)
    .map(radial)
    .filter(radius => radius > spec.outer - 0.04);
  return Math.max(...flank) - Math.min(...flank);
}

describe('grip edges', () => {
  const diver = bezelGeometry(DIVER.bezel, DIVER.case);
  const chrono = bezelGeometry(CHRONOGRAPH.bezel, CHRONOGRAPH.case);

  it('cuts the timing bezel’s notches coarser and deeper', () => {
    expect(notchDepth(diver, DIVER.bezel)).toBeCloseTo(0.012, 3);
    expect(notchDepth(chrono, CHRONOGRAPH.bezel)).toBeGreaterThan(0.02);
  });

  it('runs the timing bezel’s grip closer to its top', () => {
    const gap = (bezel: BezelGeometry, spec: BezelSpec) =>
      spec.height - zRange(bezel.body)[1];
    expect(gap(chrono, CHRONOGRAPH.bezel)).toBeLessThan(
      gap(diver, DIVER.bezel) / 2
    );
  });

  it('turns a smooth band when the bezel has no ridges', () => {
    const spec = { ...(DIVER.bezel as BezelSpec & { grip: number }) };
    const smooth = bezelGeometry({ ...spec, grip: 0 } as BezelSpec, DIVER.case);
    expect(notchDepth(smooth, spec)).toBeLessThan(0.0005);
    expect(radialRange(smooth.body)[1]).toBeCloseTo(spec.outer, 4);
  });
});

describe('the hobnail bezel', () => {
  const spec = MOONPHASE.bezel;
  const bezel = bezelGeometry(spec, MOONPHASE.case);

  it('runs its UVs around the ring for the pyramid tiles', () => {
    const uv = bezel.body.getAttribute('uv');
    const us = Array.from({ length: uv.count }, (_, index) => uv.getX(index));
    const vs = Array.from({ length: uv.count }, (_, index) => uv.getY(index));
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(HOBNAIL_REPEATS, 6);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(1, 6);
  });

  it('keeps v at 0 on the inner edge and 1 on the outer', () => {
    const uv = bezel.body.getAttribute('uv');
    const points = vertices(bezel.body);
    const [inner, outer] = radialRange(bezel.body);
    points.forEach((point, index) => {
      const v = (radial(point) - inner) / (outer - inner);
      expect(uv.getY(index)).toBeCloseTo(v, 2);
    });
  });

  it('is a narrow ring between its radii with a rounded top', () => {
    const [inner, outer] = radialRange(bezel.body);
    expect(inner).toBeGreaterThan(spec.inner);
    expect(outer).toBeLessThan(spec.outer);
    const [low, high] = zRange(bezel.body);
    expect(high).toBeCloseTo(spec.height, 6);
    expect(low).toBeLessThan(high);
    expect(radialRange(present(bezel.edge))[1]).toBeCloseTo(spec.outer, 6);
  });
});

describe('the stepped bezel', () => {
  const spec = GRAND_COMPLICATION.bezel;
  const bezel = bezelGeometry(spec, GRAND_COMPLICATION.case);
  const points = vertices(bezel.body);
  const width = spec.outer - spec.inner;

  it('raises an inner step above an outer one', () => {
    const highestWithin = (from: number, to: number) =>
      Math.max(
        ...points
          .filter(point => radial(point) >= from && radial(point) <= to)
          .map(point => point.z)
      );
    expect(highestWithin(spec.inner, spec.inner + width * 0.45)).toBeCloseTo(
      spec.height,
      6
    );
    expect(highestWithin(spec.inner + width * 0.55, spec.outer)).toBeLessThan(
      spec.height - 0.008
    );
  });

  it('reaches out to its radius', () => {
    expect(radialRange(bezel.body)[1]).toBeCloseTo(spec.outer, 6);
    expect(bezel.edge).toBeNull();
  });
});

describe('the screwed tonneau plate', () => {
  const spec = TOURBILLON.bezel as Extract<BezelSpec, { type: 'screwPlate' }>;
  const caseSpec = TOURBILLON.case;
  const length = caseSpec.length ?? caseSpec.radius;
  const halfLength = length - (caseSpec.radius - spec.outer);
  const bezel = bezelGeometry(spec, caseSpec);
  const plate = vertices(bezel.body);

  it('follows the case outline, inset, taller than wide', () => {
    const { min, max } = box(bezel.body);
    expect(max.x).toBeCloseTo(spec.outer, 3);
    expect(min.x).toBeCloseTo(-spec.outer, 3);
    expect(max.y).toBeCloseTo(halfLength, 3);
    expect(min.y).toBeCloseTo(-halfLength, 3);
    expect(caseSpec.radius - max.x).toBeCloseTo(0.04, 3);
  });

  it('curves down towards both ends like the case', () => {
    expect(box(bezel.body).max.z).toBeCloseTo(spec.height, 6);
    const ends = plate.filter(point => Math.abs(point.y) > halfLength - 0.05);
    expect(Math.max(...ends.map(point => point.z))).toBeLessThan(
      spec.height - 0.065
    );
    const middle = plate.filter(point => Math.abs(point.y) < 0.02);
    const [low] = [Math.min(...middle.map(point => point.z))];
    expect(low).toBeCloseTo(CASE_TOP, 2);
    expect(tonneauSag(length, length)).toBeCloseTo(0.08, 9);
  });

  it('leaves the round opening clear', () => {
    const closest = Math.min(...plate.map(radial));
    expect(closest).toBeGreaterThan(spec.inner);
    expect(radialRange(bezel.wall)[0]).toBeCloseTo(spec.inner, 4);
  });

  it('bends the wall with the plate, so they meet at the opening', () => {
    const top = (geometry: BufferGeometry, nearY: number) =>
      Math.max(
        ...vertices(geometry)
          .filter(point => Math.abs(point.x) < 0.01 && point.y * nearY > 0)
          .map(point => point.z)
      );
    expect(top(bezel.wall, 1)).toBeCloseTo(top(bezel.body, 1), 4);
    expect(top(bezel.wall, 1)).toBeLessThan(spec.height - 0.03);
  });

  it('holds one spline screw per spec screw', () => {
    const placements = screwPlacements(spec, caseSpec);
    expect(placements).toHaveLength(spec.screws);
    expect(islands(present(bezel.screws))).toBe(spec.screws);
  });

  it('spaces the screws evenly round the opening, on the plate’s top', () => {
    const outline = tonneauOutline(spec.outer - 0.012, halfLength - 0.012, 96);
    const positions = screwPlacements(spec, caseSpec).map(placement =>
      new Vector3().setFromMatrixPosition(placement)
    );
    const angles = positions.map(({ x, y }) => Math.atan2(y, x));
    const steps = angles
      .map((angle, index) => {
        const next = angles[(index + 1) % angles.length] ?? angle;
        return (next - angle + Math.PI * 4) % (Math.PI * 2);
      })
      .map(step => step * (180 / Math.PI));
    for (const step of steps) {
      expect(step).toBeGreaterThan(30);
      expect(step).toBeLessThan(60);
    }
    for (const position of positions) {
      const radius = radial(position);
      expect(radius - SCREW_RADIUS).toBeGreaterThan(spec.inner + 0.02);
      const rim = position
        .clone()
        .setZ(0)
        .multiplyScalar((radius + SCREW_RADIUS) / radius);
      expect(insideConvex(outline, [rim.x, rim.y])).toBe(true);
      expect(position.z).toBeCloseTo(
        spec.height - tonneauSag(position.y, length),
        9
      );
    }
  });

  it('builds round heads of the screw radius standing on the plate', () => {
    const screws = present(bezel.screws);
    const placements = screwPlacements(spec, caseSpec);
    const points = vertices(screws);
    for (const placement of placements) {
      const centre = new Vector3().setFromMatrixPosition(placement);
      const own = points.filter(point => point.distanceTo(centre) < 0.06);
      const reach = Math.max(
        ...own.map(point => Math.hypot(point.x - centre.x, point.y - centre.y))
      );
      expect(reach).toBeCloseTo(SCREW_RADIUS, 2);
      const rise = Math.max(...own.map(point => point.z - centre.z));
      expect(rise).toBeGreaterThan(0.008);
      expect(rise).toBeLessThan(0.02);
    }
  });
});

describe('tonneauOutline', () => {
  const outline = tonneauOutline(1.3, 1.6, 192);

  it('spans its half width and half length', () => {
    const xs = outline.map(([x]) => x);
    const ys = outline.map(([, y]) => y);
    expect(Math.max(...xs)).toBeCloseTo(1.3, 6);
    expect(Math.min(...xs)).toBeCloseTo(-1.3, 6);
    expect(Math.max(...ys)).toBeCloseTo(1.6, 6);
    expect(Math.min(...ys)).toBeCloseTo(-1.6, 6);
  });

  it('is a barrel: convex sides, narrower ends', () => {
    expect(insideConvex(outline, [0, 0])).toBe(true);
    const widthAt = (height: number) =>
      Math.max(
        ...outline
          .filter(([, y]) => Math.abs(y - height) < 0.05)
          .map(([x]) => x)
      );
    expect(widthAt(0.8)).toBeLessThan(1.3);
    expect(widthAt(0.8)).toBeGreaterThan(1.2);
    expect(widthAt(1.45)).toBeLessThan(widthAt(0.8) - 0.2);
  });
});
