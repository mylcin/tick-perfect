import { BufferGeometry } from 'three';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';

import { polar } from '../layout';
import { extrude, lathe } from './build';
import { circle, type Point } from './outlines';

// The skeleton movement seen through the Tourbillon's open dial, after the
// racing tourbillons: a dark openworked base plate at the back, the gear
// train at staggered depths and a bold titanium frame of bridges on top,
// pierced with slots and held down by spline screws.
//
// The gear train is placed first, each wheel meshing with its driver where
// it meets a bridge beam, so every arbor sits under a bridge. The plate and
// the bridges are signed distance fields (smooth unions of beams, rings and
// discs, which gives them their filleted, machined look), traced into
// outlines and extruded. Every part stays out of the clear zones it is
// given: the tourbillon aperture, the date window and the hand hub.

/** A circle the movement must leave empty, in dial units. */
export interface ClearZone {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** One merged geometry per material, all lying below the dial plane. */
export interface MovementGeometry {
  /** The dark base plate. */
  readonly plate: BufferGeometry;
  /** Titanium bridges and their screw heads. */
  readonly bridges: BufferGeometry;
  /** The wheels and the mainspring. */
  readonly gears: BufferGeometry;
  /** Ruby jewels on the bridges, one per arbor. */
  readonly jewels: BufferGeometry;
}

export type GearName =
  'barrel' | 'centre' | 'third' | 'fourth' | 'drive' | 'winding';

export interface GearLayout {
  readonly name: GearName;
  /** The arbor, in dial units. */
  readonly x: number;
  readonly y: number;
  /** Tip radius: the whole wheel fits inside it. */
  readonly radius: number;
  /** Where it rolls on its neighbour; meshing pairs touch here. */
  readonly pitchRadius: number;
  readonly rootRadius: number;
  readonly teeth: number;
  readonly spokes: number;
  /** Direction of its first tooth, in radians counter-clockwise from +X. */
  readonly phase: number;
  /** Height range below the dial plane. */
  readonly bottom: number;
  readonly top: number;
  /** The wheel it meshes with, or null for the barrel. */
  readonly driver: GearName | null;
}

interface MovementLayout {
  readonly gears: readonly GearLayout[];
  /** A jewel on the bridge over every arbor. */
  readonly jewels: readonly Point[];
  /** Spline screws at the ends of the bridges. */
  readonly screws: readonly Point[];
}

/** Everything stays inside this radius; the chapter ring covers the rest. */
export const MOVEMENT_RADIUS = 0.86;

/** Heights of each layer below the dial plane, from the back. */
export const MOVEMENT_DEPTHS = {
  plate: { bottom: -0.07, top: -0.062 },
  spring: { bottom: -0.05, top: -0.046 },
  bridges: { bottom: -0.024, top: -0.009 },
  jewel: { bottom: -0.0095, top: -0.0055 },
  screw: { bottom: -0.0095, top: -0.0045 },
} as const;

// Gear teeth. One module (pitch diameter per tooth) for the whole train, so
// any two wheels mesh.
const MODULE = 0.007;
const ADDENDUM = MODULE;
const DEDENDUM = 1.25 * MODULE;
/** Half a tooth's width at its root and tip, as fractions of its pitch. */
const TOOTH_ROOT_HALF = 0.27;
const TOOTH_TIP_HALF = 0.13;
const ARC_STEP = 0.012;
/** Rim, hub and spoke sizes of a wheel, as shares of its root radius. */
const WHEEL = {
  rim: 0.1,
  minRim: 0.014,
  hub: 0.16,
  minHub: 0.022,
  spokeHalf: 0.035,
  minSpokeHalf: 0.006,
};

// The bridge frame: two diagonal beams crossing in a ring around the hub,
// two pillars down the sides and a chevron over the barrel.
const BARREL_AT: Point = [0, 0.46];
const HUB_RING = { radius: 0.112, halfWidth: 0.024 };
const ARM = {
  start: HUB_RING.radius,
  end: 0.76,
  startHalf: 0.042,
  endHalf: 0.034,
};
const PAD_RADIUS = 0.056;
const PILLAR = { x: 0.42, top: 0.42, bottom: -0.42, halfWidth: 0.034 };
const BARREL_BRIDGE_HALF = 0.04;
const BOSS_RADIUS = 0.04;
const BARREL_BOSS_RADIUS = 0.058;
const BRIDGE_FILLET = 0.035;
const BRIDGE_BEVEL = 0.002;
/** Gap to a clear zone: room for the bevel and the traced outline. */
const BRIDGE_CLEARANCE = 0.016;

// Slots pierce every beam, stopping short of arbors, screws and junctions.
const SLOT_HALF = 0.012;
const SLOT_MIN_LENGTH = 0.06;
const SLOT_JUNCTION_GAP = 0.07;
const SLOT_ARBOR_GAP = BOSS_RADIUS + 0.025;
const SLOT_SCREW_GAP = 0.04;

// The base plate: a rim, ribs under the bridges and rings around the clear
// zones, everything else cut away.
const PLATE_RIM_INNER = 0.8;
const PLATE_RIB_EXTRA = 0.016;
const PLATE_BOSS_RADIUS = 0.06;
const PLATE_ZONE_RING = 0.035;
const PLATE_CLEARANCE = 0.006;
const PLATE_FILLET = 0.045;
/** Keeps the plate's traced edge just inside the movement radius. */
const PLATE_EDGE_INSET = 0.0015;

const GEAR_CLEARANCE = 0.012;
const JEWEL = { radius: 0.014, dome: 0.0012, segments: 20 };
const SCREW = {
  radius: 0.018,
  bevel: 0.001,
  segments: 20,
  lobes: 5,
  socketOuter: 0.0085,
  socketInner: 0.0048,
};
/** Two screws down the right pillar, which holds no arbor. */
const PILLAR_SCREWS_Y = [0.12, -0.2] as const;
/** How much solid bridge must surround a jewel or a screw head. */
const SEAT_MARGIN = 0.006;

// Marching squares over a square just larger than the movement.
const GRID_EXTENT = 0.875;
const GRID_CELLS = 280;
/** Cells per side of a block that is first tested from its corners. */
const GRID_BLOCK = 4;
const BRIDGE_TOLERANCE = 0.0006;
const PLATE_TOLERANCE = 0.001;
const MIN_LOOP_AREA = 2e-5;
/** Holes smaller than this are slivers; the shortest slot is larger. */
const MIN_HOLE_AREA = 8e-4;
const CREASE_ANGLE = Math.PI / 6;
const CREASE_UPSCALE = 100;

type BeamName =
  | 'upperRight'
  | 'lowerRight'
  | 'lowerLeft'
  | 'upperLeft'
  | 'leftPillar'
  | 'rightPillar';

interface Beam {
  readonly a: Point;
  readonly b: Point;
  readonly startHalf: number;
  readonly endHalf: number;
}

const armBeam = (angle: number): Beam => ({
  a: polar(angle, ARM.start),
  b: polar(angle, ARM.end),
  startHalf: ARM.startHalf,
  endHalf: ARM.endHalf,
});

const pillarBeam = (x: number): Beam => ({
  a: [x, PILLAR.top],
  b: [x, PILLAR.bottom],
  startHalf: PILLAR.halfWidth,
  endHalf: PILLAR.halfWidth,
});

const ARMS = ['upperRight', 'lowerRight', 'lowerLeft', 'upperLeft'] as const;

/** The frame's straight beams; arms are named by where they point. */
const FRAME: Readonly<Record<BeamName, Beam>> = {
  upperRight: armBeam(45),
  lowerRight: armBeam(135),
  lowerLeft: armBeam(225),
  upperLeft: armBeam(315),
  leftPillar: pillarBeam(-PILLAR.x),
  rightPillar: pillarBeam(PILLAR.x),
};

interface WheelPlan {
  readonly name: GearName;
  readonly teeth: number;
  readonly spokes: number;
  /**
   * The barrel's fixed arbor, or the wheel it meshes with and the beam that
   * holds its arbor.
   */
  readonly place:
    { readonly at: Point } | { readonly from: GearName; readonly on: BeamName };
  readonly bottom: number;
  readonly top: number;
}

/**
 * The train from the barrel at 12 down the left side to the wheel that
 * drives the tourbillon, and the winding wheel on the right. Depths step
 * so each pair of meshing wheels overlaps in height.
 */
const TRAIN: readonly WheelPlan[] = [
  {
    name: 'barrel',
    teeth: 60,
    spokes: 6,
    place: { at: BARREL_AT },
    bottom: -0.045,
    top: -0.034,
  },
  {
    name: 'centre',
    teeth: 48,
    spokes: 5,
    place: { from: 'barrel', on: 'upperLeft' },
    bottom: -0.039,
    top: -0.033,
  },
  {
    name: 'third',
    teeth: 36,
    spokes: 5,
    place: { from: 'centre', on: 'leftPillar' },
    bottom: -0.037,
    top: -0.031,
  },
  {
    name: 'fourth',
    teeth: 30,
    spokes: 4,
    place: { from: 'third', on: 'leftPillar' },
    bottom: -0.04,
    top: -0.034,
  },
  {
    name: 'drive',
    teeth: 24,
    spokes: 4,
    place: { from: 'fourth', on: 'lowerLeft' },
    bottom: -0.043,
    top: -0.037,
  },
  {
    name: 'winding',
    teeth: 40,
    spokes: 3,
    place: { from: 'barrel', on: 'upperRight' },
    bottom: -0.042,
    top: -0.036,
  },
];

const BARREL_SPRING = {
  inner: 0.04,
  outer: 0.18,
  turns: 5.5,
  width: 0.0055,
  segmentsPerTurn: 40,
};

// ---------------------------------------------------------------------------
// Layout

// Math.hypot is several times slower, and the fields call this a lot.
const length = (x: number, y: number) => Math.sqrt(x * x + y * y);

const distance = (ax: number, ay: number, bx: number, by: number) =>
  length(ax - bx, ay - by);

/** Wraps an angle into [-period / 2, period / 2). */
function wrapAngle(angle: number, period: number): number {
  return angle - period * Math.floor(angle / period + 0.5);
}

/**
 * The farthest point along `beam` that lies `reach` from `center`: where a
 * wheel meshing with the one at `center` rides on that beam.
 */
function pointOnBeam(beam: Beam, center: Point, reach: number): Point {
  const [ax, ay] = beam.a;
  const dx = beam.b[0] - ax;
  const dy = beam.b[1] - ay;
  const fx = ax - center[0];
  const fy = ay - center[1];
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - reach * reach;
  const root = Math.sqrt(b * b - 4 * a * c);
  const t = [(-b + root) / (2 * a), (-b - root) / (2 * a)].find(
    value => value >= 0 && value <= 1
  );
  if (t === undefined) throw new Error('A wheel cannot reach its beam.');
  return [ax + dx * t, ay + dy * t];
}

/** Every wheel of the train where it would sit with nothing in the way. */
function placeTrain(): GearLayout[] {
  const placed = new Map<GearName, GearLayout>();
  for (const plan of TRAIN) {
    const pitchRadius = (MODULE * plan.teeth) / 2;
    const toothAngle = (Math.PI * 2) / plan.teeth;
    let at: Point;
    let phase = 0;
    let driver: GearName | null = null;
    if ('at' in plan.place) {
      at = plan.place.at;
    } else {
      const from = placed.get(plan.place.from);
      if (!from) throw new Error(`${plan.name} is placed before its driver.`);
      driver = from.name;
      at = pointOnBeam(
        FRAME[plan.place.on],
        [from.x, from.y],
        from.pitchRadius + pitchRadius
      );
      // Turn the wheel so a gap faces each of the driver's teeth: the
      // driver's nearest tooth is `offset` along its pitch circle from the
      // line between the arbors, and this wheel's gap mirrors it.
      const toward = Math.atan2(at[1] - from.y, at[0] - from.x);
      const offset =
        wrapAngle(from.phase - toward, (Math.PI * 2) / from.teeth) *
        from.pitchRadius;
      phase = toward + Math.PI - offset / pitchRadius + toothAngle / 2;
    }
    placed.set(plan.name, {
      name: plan.name,
      x: at[0],
      y: at[1],
      radius: pitchRadius + ADDENDUM,
      pitchRadius,
      rootRadius: pitchRadius - DEDENDUM,
      teeth: plan.teeth,
      spokes: plan.spokes,
      phase,
      bottom: plan.bottom,
      top: plan.top,
      driver,
    });
  }
  return [...placed.values()];
}

const NOMINAL_TRAIN = placeTrain();

function nominal(name: GearName): GearLayout {
  const gear = NOMINAL_TRAIN.find(wheel => wheel.name === name);
  if (!gear) throw new Error(`The train has no ${name} wheel.`);
  return gear;
}

function isClear(
  zones: readonly ClearZone[],
  x: number,
  y: number,
  radius: number
): boolean {
  return zones.every(
    zone => distance(x, y, zone.x, zone.y) >= zone.radius + radius
  );
}

/** Wheels at the two ends of the chevron over the barrel. */
const CHEVRON_ENDS = ['centre', 'winding'] as const;

/** Screw heads: on each arm's pad, either side of the barrel, on a pillar. */
function screwPoints(): Point[] {
  const beside = CHEVRON_ENDS.map(nominal).map(
    gear => [(gear.x + BARREL_AT[0]) / 2, (gear.y + BARREL_AT[1]) / 2] as const
  );
  return [
    ...ARMS.map(name => FRAME[name].b),
    ...beside,
    ...PILLAR_SCREWS_Y.map(y => [PILLAR.x, y] as const),
  ];
}

const SCREWS = screwPoints();

// ---------------------------------------------------------------------------
// Distance fields

type Field = (x: number, y: number) => number;

/** Polynomial smooth minimum: a union of two shapes with a fillet of `k`. */
function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

function smoothUnion(fields: readonly Field[], k: number): Field {
  return (x, y) => {
    let value = Infinity;
    for (const field of fields) value = smoothMin(value, field(x, y), k);
    return value;
  };
}

function union(fields: readonly Field[]): Field {
  return (x, y) => {
    let value = Infinity;
    for (const field of fields) value = Math.min(value, field(x, y));
    return value;
  };
}

const discField =
  (cx: number, cy: number, radius: number): Field =>
  (x, y) =>
    distance(x, y, cx, cy) - radius;

const ringField =
  (cx: number, cy: number, radius: number, halfWidth: number): Field =>
  (x, y) =>
    Math.abs(distance(x, y, cx, cy) - radius) - halfWidth;

/** A beam from `a` to `b` with rounded ends, tapering between them. */
function beamField(
  a: Point,
  b: Point,
  startHalf: number,
  endHalf: number
): Field {
  const span = distance(a[0], a[1], b[0], b[1]);
  const ux = (b[0] - a[0]) / span;
  const uy = (b[1] - a[1]) / span;
  const slope = (startHalf - endHalf) / span;
  const cosine = Math.sqrt(1 - slope * slope);
  return (x, y) => {
    // Into the beam's frame: `along` from a to b, `across` either side.
    const px = x - a[0];
    const py = y - a[1];
    const along = px * ux + py * uy;
    const across = Math.abs(px * uy - py * ux);
    const k = -across * slope + along * cosine;
    if (k < 0) return length(across, along) - startHalf;
    if (k > cosine * span) {
      return length(across, along - span) - endHalf;
    }
    return across * cosine + along * slope - startHalf;
  };
}

/** Pushes a field out of every clear zone, `clearance` wider. */
function excludeZones(
  field: Field,
  zones: readonly ClearZone[],
  clearance: number
): Field {
  return (x, y) => {
    let value = field(x, y);
    for (const zone of zones) {
      value = Math.max(
        value,
        zone.radius + clearance - distance(x, y, zone.x, zone.y)
      );
    }
    return value;
  };
}

/** Every bridge beam: the frame, and the chevron from arbor to barrel. */
const BRIDGE_BEAMS: readonly Beam[] = [
  ...Object.values(FRAME),
  ...CHEVRON_ENDS.map(nominal).map(gear => ({
    a: [gear.x, gear.y] as const,
    b: BARREL_AT,
    startHalf: BARREL_BRIDGE_HALF,
    endHalf: BARREL_BRIDGE_HALF,
  })),
];

/**
 * Stadium-shaped slots along a beam, broken wherever something must stay
 * solid: its junctions with other beams, the arbors and the screws.
 */
function beamSlots(
  beam: Beam,
  junctions: readonly Point[],
  arbors: readonly Point[]
): Field[] {
  const span = distance(beam.a[0], beam.a[1], beam.b[0], beam.b[1]);
  const ux = (beam.b[0] - beam.a[0]) / span;
  const uy = (beam.b[1] - beam.a[1]) / span;
  const reach = Math.max(beam.startHalf, beam.endHalf);
  const blocked: [number, number][] = [];
  const block = (points: readonly Point[], gap: number) => {
    for (const [x, y] of points) {
      const along = (x - beam.a[0]) * ux + (y - beam.a[1]) * uy;
      const across = Math.abs((x - beam.a[0]) * uy - (y - beam.a[1]) * ux);
      if (across <= reach + gap && along > -gap && along < span + gap) {
        blocked.push([along - gap, along + gap]);
      }
    }
  };
  block([beam.a, beam.b, ...junctions], SLOT_JUNCTION_GAP);
  block(arbors, SLOT_ARBOR_GAP);
  block(SCREWS, SLOT_SCREW_GAP);
  blocked.sort(([a], [b]) => a - b);

  const slots: Field[] = [];
  let start = 0;
  for (const [from, to] of [...blocked, [span, span] as const]) {
    if (from - start >= SLOT_MIN_LENGTH) {
      const a: Point = [
        beam.a[0] + ux * (start + SLOT_HALF),
        beam.a[1] + uy * (start + SLOT_HALF),
      ];
      const b: Point = [
        beam.a[0] + ux * (from - SLOT_HALF),
        beam.a[1] + uy * (from - SLOT_HALF),
      ];
      slots.push(beamField(a, b, SLOT_HALF, SLOT_HALF));
    }
    start = Math.max(start, to);
  }
  return slots;
}

function bridgeField(
  gears: readonly GearLayout[],
  zones: readonly ClearZone[]
): Field {
  const arbors = gears.map(gear => [gear.x, gear.y] as const);
  const junctions = BRIDGE_BEAMS.flatMap(beam => [beam.a, beam.b]);
  const body = smoothUnion(
    [
      ...BRIDGE_BEAMS.map(beam =>
        beamField(beam.a, beam.b, beam.startHalf, beam.endHalf)
      ),
      ringField(0, 0, HUB_RING.radius, HUB_RING.halfWidth),
      ...ARMS.map(name => discField(...FRAME[name].b, PAD_RADIUS)),
      ...gears.map(gear =>
        discField(
          gear.x,
          gear.y,
          gear.name === 'barrel' ? BARREL_BOSS_RADIUS : BOSS_RADIUS
        )
      ),
    ],
    BRIDGE_FILLET
  );
  const slots = union(
    BRIDGE_BEAMS.flatMap(beam => beamSlots(beam, junctions, arbors))
  );
  const pierced: Field = (x, y) => Math.max(body(x, y), -slots(x, y));
  const inside: Field = (x, y) =>
    Math.max(
      pierced(x, y),
      length(x, y) - (MOVEMENT_RADIUS - BRIDGE_CLEARANCE)
    );
  return excludeZones(inside, zones, BRIDGE_CLEARANCE);
}

function plateField(
  gears: readonly GearLayout[],
  zones: readonly ClearZone[]
): Field {
  const ribs = smoothUnion(
    [
      (x, y) => PLATE_RIM_INNER - length(x, y),
      ...BRIDGE_BEAMS.map(beam =>
        beamField(
          beam.a,
          beam.b,
          beam.startHalf + PLATE_RIB_EXTRA,
          beam.endHalf + PLATE_RIB_EXTRA
        )
      ),
      ringField(0, 0, HUB_RING.radius, HUB_RING.halfWidth),
      ...gears.map(gear => discField(gear.x, gear.y, PLATE_BOSS_RADIUS)),
      ...zones.map(zone =>
        ringField(
          zone.x,
          zone.y,
          zone.radius + PLATE_CLEARANCE + PLATE_ZONE_RING / 2,
          PLATE_ZONE_RING / 2
        )
      ),
    ],
    PLATE_FILLET
  );
  const inside: Field = (x, y) =>
    Math.max(ribs(x, y), length(x, y) - (MOVEMENT_RADIUS - PLATE_EDGE_INSET));
  return excludeZones(inside, zones, PLATE_CLEARANCE);
}

interface MovementPlan {
  readonly layout: MovementLayout;
  readonly plate: Field;
  readonly bridges: Field;
}

function planMovement(zones: readonly ClearZone[]): MovementPlan {
  const gears = NOMINAL_TRAIN.filter(gear =>
    isClear(zones, gear.x, gear.y, gear.radius + GEAR_CLEARANCE)
  );
  const bridges = bridgeField(gears, zones);
  // A jewel or screw only goes where the bridge holds it all round.
  const seated = (radius: number) => (point: Point) =>
    isClear(zones, point[0], point[1], radius + BRIDGE_CLEARANCE) &&
    bridges(point[0], point[1]) <= -(radius + SEAT_MARGIN);
  return {
    layout: {
      gears,
      jewels: gears
        .map(gear => [gear.x, gear.y] as const)
        .filter(seated(JEWEL.radius)),
      screws: SCREWS.filter(seated(SCREW.radius)),
    },
    plate: plateField(gears, zones),
    bridges,
  };
}

/**
 * Where the movement's wheels, jewels and screws go for a given set of
 * clear zones. Wheels that would reach into a zone are left out; the rest
 * keep their places, so the train looks the same around any aperture.
 */
export function movementLayout(
  keepClear: readonly ClearZone[]
): MovementLayout {
  return planMovement(keepClear).layout;
}

// ---------------------------------------------------------------------------
// Tracing fields into outlines

const signedArea = (loop: readonly Point[]) =>
  loop.reduce((sum, [x, y], index) => {
    const [nx, ny] = loop[(index + 1) % loop.length] ?? [x, y];
    return sum + x * ny - nx * y;
  }, 0) / 2;

function containsPoint(loop: readonly Point[], [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i] ?? [0, 0];
    const [xj, yj] = loop[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The field on every node of the tracing grid. Every field here is a
 * distance bound (it changes no faster than the distance moved), so a block
 * of the grid whose corners all lie farther from the contour than they are
 * from the block's middle holds no contour at all: only its sign is filled
 * in, and only blocks near the contour are sampled in full.
 */
function sampleField(
  field: Field,
  coordinate: (index: number) => number,
  step: number
): Float64Array {
  const cells = GRID_CELLS;
  const stride = cells + 1;
  const values = new Float64Array(stride * stride).fill(Number.NaN);
  const sample = (i: number, j: number) => {
    const index = j * stride + i;
    const known = values[index] ?? Number.NaN;
    if (!Number.isNaN(known)) return known;
    const value = field(coordinate(i), coordinate(j));
    // Never exactly zero, so no contour point lands on a grid node.
    const stored = value === 0 ? 1e-12 : value;
    values[index] = stored;
    return stored;
  };
  const halfDiagonal = (GRID_BLOCK * step * Math.SQRT2) / 2;
  const uniform: [left: number, bottom: number, sign: number][] = [];
  for (let bottom = 0; bottom < cells; bottom += GRID_BLOCK) {
    for (let left = 0; left < cells; left += GRID_BLOCK) {
      const right = Math.min(left + GRID_BLOCK, cells);
      const top = Math.min(bottom + GRID_BLOCK, cells);
      const corners = [
        sample(left, bottom),
        sample(right, bottom),
        sample(left, top),
        sample(right, top),
      ];
      const sign = Math.sign(corners[0] ?? 0);
      const settled = corners.every(
        value => Math.sign(value) === sign && Math.abs(value) > halfDiagonal
      );
      if (settled) {
        uniform.push([left, bottom, sign]);
        continue;
      }
      for (let j = bottom; j <= top; j++) {
        for (let i = left; i <= right; i++) sample(i, j);
      }
    }
  }
  // Fill in the settled blocks last: their edges may have been sampled
  // exactly by a neighbour, and those values stay.
  for (const [left, bottom, sign] of uniform) {
    const right = Math.min(left + GRID_BLOCK, cells);
    const top = Math.min(bottom + GRID_BLOCK, cells);
    for (let j = bottom; j <= top; j++) {
      for (let i = left; i <= right; i++) {
        const index = j * stride + i;
        if (Number.isNaN(values[index] ?? Number.NaN)) values[index] = sign;
      }
    }
  }
  return values;
}

/**
 * The zero contour of `field` as closed loops, by marching squares. Each
 * loop runs with the solid on its left: outlines counter-clockwise, holes
 * clockwise.
 */
function traceLoops(field: Field): Point[][] {
  const cells = GRID_CELLS;
  const stride = cells + 1;
  const step = (GRID_EXTENT * 2) / cells;
  const coordinate = (index: number) => -GRID_EXTENT + index * step;
  const values = sampleField(field, coordinate, step);
  const valueAt = (i: number, j: number) => values[j * stride + i] ?? 1;

  // One id per grid edge: horizontal edges, then vertical ones.
  const verticalBase = cells * stride;
  const edgeCount = verticalBase + cells * stride;
  const next = new Int32Array(edgeCount).fill(-1);
  const pointX = new Float64Array(edgeCount);
  const pointY = new Float64Array(edgeCount);

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      // Corners counter-clockwise from the bottom left, and the edges after
      // each one: bottom, right, top, left.
      const corners = [
        valueAt(i, j),
        valueAt(i + 1, j),
        valueAt(i + 1, j + 1),
        valueAt(i, j + 1),
      ] as const;
      const [bottomLeft, bottomRight, topRight, topLeft] = corners;
      const solid = bottomLeft < 0;
      if (
        solid === bottomRight < 0 &&
        solid === topRight < 0 &&
        solid === topLeft < 0
      ) {
        continue;
      }
      const inside = corners.map(value => value < 0);

      const x0 = coordinate(i);
      const y0 = coordinate(j);
      const edges = [
        { id: j * cells + i, from: 0, to: 1 },
        { id: verticalBase + j * stride + i + 1, from: 1, to: 2 },
        { id: (j + 1) * cells + i, from: 3, to: 2 },
        { id: verticalBase + j * stride + i, from: 0, to: 3 },
      ] as const;
      const corner = [
        [x0, y0],
        [x0 + step, y0],
        [x0 + step, y0 + step],
        [x0, y0 + step],
      ] as const;
      const leaving: number[] = [];
      const entering: number[] = [];
      edges.forEach((edge, k) => {
        const here = inside[k];
        const ahead = inside[(k + 1) % 4];
        if (here === ahead) return;
        (here ? leaving : entering).push(k);
        const from = corners[edge.from];
        const to = corners[edge.to];
        const t = from / (from - to);
        const [ax, ay] = corner[edge.from];
        const [bx, by] = corner[edge.to];
        pointX[edge.id] = ax + (bx - ax) * t;
        pointY[edge.id] = ay + (by - ay) * t;
      });
      // A saddle joins its two solid corners when the centre is solid too.
      const centreInside = corners.reduce((sum, value) => sum + value, 0) < 0;
      for (const k of leaving) {
        const end =
          leaving.length === 1
            ? entering[0]
            : centreInside
              ? (k + 1) % 4
              : (k + 3) % 4;
        const from = edges[k]?.id;
        const to = end === undefined ? undefined : edges[end]?.id;
        if (from !== undefined && to !== undefined) next[from] = to;
      }
    }
  }

  const loops: Point[][] = [];
  const visited = new Uint8Array(edgeCount);
  for (let startId = 0; startId < edgeCount; startId++) {
    if (next[startId] === -1 || visited[startId]) continue;
    const loop: Point[] = [];
    let id = startId;
    while (id !== -1 && !visited[id]) {
      visited[id] = 1;
      loop.push([pointX[id] ?? 0, pointY[id] ?? 0]);
      id = next[id] ?? -1;
    }
    loops.push(loop);
  }
  return loops;
}

const segmentDistance = (point: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq
          )
        );
  return distance(point[0], point[1], a[0] + dx * t, a[1] + dy * t);
};

