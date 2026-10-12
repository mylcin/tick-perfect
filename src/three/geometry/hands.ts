import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type {
  HourHandStyle,
  MinuteHandStyle,
  SecondsHandStyle,
} from '../../watches';
import { extrude } from './build';
import {
  batonHand,
  circle,
  dauphineHand,
  leafHand,
  type Point,
} from './outlines';

// The hands. Each points up (+Y) from its pivot at the origin and rises
// towards the viewer (+Z) from z = 0, so the scene only turns it about +Z
// and lifts it to its place in the stack. Metal, lume and a painted tip are
// separate geometries, one material each, and the pieces of each are merged
// into a single draw call.

export interface HandGeometry {
  readonly metal: BufferGeometry;
  /** Lume, standing a little proud of the metal around it. */
  readonly lume: BufferGeometry | null;
  /** A painted tip in a contrasting colour. */
  readonly tip: BufferGeometry | null;
}

interface GmtHandGeometry {
  /** The hand itself, riding on its outline. */
  readonly hand: BufferGeometry;
  /** A dark edge behind the hand, larger all round, so it reads on any dial. */
  readonly outline: BufferGeometry;
  readonly lume: BufferGeometry | null;
}

/** Metal thickness of the hour and minute hands, and their polished bevel. */
const HAND_DEPTH = 0.014;
const HAND_BEVEL = 0.003;
/** The seconds hands are lighter. */
const SECONDS_DEPTH = 0.012;
const SECONDS_BEVEL = 0.002;
/** Lume stands this far proud of the metal around it. */
const LUME_PROUD = 0.003;
/** An inlay on solid metal sinks this far into it. */
const LUME_SINK = 0.004;
/** Lume filling an opening starts just above the hand's underside. */
const LUME_FLOOR = 0.001;
/** Polished metal left around a lume inlay. */
const LUME_BORDER = 0.008;
/** Inlays start clear of the hub over the pivot. */
const LUME_START = 0.075;
/** The round collar at each pivot, a size smaller on each hand up the stack. */
const COLLAR = {
  hour: 0.042,
  minute: 0.034,
  gmt: 0.028,
  seconds: 0.022,
} as const;
const COLLAR_SEGMENTS = 40;
const DOT_SEGMENTS = 32;
/** Most an arc turns between two outline points. */
const ARC_STEP = Math.PI / 16;
/** Corners that would reach further out than this many offsets are cut. */
const MITER_LIMIT = 2.5;
/** Points this close to the axis lie on it. */
const EPSILON = 1e-9;

interface BladeSize {
  /** Full width at the widest point. */
  readonly width: number;
  /** How far the hand reaches back past the pivot. */
  readonly tail: number;
}

interface Blade extends BladeSize {
  readonly length: number;
  readonly collar: number;
  readonly lume: boolean;
}

type BladeStyle = Exclude<HourHandStyle, 'mercedes'>;

/** Hour blades: shorter and broader than the minute hand of the same style. */
const HOUR_BLADES: Readonly<Record<BladeStyle, BladeSize>> = {
  sword: { width: 0.068, tail: 0.09 },
  baton: { width: 0.048, tail: 0.09 },
  dauphine: { width: 0.092, tail: 0.06 },
  leaf: { width: 0.078, tail: 0.06 },
  skeleton: { width: 0.09, tail: 0.09 },
};

const MINUTE_BLADES: Readonly<Record<MinuteHandStyle, BladeSize>> = {
  sword: { width: 0.052, tail: 0.11 },
  baton: { width: 0.034, tail: 0.12 },
  dauphine: { width: 0.07, tail: 0.07 },
  leaf: { width: 0.058, tail: 0.07 },
  skeleton: { width: 0.07, tail: 0.12 },
};

/** Where a sword is widest, as a fraction of its length. */
const SWORD_SHOULDER = 0.84;

/**
 * The diver's hour hand: a stem into a round frame around a three-pointed
 * star, and a short point beyond it. Half-widths and radii.
 */
const MERCEDES = {
  tail: 0.1,
  chamfer: 0.006,
  stemBase: 0.026,
  stemTop: 0.023,
  /** Centre of the frame, as a fraction of the length. */
  frameAt: 0.74,
  frameRadius: 0.072,
  frameWall: 0.016,
  spokeWidth: 0.011,
  tipBase: 0.02,
} as const;
/** The star's spokes: one towards the tip and two 120° either side. */
const MERCEDES_SPOKES = [0, 1, 2].map(
  index => Math.PI / 2 + (index * 2 * Math.PI) / 3
);

