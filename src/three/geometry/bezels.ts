import {
  BufferGeometry,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  RingGeometry,
} from 'three';

import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';

import type { BezelSize, BezelSpec, CaseSpec } from '../../watches';
import { LAYOUT } from '../layout';
import { extrude, lathe } from './build';
import { circle, type Point } from './outlines';

// The six bezels, each sitting on the case top (z = 0.1) and rising to its
// spec height. Every turned part is a lathe around +Z, so 12 o'clock is +Y
// and the parts need no rotation; only the tonneau plate is not round.

export interface BezelGeometry {
  /** The case metal: grip edge, hobnail band, stepped ring or top plate. */
  readonly body: BufferGeometry;
  /** Polished accent metal: the top edge, or a hobnail bezel's rim. */
  readonly edge: BufferGeometry | null;
  /** The printed insert, with planar UVs over [-outer, outer]. */
  readonly insert: BufferGeometry | null;
  /** The polished wall from the crystal up to the bezel's inner edge. */
  readonly wall: BufferGeometry;
  /** Accent metal spline screws on a tonneau's plate. */
  readonly screws: BufferGeometry | null;
}

type InsertBezelSpec = Extract<
  BezelSpec,
  { type: 'diveTimer' | 'gmt24' | 'minutes60' | 'octagon' }
>;
type ScrewPlateSpec = Extract<BezelSpec, { type: 'screwPlate' }>;

const CASE_TOP = 0.1;
/** Flanks start a little inside the case, so no crack shows at the seam. */
const BASE_SINK = 0.002;
/** Segments around every turned part. */
const SEGMENTS = 192;
/** Faces meeting at more than this keep a crisp edge. */
const CREASE_ANGLE = Math.PI / 5;
const FILLET_STEPS = 5;

/** How far an insert sits below the top of its bezel. */
export const INSERT_RECESS = 0.02;
/** Room between the insert's outer edge and the grip ring around it. */
const GRIP_CLEARANCE = 0.002;
const GRIP_BEVEL = 0.002;
/** The polished edge dips this far into the top of the grip. */
const EDGE_TUCK = 0.002;
/** The edge's crest, out from the insert, and how it rounds. */
const EDGE_CREST = 0.02;
const CREST_ROUND = 0.01;
const STEP_ROUND = 0.003;
/** Wall and edge reach under the insert, hiding the seam at its edges. */
const INSERT_TUCK = 0.003;
const INSERT_TUCK_DEPTH = 0.0015;
/** How a grip without ridges rounds over into its top. */
const SMOOTH_GRIP_ROUND = 0.008;

interface GripStyle {
  /** How deep the notches cut into the edge. */
  readonly depth: number;
  /** Share of each ridge left standing as a flat land between notches. */
  readonly land: number;
  /** How far below the bezel's top the grip ends. */
  readonly drop: number;
}

const GRIPS: Readonly<Record<InsertBezelSpec['type'], GripStyle>> = {
  diveTimer: { depth: 0.012, land: 0.5, drop: 0.01 },
  gmt24: { depth: 0.012, land: 0.5, drop: 0.01 },
  // The timing bezel's coarse, deep coin edge runs almost to the top.
  minutes60: { depth: 0.022, land: 0.42, drop: 0.004 },
  // An eight-sided guard has no grip; it is built on its own.
  octagon: { depth: 0, land: 0, drop: 0 },
};

/** Pyramid tiles around a hobnail bezel: u runs 0..HOBNAIL_REPEATS. */
export const HOBNAIL_REPEATS = 96;
/** Polished rims either side of the hobnail band. */
const HOBNAIL_RIM = 0.012;
const HOBNAIL_CROWN = 0.004;
const HOBNAIL_BAND_POINTS = 9;
const HOBNAIL_RIM_ROUND = 0.008;

/** The outer step of a stepped bezel sits this far below the inner one. */
const STEP_RISE = 0.012;
/** Where the step falls, as a share of the way out from the inner edge. */
const STEP_SPLIT = 0.5;
const STEP_SLOPE = 0.003;
const STEP_SOFT_EDGE = 0.008;
const STEP_EDGE_ROUND = 0.002;
/** The polished inner bevel down to the crystal. */
const STEP_LIP = 0.006;