/** Douglas–Peucker on an open chain, keeping both ends. */
function simplifyChain(chain: readonly Point[], tolerance: number): Point[] {
  const keep = new Uint8Array(chain.length);
  keep[0] = 1;
  keep[chain.length - 1] = 1;
  const stack: [number, number][] = [[0, chain.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() ?? [0, 0];
    const a = chain[first];
    const b = chain[last];
    if (!a || !b) continue;
    let farthest = -1;
    let worst = tolerance;
    for (let index = first + 1; index < last; index++) {
      const point = chain[index];
      if (!point) continue;
      const offset = segmentDistance(point, a, b);
      if (offset > worst) {
        worst = offset;
        farthest = index;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return chain.filter((_, index) => keep[index] === 1);
}

function simplifyLoop(loop: readonly Point[], tolerance: number): Point[] {
  const [start] = loop;
  if (!start || loop.length < 8) return [...loop];
  // Split the loop at its farthest point from the start and simplify both
  // halves, so the ends of each chain are real corners of the outline.
  let split = 0;
  let farthest = 0;
  loop.forEach(([x, y], index) => {
    const reach = distance(x, y, start[0], start[1]);
    if (reach > farthest) {
      farthest = reach;
      split = index;
    }
  });
  const first = simplifyChain(loop.slice(0, split + 1), tolerance);
  const second = simplifyChain([...loop.slice(split), start], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

interface Region {
  readonly outline: Point[];
  readonly holes: Point[][];
}

/**
 * Whether a hole is a sliver left where two fillets almost meet: too small
 * to read as openwork and clear of every zone, so it can be filled in.
 */
function isSliver(loop: readonly Point[], zones: readonly ClearZone[]) {
  if (-signedArea(loop) >= MIN_HOLE_AREA) return false;
  const cx = loop.reduce((sum, [x]) => sum + x, 0) / loop.length;
  const cy = loop.reduce((sum, [, y]) => sum + y, 0) / loop.length;
  const reach = Math.max(...loop.map(([x, y]) => distance(x, y, cx, cy)));
  return isClear(zones, cx, cy, reach);
}

/** The solid regions of a field: each outline with the holes inside it. */
function traceRegions(
  field: Field,
  tolerance: number,
  zones: readonly ClearZone[]
): Region[] {
  const loops = traceLoops(field)
    .map(loop => simplifyLoop(loop, tolerance))
    .map(loop => ({ loop, area: signedArea(loop) }))
    .filter(
      ({ loop, area }) =>
        loop.length >= 3 &&
        Math.abs(area) > MIN_LOOP_AREA &&
        !(area < 0 && isSliver(loop, zones))
    );
  const outlines = loops
    .filter(({ area }) => area > 0)
    .map(({ loop, area }) => ({ outline: loop, area, holes: [] as Point[][] }));
  for (const { loop, area } of loops) {
    if (area > 0) continue;
    const [probe] = loop;
    if (!probe) continue;
    // A hole belongs to the smallest outline around it.
    const parent = outlines
      .filter(candidate => containsPoint(candidate.outline, probe))
      .reduce<(typeof outlines)[number] | undefined>(
        (best, candidate) =>
          !best || candidate.area < best.area ? candidate : best,
        undefined
      );
    parent?.holes.push(loop);
  }
  return outlines.map(({ outline, holes }) => ({ outline, holes }));
}

// ---------------------------------------------------------------------------
// Geometry

/**
 * Smooths normals across gentle curves and keeps sharp edges. The helper
 * merges vertices on a 0.01 grid, coarser than a gear tooth, so it runs on
 * the part scaled up a hundredfold.
 */
function creased(geometry: BufferGeometry): BufferGeometry {
  const scalePositions = (part: BufferGeometry, factor: number) => {
    const { array } = part.getAttribute('position');
    for (let index = 0; index < array.length; index++) {
      array[index] = (array[index] ?? 0) * factor;
    }
  };
  scalePositions(geometry, CREASE_UPSCALE);
  const result = toCreasedNormals(geometry, CREASE_ANGLE);
  scalePositions(result, 1 / CREASE_UPSCALE);
  return result;
}

/** Merges parts into one draw call; an empty part list is an empty mesh. */
function mergeAll(parts: readonly BufferGeometry[]): BufferGeometry {
  return parts.length > 0 ? mergeGeometries([...parts]) : new BufferGeometry();
}

function extrudeRegions(
  regions: readonly Region[],
  { bottom, top, bevel }: { bottom: number; top: number; bevel: number }
): BufferGeometry[] {
  return regions.map(({ outline, holes }) =>
    extrude(outline, {
      depth: top - bottom,
      bevel,
      holes,
      bevelSegments: 1,
    }).translate(0, 0, bottom)
  );
}

function arc(
  radius: number,
  from: number,
  to: number,
  [cx, cy]: Point
): Point[] {
  const count = Math.max(
    2,
    Math.ceil((Math.abs(to - from) * radius) / ARC_STEP) + 1
  );
  return Array.from({ length: count }, (_, index) => {
    const angle = from + ((to - from) * index) / (count - 1);
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

/**
 * A wheel seen from the front, in dial units: its toothed outline, and the
 * windows between its spokes as holes.
 */
export function gearOutline(gear: GearLayout): {
  outline: Point[];
  holes: Point[][];
} {
  const center: Point = [gear.x, gear.y];
  const pitch = (Math.PI * 2) / gear.teeth;
  const outline: Point[] = [];
  const at = (radius: number, angle: number): Point => [
    gear.x + Math.cos(angle) * radius,
    gear.y + Math.sin(angle) * radius,
  ];
  for (let tooth = 0; tooth < gear.teeth; tooth++) {
    const angle = gear.phase + tooth * pitch;
    outline.push(
      at(gear.rootRadius, angle - pitch * TOOTH_ROOT_HALF),
      at(gear.radius, angle - pitch * TOOTH_TIP_HALF),
      at(gear.radius, angle + pitch * TOOTH_TIP_HALF),
      at(gear.rootRadius, angle + pitch * TOOTH_ROOT_HALF)
    );
  }

  const share = (fraction: number, least: number) =>
    Math.max(least, gear.rootRadius * fraction);
  const rim = gear.rootRadius - share(WHEEL.rim, WHEEL.minRim);
  // The barrel's arbor is as wide as the core the mainspring coils round.
  const hub =
    gear.name === 'barrel'
      ? BARREL_SPRING.inner
      : share(WHEEL.hub, WHEEL.minHub);
  const spokeHalf = share(WHEEL.spokeHalf, WHEEL.minSpokeHalf);
  const spokeAngle = (Math.PI * 2) / gear.spokes;
  const holes = Array.from({ length: gear.spokes }, (_, spoke) => {
    const from = gear.phase + spoke * spokeAngle;
    const to = from + spokeAngle;
    // The spoke's straight sides run at a fixed distance from its centre
    // line, so they cut a wider angle at the hub than at the rim.
    const atHub = Math.asin(spokeHalf / hub);
    const atRim = Math.asin(spokeHalf / rim);
    return [
      ...arc(hub, from + atHub, to - atHub, center),
      ...arc(rim, to - atRim, from + atRim, center),
    ];
  });
  return { outline, holes };
}

/** The coiled mainspring inside the barrel, as one spiral band. */
function springOutline(barrel: GearLayout): Point[] {
  const { inner, outer, turns, width, segmentsPerTurn } = BARREL_SPRING;
  const count = Math.round(turns * segmentsPerTurn);
  const outside: Point[] = [];
  const inside: Point[] = [];
  for (let index = 0; index <= count; index++) {
    const t = index / count;
    const angle = barrel.phase + t * turns * Math.PI * 2;
    const radius = inner + width + (outer - inner - width * 2) * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    outside.push([
      barrel.x + cos * (radius + width / 2),
      barrel.y + sin * (radius + width / 2),
    ]);
    inside.push([
      barrel.x + cos * (radius - width / 2),
      barrel.y + sin * (radius - width / 2),
    ]);
  }
  return [...outside, ...inside.reverse()];
}

function gearGeometry(gears: readonly GearLayout[]): BufferGeometry {
  const wheels = gears.map(gear => {
    const { outline, holes } = gearOutline(gear);
    return extrude(outline, { depth: gear.top - gear.bottom, holes }).translate(
      0,
      0,
      gear.bottom
    );
  });
  const springs = gears
    .filter(gear => gear.name === 'barrel')
    .map(barrel =>
      extrude(springOutline(barrel), {
        depth: MOVEMENT_DEPTHS.spring.top - MOVEMENT_DEPTHS.spring.bottom,
      }).translate(0, 0, MOVEMENT_DEPTHS.spring.bottom)
    );
  return creased(mergeAll([...wheels, ...springs]));
}

/** A spline screw head: a round head with a five-lobed socket. */
function screwHead([x, y]: Point): BufferGeometry {
  const { bottom, top } = MOVEMENT_DEPTHS.screw;
  const { lobes } = SCREW;
  const socket = Array.from({ length: lobes * 2 }, (_, index) => {
    const angle = Math.PI / 2 + (index * Math.PI) / lobes;
    const radius = index % 2 === 0 ? SCREW.socketOuter : SCREW.socketInner;
    return [
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
    ] as const;
  });
  return extrude(circle(SCREW.radius, SCREW.segments, [x, y]), {
    depth: top - bottom,
    bevel: SCREW.bevel,
    holes: [socket],
    bevelSegments: 1,
  }).translate(0, 0, bottom);
}

function jewelGeometry(jewels: readonly Point[]): BufferGeometry {
  const { bottom, top } = MOVEMENT_DEPTHS.jewel;
  // A low dome, so the jewel catches a highlight. The profile runs up the
  // side and in over the top, so the lathe's faces point out and up.
  const { radius, dome, segments } = JEWEL;
  const profile: Point[] = [
    [radius, bottom],
    [radius, top - dome],
    [radius * 0.55, top - dome / 4],
    [0, top],
  ];
  return mergeAll(
    jewels.map(([x, y]) => lathe(profile, segments).translate(x, y, 0))
  );
}

/**
 * The skeleton movement under the Tourbillon's chapter ring, built around
 * `keepClear`. All of it lies inside MOVEMENT_RADIUS and below the dial
 * plane (see MOVEMENT_DEPTHS); place it at the dial's origin, unrotated.
 */
export function movementGeometry(
  keepClear: readonly ClearZone[]
): MovementGeometry {
  const { layout, plate, bridges } = planMovement(keepClear);
  const plateParts = extrudeRegions(
    traceRegions(plate, PLATE_TOLERANCE, keepClear),
    {
      ...MOVEMENT_DEPTHS.plate,
      bevel: 0,
    }
  );
  const bridgeParts = extrudeRegions(
    traceRegions(bridges, BRIDGE_TOLERANCE, keepClear),
    {
      ...MOVEMENT_DEPTHS.bridges,
      bevel: BRIDGE_BEVEL,
    }
  );
  return {
    plate: creased(mergeAll(plateParts)),
    bridges: creased(
      mergeAll([...bridgeParts, ...layout.screws.map(screwHead)])
    ),
    gears: gearGeometry(layout.gears),
    jewels: jewelGeometry(layout.jewels),
  };
}