/** Dauphine heights: the ridge, and the outer edge where the hand is widest. */
const DAUPHINE = { ridge: 0.016, edge: 0.006, lumeHalf: 0.0065 } as const;

/** A leaf is softer: a deeper, rounder bevel. */
const LEAF = { bevel: 0.004, bevelSegments: 4, lumeFrom: 0.3 } as const;

/** Openwork blades: frame wall, where the opening starts, and lume from. */
const SKELETON = {
  shoulder: 0.78,
  wall: 0.014,
  bevel: 0.002,
  openFrom: 0.07,
  lumeFrom: 0.7,
} as const;

const SECONDS_COLLAR: Pad = { y: 0, radius: COLLAR.seconds };

/** The diver's seconds hand: a needle with a lume disc three-quarters out. */
const LOLLIPOP = {
  half: 0.007,
  tail: 0.22,
  point: 0.02,
  weight: { y: -0.165, radius: 0.026 },
  discAt: 0.7,
  disc: 0.045,
  lume: 0.032,
} as const;

/** The chronograph hand: a fine needle with a painted arrowhead. */
const ARROW = {
  half: 0.005,
  tail: 0.2,
  weight: { y: -0.15, radius: 0.028 },
  head: 0.09,
  headHalf: 0.025,
  /** The arrowhead's swallowtail back. */
  notch: 0.02,
  /** How far the needle runs on under the arrowhead. */
  overlap: 0.012,
  /** The arrowhead stands a hair above the needle, so they never z-fight. */
  rise: 0.0015,
  pip: 0.0065,
  pipFromTip: 0.045,
} as const;

/** The dress seconds hand: a tapering needle with a ring on a long tail. */
const NEEDLE = {
  depth: 0.01,
  bevel: 0.001,
  tail: 0.26,
  half: 0.004,
  pointHalf: 0.0015,
  point: 0.012,
  ring: 0.03,
  ringHole: 0.015,
} as const;

/** The openwork seconds hand, lume in its tip and a hollow lozenge weight. */
const SKELETON_SECONDS = {
  bevel: 0.0015,
  half: 0.012,
  wall: 0.006,
  point: 0.05,
  openFrom: 0.05,
  lume: 0.12,
  weight: { y: -0.17, half: 0.032, height: 0.045, wall: 0.008 },
} as const;

const GMT_DEPTH = 0.012;
const GMT_BEVEL = 0.002;
/** The dark edge: how far it shows round the hand, and how thick it is. */
const GMT_EDGE = { width: 0.01, depth: 0.008, bevel: 0.001 } as const;
/** The hand rides this far up on its edge. */
const GMT_LIFT = 0.004;

/** The pilot's GMT hand: a thin stem and a big triangular arrow. */
const GMT_ARROW = {
  tail: 0.1,
  half: 0.007,
  headHalf: 0.0425,
  head: 0.08,
  border: 0.011,
} as const;

/**
 * The travel-time hand: a fine stem with a small openwork arrowhead at its
 * tip, its barbs swept back, as on a dress watch's second time zone. The
 * head is as wide as the part of the target the hand covers.
 */
const GMT_HOLLOW = {
  tail: 0.07,
  half: 0.0035,
  /** The head's length, its half-width at the barbs and its frame. */
  head: 0.075,
  headHalf: 0.028,
  frame: 0.0065,
  /** How far the stem runs up between the barbs. */
  notch: 0.016,
  /** A finer dark edge than a sports hand's, for a fine hand. */
  edge: 0.005,
} as const;

/** The hour hand, pointing up from its pivot. Typical length 0.56. */
export function hourHandGeometry(
  style: HourHandStyle,
  length: number,
  lume: boolean
): HandGeometry {
  if (style === 'mercedes') return mercedesHand(length, lume);
  return BLADES[style]({
    length,
    ...HOUR_BLADES[style],
    collar: COLLAR.hour,
    lume,
  });
}

/** The minute hand. Typical length 0.86, or 0.80 inside a chapter ring. */
export function minuteHandGeometry(
  style: MinuteHandStyle,
  length: number,
  lume: boolean
): HandGeometry {
  return BLADES[style]({
    length,
    ...MINUTE_BLADES[style],
    collar: COLLAR.minute,
    lume,
  });
}