/** How far the ends of a curved tonneau drop below its middle. */
const TONNEAU_DROP = 0.08;
/** Flat-ish ends across 12 and 6, gently convex sides. */
const TONNEAU_END_EXPONENT = 4;
const TONNEAU_SIDE_EXPONENT = 2.2;
const BISECTION_STEPS = 48;
const PLATE_BEVEL = 0.012;
const PLATE_BEVEL_STEPS = 4;
const PLATE_CAP_STEPS = 8;
/** The polished chamfer around the plate's opening. */
const WALL_CHAMFER = 0.02;

export const SCREW_RADIUS = 0.045;
/** How far out across the plate's top the screws sit, hole to edge. */
const SCREW_SPREAD = 0.5;
const SCREW_SIDES = 40;
const SCREW_SINK = 0.003;
const SCREW_RIM = 0.008;
const SCREW_DOME = 0.005;
const SCREW_EDGE_ROUND = 0.004;
const SPLINE_LOBES = 5;
const SPLINE_RADIUS = 0.024;
/** How deep the valleys between the spline's lobes reach, 0..0.5. */
const SPLINE_LOBE = 0.3;
const SPLINE_DEPTH = 0.007;
const SPLINE_TAPER = 0.8;

/** The height of a bezel's insert, where its print and target sit. */
export function bezelInsertHeight(spec: BezelSize): number {
  return spec.height - INSERT_RECESS;
}

export function bezelGeometry(
  spec: BezelSpec,
  caseSpec: CaseSpec
): BezelGeometry {
  switch (spec.type) {
    case 'diveTimer':
    case 'gmt24':
    case 'minutes60':
      return insertBezel(spec);
    case 'octagon':
      return octagonBezel(spec);
    case 'hobnail':
      return hobnailBezel(spec);
    case 'stepped':
      return steppedBezel(spec);
    case 'screwPlate':
      return screwPlateBezel(spec, caseSpec);
  }
}

/** A profile corner as [radius, height], with how much to round it. */
type Corner = readonly [radius: number, height: number, round?: number];

/**
 * Rounds the corners of a profile that ask for it with a quadratic curve,
 * never cutting more than half of either side.
 */
function filleted(corners: readonly Corner[]): Point[] {
  return corners.flatMap(([radius, height, round = 0], index): Point[] => {
    const before = corners[index - 1];
    const after = corners[index + 1];
    if (!before || !after || round === 0) return [[radius, height]];
    const toBefore = Math.hypot(before[0] - radius, before[1] - height);
    const toAfter = Math.hypot(after[0] - radius, after[1] - height);
    const cut = Math.min(round, toBefore / 2, toAfter / 2);
    const start: Point = [
      radius + ((before[0] - radius) / toBefore) * cut,
      height + ((before[1] - height) / toBefore) * cut,
    ];
    const end: Point = [
      radius + ((after[0] - radius) / toAfter) * cut,
      height + ((after[1] - height) / toAfter) * cut,
    ];
    return Array.from({ length: FILLET_STEPS + 1 }, (_, step) => {
      const t = step / FILLET_STEPS;
      const a = (1 - t) ** 2;
      const b = 2 * (1 - t) * t;
      const c = t ** 2;
      return [
        a * start[0] + b * radius + c * end[0],
        a * start[1] + b * height + c * end[1],
      ] as const;
    });
  });
}

/**
 * Smooth normals that keep crisp edges. toCreasedNormals matches vertices
 * on a 0.01 grid, coarser than a bezel's details, so it runs at a hundred
 * times the size.
 */
function smoothed(geometry: BufferGeometry): BufferGeometry {
  const scale = 100;
  geometry.scale(scale, scale, scale);
  const result = toCreasedNormals(geometry, CREASE_ANGLE);
  result.scale(1 / scale, 1 / scale, 1 / scale);
  return result;
}

/**
 * A turned part. Profiles run from the outside in, over the top, so their
 * faces look up and out.
 */
function turned(profile: readonly Point[]): BufferGeometry {
  return smoothed(lathe(profile, SEGMENTS));
}

/** How round an eight-sided guard's corners are, and its top edge. */
const OCTAGON_CORNER = 0.14;
const OCTAGON_BEVEL = 0.025;
const OCTAGON_CORNER_STEPS = 6;

/**
 * Eight flat sides, one across 12, `apothem` from the centre, the corners
 * rounded to `corner`.
 */
