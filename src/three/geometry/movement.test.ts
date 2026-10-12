import { Box3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import {
  gearOutline,
  movementGeometry,
  movementLayout,
  MOVEMENT_DEPTHS,
  MOVEMENT_RADIUS,
  type ClearZone,
  type GearLayout,
  type MovementGeometry,
} from './movement';
import type { Point } from './outlines';

/** The Tourbillon's aperture at 6, its date window at 3 and the hand hub. */
const TOURBILLON_ZONES: readonly ClearZone[] = [
  { x: 0, y: -0.45, radius: 0.23 },
  { x: 0.7, y: 0, radius: 0.15 },
  { x: 0, y: 0, radius: 0.07 },
];

/** An aperture at 9 instead, right over the train. */
const APERTURE_AT_NINE: readonly ClearZone[] = [
  { x: -0.45, y: 0, radius: 0.2 },
  { x: 0, y: 0, radius: 0.07 },
];

const ZONE_SETS = [
  ['the Tourbillon’s zones', TOURBILLON_ZONES],
  ['an aperture at 9', APERTURE_AT_NINE],
] as const;

const PARTS = ['plate', 'bridges', 'gears', 'jewels'] as const;
const TRIANGLE_BUDGET = 25_000;

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

interface Triangle {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly c: readonly [number, number, number];
}

function triangles(geometry: BufferGeometry): Triangle[] {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const vertex = (corner: number) => {
    const id = index ? index.getX(corner) : corner;
    return [position.getX(id), position.getY(id), position.getZ(id)] as const;
  };
  const result: Triangle[] = [];
  for (let corner = 0; corner < count; corner += 3) {
    result.push({
      a: vertex(corner),
      b: vertex(corner + 1),
      c: vertex(corner + 2),
    });
  }
  return result;
}

/** Twice the signed area of a triangle seen from the front (+Z). */
const frontArea = ({ a, b, c }: Triangle) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function segmentDistance(
  [px, py]: Point,
  [ax, ay]: Point,
  [bx, by]: Point
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/** How close a triangle, seen from the front, comes to a point. */
function triangleDistance(point: Point, triangle: Triangle): number {
  const corners = [triangle.a, triangle.b, triangle.c].map(
    ([x, y]) => [x, y] as const
  );
  const [a, b, c] = corners as [Point, Point, Point];
  const side = (from: Point, to: Point) =>
    (to[0] - from[0]) * (point[1] - from[1]) -
    (to[1] - from[1]) * (point[0] - from[0]);
  const sides = [side(a, b), side(b, c), side(c, a)];
  const covers =
    Math.abs(frontArea(triangle)) > 1e-14 &&
    (sides.every(value => value >= 0) || sides.every(value => value <= 0));
  if (covers) return 0;
  return Math.min(
    segmentDistance(point, a, b),
    segmentDistance(point, b, c),
    segmentDistance(point, c, a)
  );
}

function containsPoint(polygon: readonly Point[], [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] ?? [0, 0];
    const [xj, yj] = polygon[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const gap = (a: GearLayout, b: GearLayout) => Math.hypot(a.x - b.x, a.y - b.y);

const meshes = (a: GearLayout, b: GearLayout) =>
  a.driver === b.name || b.driver === a.name;

describe('movementLayout', () => {
  const layout = movementLayout(TOURBILLON_ZONES);
  const { gears } = layout;
  const named = (name: GearLayout['name']) => {
    const gear = gears.find(wheel => wheel.name === name);
    if (!gear) throw new Error(`No ${name} wheel.`);
    return gear;
  };

  it('lays out a train of six toothed, spoked wheels', () => {
    expect(gears.map(gear => gear.name)).toEqual([
      'barrel',
      'centre',
      'third',
      'fourth',
      'drive',
      'winding',
    ]);
    for (const gear of gears) {
      expect(gear.radius).toBeGreaterThanOrEqual(0.08);
      expect(gear.radius).toBeLessThanOrEqual(0.22);
      expect(gear.teeth).toBeGreaterThanOrEqual(24);
      expect(gear.teeth).toBeLessThanOrEqual(60);
      expect(gear.spokes).toBeGreaterThanOrEqual(3);
      expect(gear.rootRadius).toBeLessThan(gear.pitchRadius);
      expect(gear.pitchRadius).toBeLessThan(gear.radius);
    }
  });

  it('puts the mainspring barrel, the largest wheel, near 12', () => {
    const barrel = named('barrel');
    expect(barrel.y).toBeGreaterThan(0.35);
    expect(Math.abs(barrel.x)).toBeLessThan(0.05);
    for (const gear of gears) {
      expect(gear.radius).toBeLessThanOrEqual(barrel.radius);
    }
  });

  it('keeps every wheel inside the movement, at staggered depths', () => {
    for (const gear of gears) {
      expect(Math.hypot(gear.x, gear.y) + gear.radius).toBeLessThanOrEqual(
        MOVEMENT_RADIUS
      );
      expect(gear.bottom).toBeGreaterThanOrEqual(-0.05);
      expect(gear.top).toBeLessThanOrEqual(-0.03);
      expect(gear.bottom).toBeLessThan(gear.top);
    }
    expect(new Set(gears.map(gear => gear.top)).size).toBeGreaterThan(3);
  });

  it('meshes each wheel with its driver at their pitch circles, level with it', () => {
    for (const gear of gears) {
      if (!gear.driver) continue;
      const driver = named(gear.driver);
      expect(gap(gear, driver)).toBeCloseTo(
        gear.pitchRadius + driver.pitchRadius,
        9
      );
      // Their heights overlap, so the teeth engage.
      expect(Math.min(gear.top, driver.top)).toBeGreaterThan(
        Math.max(gear.bottom, driver.bottom)
      );
    }
  });

  it('overlaps no two wheels beyond the teeth of a meshing pair', () => {
    gears.forEach((a, index) => {
      for (const b of gears.slice(index + 1)) {
        const reach = meshes(a, b)
          ? a.pitchRadius + b.pitchRadius
          : a.radius + b.radius;
        expect(gap(a, b)).toBeGreaterThanOrEqual(reach - 1e-9);
      }
    });
  });

  it('turns meshing wheels so their teeth interleave', () => {
    for (const gear of gears) {
      if (!gear.driver) continue;
      const own = gearOutline(gear).outline;
      const other = gearOutline(named(gear.driver)).outline;
      expect(own.some(point => containsPoint(other, point))).toBe(false);
      expect(other.some(point => containsPoint(own, point))).toBe(false);
    }
  });

  it('keeps every wheel out of the clear zones', () => {
    for (const gear of gears) {
      for (const zone of TOURBILLON_ZONES) {
        expect(
          Math.hypot(gear.x - zone.x, gear.y - zone.y)
        ).toBeGreaterThanOrEqual(zone.radius + gear.radius);
      }
    }
  });

  it('seats a jewel over every arbor and screws on the bridges', () => {
    expect(layout.jewels).toHaveLength(gears.length);
    gears.forEach((gear, index) => {
      expect(layout.jewels[index]).toEqual([gear.x, gear.y]);
    });
    expect(layout.screws).toHaveLength(8);
  });

  it('leaves out the wheels an aperture would cover and keeps the rest in place', () => {
    const moved = movementLayout(APERTURE_AT_NINE);
    const names = moved.gears.map(gear => gear.name);
    expect(names).not.toContain('third');
    expect(names).toContain('barrel');
    for (const gear of moved.gears) {
      expect(gear).toEqual(named(gear.name));
      for (const zone of APERTURE_AT_NINE) {
        expect(
          Math.hypot(gear.x - zone.x, gear.y - zone.y)
        ).toBeGreaterThanOrEqual(zone.radius + gear.radius);
      }
    }
    for (const [x, y] of [...moved.jewels, ...moved.screws]) {
      for (const zone of APERTURE_AT_NINE) {
        expect(Math.hypot(x - zone.x, y - zone.y)).toBeGreaterThan(zone.radius);
      }
    }
  });

  it('is deterministic', () => {
    expect(movementLayout(TOURBILLON_ZONES)).toEqual(layout);
  });
});

describe.each(ZONE_SETS)('movementGeometry around %s', (_, zones) => {
  const geometry: MovementGeometry = movementGeometry(zones);

  it('builds one draw call per material with finite vertices', () => {
    for (const part of PARTS) {
      const positions = Array.from(
        geometry[part].getAttribute('position').array
      );
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.every(Number.isFinite)).toBe(true);
      expect(geometry[part].groups).toHaveLength(0);
      expect(geometry[part].getAttribute('normal')).toBeDefined();
    }
  });

  it('stays inside the movement radius and below the dial plane', () => {
    for (const part of PARTS) {
      const position = geometry[part].getAttribute('position');
      let reach = 0;
      for (let index = 0; index < position.count; index++) {
        reach = Math.max(
          reach,
          Math.hypot(position.getX(index), position.getY(index))
        );
      }
      const { min, max } = box(geometry[part]);
      expect(reach).toBeLessThanOrEqual(MOVEMENT_RADIUS);
      expect(min.z).toBeGreaterThanOrEqual(MOVEMENT_DEPTHS.plate.bottom - 1e-6);
      expect(max.z).toBeLessThanOrEqual(-0.002);
    }
  });

  it('stacks the layers from the plate at the back to the jewels', () => {
    const { plate, bridges, jewel, screw } = MOVEMENT_DEPTHS;
    const depth = (part: (typeof PARTS)[number]) => {
      const { min, max } = box(geometry[part]);
      return { bottom: min.z, top: max.z };
    };
    const tolerance = 1e-6;
    expect(depth('plate').bottom).toBeCloseTo(plate.bottom, 6);
    expect(depth('plate').top).toBeCloseTo(plate.top, 6);
    expect(depth('gears').bottom).toBeGreaterThanOrEqual(-0.05 - tolerance);
    expect(depth('gears').top).toBeLessThanOrEqual(-0.03 + tolerance);
    expect(depth('gears').bottom).toBeGreaterThan(plate.top);
    expect(depth('bridges').bottom).toBeCloseTo(bridges.bottom, 6);
    expect(depth('bridges').top).toBeCloseTo(screw.top, 6);
    expect(depth('bridges').bottom).toBeGreaterThan(depth('gears').top);
    expect(depth('jewels').bottom).toBeCloseTo(jewel.bottom, 6);
    expect(depth('jewels').top).toBeCloseTo(jewel.top, 6);
  });

  it('leaves every clear zone empty', () => {
    for (const part of PARTS) {
      const parts = triangles(geometry[part]);
      for (const zone of zones) {
        const nearest = Math.min(
          ...parts.map(triangle => triangleDistance([zone.x, zone.y], triangle))
        );
        expect(nearest).toBeGreaterThanOrEqual(zone.radius);
      }
    }
  });

  it('turns the top of every part towards the viewer', () => {
    for (const part of PARTS) {
      const top = box(geometry[part]).max.z;
      // Within a jewel's low dome of the very top.
      const highest = triangles(geometry[part]).filter(({ a, b, c }) =>
        [a, b, c].every(([, , z]) => z > top - 0.0005)
      );
      expect(highest.length).toBeGreaterThan(0);
      for (const triangle of highest) {
        expect(frontArea(triangle)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('stays within the triangle budget', () => {
    const total = PARTS.reduce(
      (sum, part) => sum + triangles(geometry[part]).length,
      0
    );
    expect(total).toBeLessThan(TRIANGLE_BUDGET);
  });
});

describe('movementGeometry for the Tourbillon', () => {
  const geometry = movementGeometry(TOURBILLON_ZONES);
  const layout = movementLayout(TOURBILLON_ZONES);

  it('skeletonises the plate, keeping 35–45% of the disc', () => {
    const { top } = MOVEMENT_DEPTHS.plate;
    const kept = triangles(geometry.plate)
      .filter(({ a, b, c }) =>
        [a, b, c].every(([, , z]) => Math.abs(z - top) < 1e-6)
      )
      .reduce((sum, triangle) => sum + Math.abs(frontArea(triangle)) / 2, 0);
    const share = kept / (Math.PI * MOVEMENT_RADIUS ** 2);
    expect(share).toBeGreaterThanOrEqual(0.35);
    expect(share).toBeLessThanOrEqual(0.45);
  });

  it('fills the plate out to the movement’s edge', () => {
    const { min, max } = box(geometry.plate);
    for (const extent of [min.x, min.y, -max.x, -max.y]) {
      expect(extent).toBeCloseTo(-MOVEMENT_RADIUS, 2);
    }
  });

  it('spreads the bridges’ X out to its four pads', () => {
    const { min, max } = box(geometry.bridges);
    // The pads sit 0.76 out on the diagonals, 0.056 in radius.
    const reach = 0.76 * Math.SQRT1_2 + 0.056;
    for (const extent of [max.x, max.y, -min.x, -min.y]) {
      expect(extent).toBeGreaterThan(reach - 0.005);
      expect(extent).toBeLessThan(reach + 0.01);
    }
  });

  it('builds the wheels where the layout puts them', () => {
    const { min, max } = box(geometry.gears);
    const edge = (pick: (gear: GearLayout) => number) => layout.gears.map(pick);
    expect(min.x).toBeCloseTo(Math.min(...edge(g => g.x - g.radius)), 2);
    expect(max.x).toBeCloseTo(Math.max(...edge(g => g.x + g.radius)), 2);
    expect(min.y).toBeCloseTo(Math.min(...edge(g => g.y - g.radius)), 2);
    expect(max.y).toBeCloseTo(Math.max(...edge(g => g.y + g.radius)), 2);
  });

  it('is deterministic', () => {
    const again = movementGeometry(TOURBILLON_ZONES);
    for (const part of PARTS) {
      expect(again[part].getAttribute('position').array).toEqual(
        geometry[part].getAttribute('position').array
      );
    }
  });
});