/** The seconds hand. Typical length 1.02, or 0.95 inside a chapter ring. */
export function secondsHandGeometry(
  style: SecondsHandStyle,
  length: number
): HandGeometry {
  return SECONDS_HANDS[style](length);
}

/**
 * The GMT hand on its dark edge, all three in one frame: the edge from
 * z = 0, the hand lifted onto it and the lume on top. Typical length 0.95.
 */
export function gmtHandGeometry(
  style: 'arrow' | 'hollow',
  length: number
): GmtHandGeometry {
  const shape =
    style === 'arrow' ? arrowGmtShape(length) : hollowGmtShape(length);
  const edgeWidth = style === 'arrow' ? GMT_EDGE.width : GMT_HOLLOW.edge;
  const hand = mergeGeometries([
    plate(shape.outline, {
      depth: GMT_DEPTH,
      bevel: GMT_BEVEL,
      holes: shape.holes,
    }),
    collar(COLLAR.gmt, GMT_DEPTH, GMT_BEVEL),
  ]).translate(0, 0, GMT_LIFT);
  const outline = mergeGeometries([
    plate(offsetOutline(shape.outline, edgeWidth), {
      depth: GMT_EDGE.depth,
      bevel: GMT_EDGE.bevel,
      holes: shape.holes.map(hole => offsetOutline(hole, -edgeWidth)),
    }),
    collar(COLLAR.gmt + edgeWidth, GMT_EDGE.depth, GMT_EDGE.bevel),
  ]);
  const lume = shape.lume ? inlay(shape.lume, GMT_LIFT + GMT_DEPTH) : null;
  return { hand, outline, lume };
}

const BLADES: Readonly<
  Record<MinuteHandStyle, (blade: Blade) => HandGeometry>
> = {
  sword: blade => flatBlade(swordOutline(blade, SWORD_SHOULDER), blade),
  baton: blade => flatBlade(batonHand(blade), blade),
  dauphine: dauphineBlade,
  leaf: blade =>
    flatBlade(leafHand(blade), blade, {
      bevel: LEAF.bevel,
      bevelSegments: LEAF.bevelSegments,
      lumeFrom: blade.length * LEAF.lumeFrom,
    }),
  skeleton: skeletonBlade,
};

const SECONDS_HANDS: Readonly<
  Record<SecondsHandStyle, (length: number) => HandGeometry>
> = {
  lollipop: lollipopHand,
  arrow: arrowSecondsHand,
  needle: needleHand,
  skeleton: skeletonSecondsHand,
};

// Hour and minute hands.

/**
 * A flat polished blade round a collar, with a lume inlay down its middle
 * from `lumeFrom` out.
 */
function flatBlade(
  outline: readonly Point[],
  blade: Blade,
  {
    bevel = HAND_BEVEL,
    bevelSegments = 2,
    lumeFrom = LUME_START,
  }: { bevel?: number; bevelSegments?: number; lumeFrom?: number } = {}
): HandGeometry {
  const metal = mergeGeometries([
    plate(outline, { depth: HAND_DEPTH, bevel, bevelSegments }),
    collar(blade.collar, HAND_DEPTH, bevel),
  ]);
  const lume = blade.lume
    ? inlay(
        offsetOutline(clipAbove(outline, lumeFrom), -LUME_BORDER),
        HAND_DEPTH
      )
    : null;
  return { metal, lume, tip: null };
}

/**
 * A sword: widening gently from the pivot to a shoulder far out, then
 * tapering straight to its point.
 */
function swordOutline(
  { length, width, tail }: Blade,
  shoulder: number
): Point[] {
  const half = width / 2;
  return mirrored([
    [half * 0.62, -tail],
    [half * 0.78, 0],
    [half, length * shoulder],
    [0, length],
  ]);
}

/** A dauphine: a faceted lozenge, two slopes meeting at a central ridge. */
function dauphineBlade(blade: Blade): HandGeometry {
  // The outline starts on the axis at the tail and runs up the right side.
  const right = dauphineHand(blade).filter(([x]) => x >= 0);
  const metal = mergeGeometries([
    facetedBlade(right, blade.width / 2, DAUPHINE.ridge, DAUPHINE.edge),
    collar(blade.collar, DAUPHINE.ridge, HAND_BEVEL),
  ]);
  const { length } = blade;
  // A lume channel down the ridge, as some vintage dauphines have.
  const channel: Point[] = [
    [0, length * 0.12],
    [DAUPHINE.lumeHalf, length * 0.3],
    [0, length * 0.86],
    [-DAUPHINE.lumeHalf, length * 0.3],
  ];
  const lume = blade.lume ? inlay(channel, DAUPHINE.ridge) : null;
  return { metal, lume, tip: null };
}