function octagonOutline(apothem: number, corner: number): Point[] {
  const step = Math.PI / 4;
  // Where each rounded corner's arc is centred, in from the sharp corner.
  const reach = apothem - corner;
  const centre = reach / Math.cos(step / 2);
  const points: Point[] = [];
  for (let side = 0; side < 8; side++) {
    const angle = step / 2 + side * step;
    for (let at = 0; at <= OCTAGON_CORNER_STEPS; at++) {
      const turn = angle - step / 2 + (at / OCTAGON_CORNER_STEPS) * step;
      points.push([
        Math.cos(angle) * centre + Math.cos(turn) * corner,
        Math.sin(angle) * centre + Math.sin(turn) * corner,
      ]);
    }
  }
  return points;
}

/**
 * A digital's eight-sided resin guard: a slab from the case top to the
 * bezel's height round the crystal, rounded at its corners and top edge,
 * its printing on a band lying on its top, and a wall down to the crystal.
 */
function octagonBezel(spec: InsertBezelSpec): BezelGeometry {
  const base = CASE_TOP - BASE_SINK;
  const insertZ = spec.height + 0.0006;
  const { inner: insertInner, outer: insertOuter } = spec.insert;
  const body = extrude(
    octagonOutline(spec.outer - OCTAGON_BEVEL, OCTAGON_CORNER),
    {
      depth: spec.height - base,
      bevel: OCTAGON_BEVEL,
      holes: [circle(insertInner, SEGMENTS)],
      bevelSegments: 3,
    }
  ).translate(0, 0, base);
  return {
    body,
    edge: null,
    insert: new RingGeometry(insertInner, insertOuter, SEGMENTS, 1).translate(
      0,
      0,
      insertZ
    ),
    wall: turned([
      [insertInner + INSERT_TUCK, spec.height],
      [insertInner, spec.height - INSERT_TUCK_DEPTH],
      [LAYOUT.crystalRadius, LAYOUT.crystalHeight],
    ]),
    screws: null,
  };
}

function insertBezel(spec: InsertBezelSpec): BezelGeometry {
  const style = GRIPS[spec.type];
  const insertZ = bezelInsertHeight(spec);
  const gripTop = spec.height - style.drop;
  const { inner: insertInner, outer: insertOuter } = spec.insert;
  const smooth = spec.grip === 0;
  // Where the polished edge meets the grip, inside its ridges.
  const reach =
    spec.outer - (smooth ? SMOOTH_GRIP_ROUND : style.depth) - EDGE_TUCK;
  const crest = Math.min(insertOuter + EDGE_CREST, (insertOuter + reach) / 2);
  const insert = new RingGeometry(insertInner, insertOuter, SEGMENTS, 1);
  return {
    body: smooth
      ? turned(
          filleted([
            [spec.outer, CASE_TOP - BASE_SINK],
            [spec.outer, gripTop, SMOOTH_GRIP_ROUND],
            [insertOuter + GRIP_CLEARANCE, gripTop],
          ])
        )
      : coinEdgeGrip(spec, style, gripTop),
    edge: turned(
      filleted([
        [reach, gripTop - EDGE_TUCK],
        [crest, spec.height, CREST_ROUND],
        [insertOuter, spec.height, STEP_ROUND],
        [insertOuter, insertZ],
        [insertOuter - INSERT_TUCK, insertZ - INSERT_TUCK_DEPTH],
      ])
    ),
    insert: insert.translate(0, 0, insertZ),
    wall: turned([
      [insertInner + INSERT_TUCK, insertZ - INSERT_TUCK_DEPTH],
      [insertInner, insertZ],
      [LAYOUT.crystalRadius, LAYOUT.crystalHeight],
    ]),
    screws: null,
  };
}

/**
 * A coin edge seen from the front: `ridges` flat lands at `outer`, with a
 * V notch `depth` deep between each pair.
 */
function coinEdge(
  ridges: number,
  outer: number,
  depth: number,
  land: number
): Point[] {
  const pitch = (Math.PI * 2) / ridges;
  const at = (angle: number, radius: number): Point => [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
  ];
  return Array.from({ length: ridges }, (_, index) => {
    const middle = index * pitch;
    return [
      at(middle - (land * pitch) / 2, outer),
      at(middle + (land * pitch) / 2, outer),
      at(middle + pitch / 2, outer - depth),
    ];
  }).flat();
}