/**
 * An openwork blade: a sword frame round an open middle, the outer part of
 * the opening filled with lume.
 */
function skeletonBlade(blade: Blade): HandGeometry {
  const outline = swordOutline(blade, SKELETON.shoulder);
  const opening = offsetOutline(
    clipAbove(outline, SKELETON.openFrom),
    -SKELETON.wall
  );
  const metal = mergeGeometries([
    plate(outline, {
      depth: HAND_DEPTH,
      bevel: SKELETON.bevel,
      holes: [opening],
    }),
    collar(blade.collar, HAND_DEPTH, SKELETON.bevel),
  ]);
  const lume = blade.lume
    ? fill(clipAbove(opening, blade.length * SKELETON.lumeFrom), HAND_DEPTH)
    : null;
  return { metal, lume, tip: null };
}

/**
 * The diver's hour hand: a stem into a round frame with a three-pointed
 * star inside, and a short point beyond. Lume fills the star's three
 * sectors and runs down the stem.
 */
function mercedesHand(length: number, lume: boolean): HandGeometry {
  const { tail, chamfer, stemBase, stemTop, frameRadius, tipBase } = MERCEDES;
  const frame: Pad = { y: length * MERCEDES.frameAt, radius: frameRadius };
  const outline = mirrored([
    [stemBase - chamfer, -tail],
    [stemBase, chamfer - tail],
    ...padEdge(frame, stemTop, tipBase),
    [0, length],
  ]);
  const sectors = starSectors(
    frame.y,
    frameRadius - MERCEDES.frameWall,
    MERCEDES.spokeWidth
  );
  const metal = mergeGeometries([
    plate(outline, { depth: HAND_DEPTH, bevel: HAND_BEVEL, holes: sectors }),
    collar(COLLAR.hour, HAND_DEPTH, HAND_BEVEL),
  ]);
  if (!lume) return { metal, lume: null, tip: null };
  const stemJoin = frame.y - Math.sqrt(frameRadius ** 2 - stemTop ** 2);
  const stem: Point[] = [
    [-stemBase, -tail],
    [stemBase, -tail],
    [stemTop, stemJoin],
    [-stemTop, stemJoin],
  ];
  return {
    metal,
    lume: mergeGeometries([
      ...sectors.map(sector => fill(sector, HAND_DEPTH)),
      inlay(
        offsetOutline(clipAbove(stem, LUME_START), -LUME_BORDER),
        HAND_DEPTH
      ),
    ]),
    tip: null,
  };
}

/**
 * The three openings of a star inside a round frame of `radius` centred at
 * `y`: the circle less three spokes of `spokeWidth`.
 */
function starSectors(y: number, radius: number, spokeWidth: number) {
  const half = spokeWidth / 2;
  const sector = (2 * Math.PI) / 3;
  // Where the edges of two neighbouring spokes meet, on their bisector.
  const inner = half / Math.sin(sector / 2);
  // How far round the circle a spoke's edge is from its centre line.
  const spokeEdge = Math.asin(half / radius);
  return MERCEDES_SPOKES.map((spoke): Point[] => {
    const bisector = spoke + sector / 2;
    return [
      [Math.cos(bisector) * inner, y + Math.sin(bisector) * inner],
      ...arc([0, y], radius, spoke + spokeEdge, spoke + sector - spokeEdge),
    ];
  });
}

// Seconds hands.

/** The diver's seconds hand: a needle with a lume disc three-quarters out. */
function lollipopHand(length: number): HandGeometry {
  const { half, tail, point } = LOLLIPOP;
  const disc: Pad = { y: length * LOLLIPOP.discAt, radius: LOLLIPOP.disc };
  const outline = mirrored([
    [half, -tail],
    ...padEdge(LOLLIPOP.weight, half, half),
    ...padEdge(SECONDS_COLLAR, half, half),
    ...padEdge(disc, half, half),
    [half, length - point],
    [0, length],
  ]);
  return {
    metal: plate(outline, { depth: SECONDS_DEPTH, bevel: SECONDS_BEVEL }),
    lume: inlay(
      circle(LOLLIPOP.lume, DOT_SEGMENTS, [0, disc.y]),
      SECONDS_DEPTH
    ),
    tip: null,
  };
}

/**
 * The chronograph hand: a fine needle under a swallowtailed arrowhead,
 * which is the painted tip, with a lume pip in it.
 */
function arrowSecondsHand(length: number): HandGeometry {
  const { half, tail, headHalf } = ARROW;
  const back = length - ARROW.head;
  const notch = back + ARROW.notch;
  const needle = mirrored([
    [half, -tail],
    ...padEdge(ARROW.weight, half, half),
    ...padEdge(SECONDS_COLLAR, half, half),
    [half, notch + ARROW.overlap],
  ]);
  const head: Point[] = [
    [0, notch],
    [headHalf, back],
    [0, length],
    [-headHalf, back],
  ];
  const headTop = SECONDS_DEPTH + ARROW.rise;
  return {
    metal: plate(needle, { depth: SECONDS_DEPTH, bevel: SECONDS_BEVEL }),
    lume: inlay(
      circle(ARROW.pip, DOT_SEGMENTS, [0, length - ARROW.pipFromTip]),
      headTop
    ),
    tip: plate(head, { depth: headTop, bevel: SECONDS_BEVEL }),
  };
}

/** The dress seconds hand: a tapering needle, a ring on its long tail. */
function needleHand(length: number): HandGeometry {
  const { half, pointHalf } = NEEDLE;
  const ring: Pad = { y: NEEDLE.ring - NEEDLE.tail, radius: NEEDLE.ring };
  const outline = mirrored([
    ...padEdge(ring, 0, half),
    ...padEdge(SECONDS_COLLAR, half, half),
    [pointHalf, length - NEEDLE.point],
    [0, length],
  ]);
  return {
    metal: plate(outline, {
      depth: NEEDLE.depth,
      bevel: NEEDLE.bevel,
      holes: [circle(NEEDLE.ringHole, DOT_SEGMENTS, [0, ring.y])],
    }),
    lume: null,
    tip: null,
  };
}

/**
 * The openwork seconds hand: a slotted needle with its tip filled with
 * lume, and a hollow lozenge for a counterweight.
 */
function skeletonSecondsHand(length: number): HandGeometry {
  const { half, wall, point, weight } = SKELETON_SECONDS;
  const foot = weight.y - weight.height;
  const lozenge: Point[] = [
    [0, foot],
    [weight.half, weight.y],
    [0, weight.y + weight.height],
    [-weight.half, weight.y],
  ];
  // Where the lozenge's upper edge meets the needle.
  const [, join] = atX(
    [weight.half, weight.y],
    [0, weight.y + weight.height],
    half
  );
  const outline = mirrored([
    [0, foot],
    [weight.half, weight.y],
    [half, join],
    ...padEdge(SECONDS_COLLAR, half, half),
    [half, length - point],
    [0, length],
  ]);
  const slot = offsetOutline(
    mirrored([
      [half, SKELETON_SECONDS.openFrom],
      [half, length - point],
      [0, length],
    ]),
    -wall
  );
  return {
    metal: plate(outline, {
      depth: SECONDS_DEPTH,
      bevel: SKELETON_SECONDS.bevel,
      holes: [offsetOutline(lozenge, -weight.wall), slot],
    }),
    lume: fill(clipAbove(slot, length - SKELETON_SECONDS.lume), SECONDS_DEPTH),
    tip: null,
  };
}

// GMT hands.

interface GmtShape {
  readonly outline: Point[];
  readonly holes: Point[][];
  readonly lume: Point[] | null;
}

/** A thin stem with a big triangular arrow, the triangle filled with lume. */
function arrowGmtShape(length: number): GmtShape {
  const { tail, half, headHalf } = GMT_ARROW;
  const base = length - GMT_ARROW.head;
  const arrow: Point[] = [
    [-headHalf, base],
    [headHalf, base],
    [0, length],
  ];
  return {
    outline: mirrored([
      [half, -tail],
      [half, base],
      [headHalf, base],
      [0, length],
    ]),
    holes: [],
    lume: offsetOutline(arrow, -GMT_ARROW.border),
  };
}