function coinEdgeGrip(
  spec: InsertBezelSpec,
  style: GripStyle,
  gripTop: number
): BufferGeometry {
  const base = CASE_TOP - BASE_SINK;
  // The bevel grows the outline and shrinks the hole, so both start that
  // much inside their final size. Flat normals keep the ridges crisp.
  return extrude(
    coinEdge(spec.grip, spec.outer - GRIP_BEVEL, style.depth, style.land),
    {
      depth: gripTop - base,
      bevel: GRIP_BEVEL,
      holes: [
        circle(spec.insert.outer + GRIP_CLEARANCE + GRIP_BEVEL, SEGMENTS),
      ],
      curveSegments: 1,
    }
  ).translate(0, 0, base);
}

function hobnailBezel(spec: BezelSize): BezelGeometry {
  const rimTop = spec.height - HOBNAIL_CROWN;
  const bandOuter = spec.outer - HOBNAIL_RIM;
  const bandInner = spec.inner + HOBNAIL_RIM;
  const band = Array.from({ length: HOBNAIL_BAND_POINTS }, (_, index) => {
    const t = index / (HOBNAIL_BAND_POINTS - 1);
    return [
      MathUtils.lerp(bandOuter, bandInner, t),
      spec.height - HOBNAIL_CROWN * (2 * t - 1) ** 2,
    ] as const;
  });
  const body = lathe(band, SEGMENTS);
  // Around the ring for the pyramid tiles, and 0..1 from the inner edge out.
  const uv = body.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, uv.getX(index) * HOBNAIL_REPEATS, 1 - uv.getY(index));
  }
  return {
    body: smoothed(body),
    edge: turned(
      filleted([
        [spec.outer, CASE_TOP - BASE_SINK],
        [spec.outer, rimTop, HOBNAIL_RIM_ROUND],
        [bandOuter, rimTop],
      ])
    ),
    insert: null,
    wall: turned(
      filleted([
        [bandInner, rimTop],
        [spec.inner, rimTop, HOBNAIL_RIM_ROUND],
        [LAYOUT.crystalRadius, LAYOUT.crystalHeight],
      ])
    ),
    screws: null,
  };
}

function steppedBezel(spec: BezelSize): BezelGeometry {
  const lower = spec.height - STEP_RISE;
  const step = MathUtils.lerp(spec.inner, spec.outer, STEP_SPLIT);
  const lip = spec.inner + STEP_LIP;
  return {
    body: turned(
      filleted([
        [spec.outer, CASE_TOP - BASE_SINK],
        [spec.outer, lower - STEP_SLOPE, STEP_SOFT_EDGE],
        [step, lower, STEP_EDGE_ROUND],
        [step, spec.height - STEP_SLOPE, STEP_EDGE_ROUND],
        [lip, spec.height],
      ])
    ),
    edge: null,
    insert: null,
    wall: turned(
      filleted([
        [lip, spec.height],
        [spec.inner, spec.height - STEP_LIP],
        [LAYOUT.crystalRadius, LAYOUT.crystalHeight],
      ])
    ),
    screws: null,
  };
}

/**
 * How far a curved tonneau drops below its middle at `y` along its length:
 * the case and everything on it bend the same way.
 */
export function tonneauSag(y: number, length: number): number {
  return TONNEAU_DROP * (y / length) ** 2;
}

/** Distance from the centre to a tonneau outline at a (math) angle. */
function tonneauRadius(
  angle: number,
  halfWidth: number,
  halfLength: number
): number {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const outside = (radius: number) =>
    ((radius * cos) / halfWidth) ** TONNEAU_END_EXPONENT +
      ((radius * sin) / halfLength) ** TONNEAU_SIDE_EXPONENT >
    1;
  let low = 0;
  let high = Math.max(halfWidth, halfLength) * 2;
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const middle = (low + high) / 2;
    if (outside(middle)) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}

/**
 * A tonneau seen from the front: a barrel taller than wide, its ends
 * nearly flat and its sides gently convex. Points run anticlockwise from
 * 3 o'clock at even angles.
 */
export function tonneauOutline(
  halfWidth: number,
  halfLength: number,
  segments: number
): Point[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const radius = tonneauRadius(angle, halfWidth, halfLength);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
}