/** A fine stem and a small openwork arrowhead, its barbs swept back. */
function hollowGmtShape(length: number): GmtShape {
  const { tail, half, head, headHalf, frame, notch } = GMT_HOLLOW;
  const base = length - head;
  // The head's open middle: clear of the stem's join, a frame inside it.
  const holeBase = base + notch + frame * 1.5;
  const sideAt = (y: number) => (headHalf * (length - y)) / head;
  const opening: Point[] = [
    [-sideAt(holeBase), holeBase],
    [sideAt(holeBase), holeBase],
    [0, length],
  ];
  return {
    outline: mirrored([
      [half, -tail],
      [half, base + notch],
      [headHalf, base],
      [0, length],
    ]),
    holes: [offsetOutline(opening, -frame)],
    lume: null,
  };
}

// Building blocks.

/** A polished metal plate: `outline` extruded by `depth`, bevel included. */
function plate(
  outline: readonly Point[],
  {
    depth,
    bevel,
    holes = [],
    bevelSegments = 2,
  }: {
    depth: number;
    bevel: number;
    holes?: readonly (readonly Point[])[];
    bevelSegments?: number;
  }
): BufferGeometry {
  // Extrusion fixes the winding of holes only for a counter-clockwise shape.
  return extrude(counterClockwise(outline), {
    depth,
    bevel,
    holes,
    bevelSegments,
  });
}

/** The round collar at the pivot. */
function collar(radius: number, depth: number, bevel: number) {
  return plate(circle(radius, COLLAR_SEGMENTS), { depth, bevel });
}

/** A flat slab from `base` up to `top`. */
function slab(outline: readonly Point[], base: number, top: number) {
  return extrude(counterClockwise(outline), { depth: top - base }).translate(
    0,
    0,
    base
  );
}

/** Lume laid into solid metal whose top is at `top`. */
function inlay(outline: readonly Point[], top: number) {
  return slab(outline, top - LUME_SINK, top + LUME_PROUD);
}

/** Lume filling an opening through metal whose top is at `top`. */
function fill(outline: readonly Point[], top: number) {
  return slab(outline, LUME_FLOOR, top + LUME_PROUD);
}

/**
 * A blade with a central ridge: each half is one plane sloping from the
 * ridge down to its outer edge, so the halves catch the light apart.
 * `right` is the right half from the tail up to the tip, both on the axis.
 */
function facetedBlade(
  right: readonly Point[],
  half: number,
  ridge: number,
  edge: number
): BufferGeometry {
  const heightAt = (x: number) => ridge - ((ridge - edge) * Math.abs(x)) / half;
  const positions: number[] = [];
  const uvs: number[] = [];
  const corner = (x: number, y: number, z: number, u = x, v = y) => {
    positions.push(x, y, z);
    uvs.push(u, v);
  };

  const left = right.map(([x, y]): Point => [-x, y]);
  for (const facet of [right, left]) {
    for (const triangle of triangulate(facet)) {
      for (const [x, y] of triangle) corner(x, y, heightAt(x));
    }
  }

  const outline = mirrored(right);
  let run = 0;
  outline.forEach(([x, y], index) => {
    const [nextX, nextY] = vertex(outline, index + 1);
    const next = run + Math.hypot(nextX - x, nextY - y);
    const top = heightAt(x);
    const nextTop = heightAt(nextX);
    // Wound to face out of the counter-clockwise outline.
    corner(x, y, 0, run, 0);
    corner(nextX, nextY, 0, next, 0);
    corner(nextX, nextY, nextTop, next, nextTop);
    corner(x, y, 0, run, 0);
    corner(nextX, nextY, nextTop, next, nextTop);
    corner(x, y, top, run, top);
    run = next;
  });

  for (const [a, b, c] of triangulate(outline)) {
    for (const [x, y] of [a, c, b]) corner(x, y, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  // No vertex is shared, so every face keeps its own normal: crisp facets.
  geometry.computeVertexNormals();
  return geometry;
}

// Outline helpers.

/** A round pad on a hand's stem, centred on its axis. */
interface Pad {
  readonly y: number;
  readonly radius: number;
}

type Triangle = readonly [Point, Point, Point];

function vertex(points: readonly Point[], index: number): Point {
  const point = points[(index + points.length) % points.length];
  if (!point) throw new RangeError('An outline needs at least one point');
  return point;
}

/** Positive when `points` run counter-clockwise. */
function signedArea(points: readonly Point[]): number {
  return points.reduce((area, [x, y], index) => {
    const [nextX, nextY] = vertex(points, index + 1);
    return area + (x * nextY - nextX * y) / 2;
  }, 0);
}

function counterClockwise(points: readonly Point[]): Point[] {
  return signedArea(points) < 0 ? [...points].reverse() : [...points];
}

/** `outline` cut into triangles, each wound counter-clockwise. */
function triangulate(outline: readonly Point[]): Triangle[] {
  const contour = outline.map(([x, y]) => new Vector2(x, y));
  return ShapeUtils.triangulateShape(contour, []).map(
    ([a = 0, b = 0, c = 0]): Triangle => {
      const triangle: Triangle = [
        vertex(outline, a),
        vertex(outline, b),
        vertex(outline, c),
      ];
      return signedArea(triangle) < 0
        ? [triangle[0], triangle[2], triangle[1]]
        : triangle;
    }
  );
}

/**
 * A symmetric outline from its right half, listed from the tail up to the
 * tip. Points on the axis belong to both halves; a half that starts or
 * ends off the axis leaves a flat end.
 */
function mirrored(right: readonly Point[]): Point[] {
  const left = right
    .filter(([x]) => x > EPSILON)
    .reverse()
    .map(([x, y]): Point => [-x, y]);
  return [...right, ...left];
}

/** Points round an arc from angle `from` to `to`, both ends included. */
function arc(center: Point, radius: number, from: number, to: number) {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ARC_STEP));
  return Array.from({ length: steps + 1 }, (_, index): Point => {
    const angle = from + ((to - from) * index) / steps;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ];
  });
}

/**
 * The right edge of a round pad, from where it leaves a stem of half-width
 * `below` to where it joins one of half-width `above`. With `below` 0 it
 * starts from the pad's foot, ending the hand there.
 */
function padEdge({ y, radius }: Pad, below: number, above: number) {
  return arc(
    [0, y],
    radius,
    -Math.acos(below / radius),
    Math.acos(above / radius)
  );
}

/** The point at `x` on the line through `from` and `to`. */
function atX(from: Point, to: Point, x: number): Point {
  const along = (x - from[0]) / (to[0] - from[0]);
  return [x, from[1] + (to[1] - from[1]) * along];
}

/** The part of `outline` at or above `y`. */
function clipAbove(outline: readonly Point[], y: number): Point[] {
  return outline.flatMap((point, index) => {
    const next = vertex(outline, index + 1);
    const kept: Point[] = point[1] >= y ? [point] : [];
    if (point[1] >= y !== next[1] >= y) {
      const along = (y - point[1]) / (next[1] - point[1]);
      kept.push([point[0] + (next[0] - point[0]) * along, y]);
    }
    return kept;
  });
}

/** The normal pointing out of a counter-clockwise outline, along an edge. */
function outwardNormal(from: Point, to: Point): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return [dy / length, -dx / length];
}

/**
 * `outline` grown by `distance` (shrunk when negative), every edge moved
 * out along its normal. A corner that would spike far out is cut square.
 */
function offsetOutline(outline: readonly Point[], distance: number): Point[] {
  const points = counterClockwise(
    outline.filter(([x, y], index) => {
      const [nextX, nextY] = vertex(outline, index + 1);
      return Math.hypot(nextX - x, nextY - y) > EPSILON;
    })
  );
  return points.flatMap(([x, y], index): Point[] => {
    const [ax, ay] = outwardNormal(vertex(points, index - 1), [x, y]);
    const [bx, by] = outwardNormal([x, y], vertex(points, index + 1));
    const scale = distance / (1 + ax * bx + ay * by);
    const miter: Point = [x + (ax + bx) * scale, y + (ay + by) * scale];
    // Positive at a convex corner: one spikes out when grown, a concave
    // one when shrunk.
    const turn = ax * by - ay * bx;
    const reach = Math.hypot(miter[0] - x, miter[1] - y);
    const limit = MITER_LIMIT * Math.abs(distance);
    if (turn * distance <= 0 || reach <= limit) return [miter];
    // Cut the spike square across its bisector, `limit` out: each offset
    // edge (running along the edge's direction, its normal turned a
    // quarter) stops at the cut.
    const [mx, my] = [(miter[0] - x) / reach, (miter[1] - y) / reach];
    const cut = (nx: number, ny: number): Point => {
      const along =
        (limit - distance * (nx * mx + ny * my)) / (-ny * mx + nx * my);
      return [x + nx * distance - ny * along, y + ny * distance + nx * along];
    };
    return [cut(ax, ay), cut(bx, by)];
  });
}