/** The outward unit normal of the tonneau outline at a point on it. */
function tonneauNormal(
  [x, y]: Point,
  halfWidth: number,
  halfLength: number
): Point {
  const gradient = (value: number, half: number, exponent: number) =>
    (Math.sign(value) * exponent * Math.abs(value / half) ** (exponent - 1)) /
    half;
  const nx = gradient(x, halfWidth, TONNEAU_END_EXPONENT);
  const ny = gradient(y, halfLength, TONNEAU_SIDE_EXPONENT);
  const length = Math.hypot(nx, ny);
  return [nx / length, ny / length];
}

type Vertex = readonly [x: number, y: number, z: number];

/**
 * Stitches closed rings of equal length into a surface. Rings run from the
 * outside in, over the top, and anticlockwise, so the faces look up and
 * out; a last ring of one point closes the surface as a fan. UVs are
 * planar over [-uvHalf, uvHalf].
 */
function sweep(
  rings: readonly (readonly Vertex[])[],
  uvHalf: number
): BufferGeometry {
  const positions = rings.flat().flat();
  const uvs = rings
    .flat()
    .flatMap(([x, y]) => [x / uvHalf / 2 + 0.5, y / uvHalf / 2 + 0.5]);
  const indices: number[] = [];
  let start = 0;
  rings.forEach((ring, index) => {
    const next = rings[index + 1];
    const nextStart = start + ring.length;
    if (next) {
      for (let k = 0; k < ring.length; k++) {
        const a = start + k;
        const b = start + ((k + 1) % ring.length);
        if (next.length === 1) {
          indices.push(a, b, nextStart);
        } else {
          const c = nextStart + ((k + 1) % ring.length);
          const d = nextStart + k;
          indices.push(a, b, d, b, c, d);
        }
      }
    }
    start = nextStart;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return smoothed(geometry);
}

/** The plate's outline, inset from the case by the gap left at its sides. */
function plateSize(spec: ScrewPlateSpec, caseSpec: CaseSpec) {
  const length = caseSpec.length ?? caseSpec.radius;
  const inset = caseSpec.radius - spec.outer;
  return { halfWidth: spec.outer, halfLength: length - inset, length };
}

function screwPlateBezel(
  spec: ScrewPlateSpec,
  caseSpec: CaseSpec
): BezelGeometry {
  const { halfWidth, halfLength, length } = plateSize(spec, caseSpec);
  const holeEdge = spec.inner + WALL_CHAMFER;
  const top = spec.height;
  // Even angles, so the opening's edge meets the turned wall vertex for
  // vertex.
  const samples = Array.from({ length: SEGMENTS }, (_, index) => {
    const angle = (index / SEGMENTS) * Math.PI * 2;
    const radius = tonneauRadius(angle, halfWidth, halfLength);
    const edge: Point = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    const hole: Point = [
      Math.cos(angle) * holeEdge,
      Math.sin(angle) * holeEdge,
    ];
    return { edge, hole, normal: tonneauNormal(edge, halfWidth, halfLength) };
  });
  type Sample = (typeof samples)[number];
  const ring = (place: (sample: Sample) => Vertex): Vertex[] =>
    samples.map(sample => {
      const [x, y, z] = place(sample);
      return [x, y, z - tonneauSag(y, length)];
    });
  // In from the outline along its normal, at a height.
  const inset = (sample: Sample, by: number, z: number): Vertex => [
    sample.edge[0] - sample.normal[0] * by,
    sample.edge[1] - sample.normal[1] * by,
    z,
  ];
  const bevel = Array.from({ length: PLATE_BEVEL_STEPS }, (_, index) => {
    const angle = (((index + 1) / PLATE_BEVEL_STEPS) * Math.PI) / 2;
    return ring(sample =>
      inset(
        sample,
        PLATE_BEVEL * (1 - Math.cos(angle)),
        top - PLATE_BEVEL + PLATE_BEVEL * Math.sin(angle)
      )
    );
  });
  const cap = Array.from({ length: PLATE_CAP_STEPS }, (_, index) => {
    const t = (index + 1) / PLATE_CAP_STEPS;
    return ring(sample => {
      const [x, y] = inset(sample, PLATE_BEVEL, top);
      return [
        MathUtils.lerp(x, sample.hole[0], t),
        MathUtils.lerp(y, sample.hole[1], t),
        top,
      ];
    });
  });
  const plate = sweep(
    [
      ring(sample => inset(sample, 0, CASE_TOP - BASE_SINK)),
      ring(sample => inset(sample, 0, top - PLATE_BEVEL)),
      ...bevel,
      ...cap,
    ],
    halfLength
  );

  // The polished chamfer round the opening, and its wall down past the
  // crystal into the flange, bent with the plate.
  const wall = lathe(
    [
      [holeEdge, top],
      [spec.inner, top - WALL_CHAMFER],
      [spec.inner, LAYOUT.rehautHeight],
    ],
    SEGMENTS
  );
  const position = wall.getAttribute('position');
  for (let index = 0; index < position.count; index++) {
    position.setZ(
      index,
      position.getZ(index) - tonneauSag(position.getY(index), length)
    );
  }

  const head = screwHead();
  return {
    body: plate,
    edge: null,
    insert: null,
    wall: smoothed(wall),
    screws: mergeGeometries(
      screwPlacements(spec, caseSpec).map(placement =>
        head.clone().applyMatrix4(placement)
      )
    ),
  };
}

/**
 * Where each spline screw sits: evenly spaced around the opening on an
 * ellipse halfway across the plate, none at the cardinal hours, each
 * standing square to the curved top. Apply to a screw built around +Z.
 */
export function screwPlacements(
  spec: ScrewPlateSpec,
  caseSpec: CaseSpec
): Matrix4[] {
  const { halfWidth, halfLength, length } = plateSize(spec, caseSpec);
  const holeEdge = spec.inner + WALL_CHAMFER;
  const across = (edge: number) =>
    MathUtils.lerp(holeEdge, edge - PLATE_BEVEL, SCREW_SPREAD);
  const rx = across(halfWidth);
  const ry = across(halfLength);
  return Array.from({ length: spec.screws }, (_, index) => {
    const angle = Math.PI / 2 + ((index + 0.5) / spec.screws) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const radius = (rx * ry) / Math.hypot(ry * cos, rx * sin);
    const x = cos * radius;
    const y = sin * radius;
    const slope = (-2 * TONNEAU_DROP * y) / length ** 2;
    return new Matrix4()
      .makeRotationX(Math.atan(slope))
      .setPosition(x, y, spec.height - tonneauSag(y, length));
  });
}

/**
 * A round, slightly domed screw head with a five-lobed spline recess, one
 * lobe towards 12. Its base sits a little below z = 0.
 */
function screwHead(): BufferGeometry {
  const angles = Array.from(
    { length: SCREW_SIDES },
    (_, index) => (index / SCREW_SIDES) * Math.PI * 2
  );
  const rimRadius = SCREW_RADIUS - SCREW_EDGE_ROUND;
  const dome = (radius: number) =>
    SCREW_RIM + SCREW_DOME * (1 - (radius / rimRadius) ** 2);
  const spline = (angle: number) =>
    SPLINE_RADIUS *
    (1 - SPLINE_LOBE * (1 - Math.cos(SPLINE_LOBES * (angle - Math.PI / 2))));
  const ring = (
    place: (angle: number) => readonly [radius: number, z: number]
  ) =>
    angles.map((angle): Vertex => {
      const [radius, z] = place(angle);
      return [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
    });
  const roundSteps = [1, 2, 3].map(step => (step / 3) * (Math.PI / 2));
  const domeSteps = [1, 2, 3].map(step => step / 3);
  const floor = SCREW_RIM + SCREW_DOME - SPLINE_DEPTH;
  return sweep(
    [
      ring(() => [SCREW_RADIUS, -SCREW_SINK]),
      ring(() => [SCREW_RADIUS, SCREW_RIM - SCREW_EDGE_ROUND]),
      ...roundSteps.map(angle =>
        ring(() => [
          rimRadius + SCREW_EDGE_ROUND * Math.cos(angle),
          SCREW_RIM - SCREW_EDGE_ROUND + SCREW_EDGE_ROUND * Math.sin(angle),
        ])
      ),
      // Over the dome to the recess, its last ring on the recess edge.
      ...domeSteps.map(t =>
        ring(angle => {
          const radius = MathUtils.lerp(rimRadius, spline(angle), t);
          return [radius, dome(radius)];
        })
      ),
      ring(angle => [spline(angle) * SPLINE_TAPER, floor]),
      [[0, 0, floor]],
    ],
    SCREW_RADIUS
  );
}
