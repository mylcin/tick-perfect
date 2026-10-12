import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Vector2,
} from 'three';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';

import type { CaseSpec, CaseStyle, CrownStyle } from '../../watches';
import { DEG_TO_RAD, LAYOUT } from '../layout';
import { extrude, lathe } from './build';
import type { Point } from './outlines';

// The case middle, its lugs, and the parts that stand out of its flank:
// crown, crown guards and pushers. Every case is built around the dial
// (radius 1, facing +Z, 12 o'clock along +Y) with its top, where the bezel
// sits, at CASE_TOP.

/** Height of the case top, the bezel's seat, above the dial plane. */
export const CASE_TOP = 0.1;

interface CaseGeometry {
  /** The case middle and caseback, open over the dial. */
  readonly body: BufferGeometry;
  /** All four lugs, at 12 and at 6; null when the strap meets the case. */
  readonly lugs: BufferGeometry | null;
  /**
   * The spring bar at 12 o'clock: where the strap starts and how wide the
   * gap between the lugs is. The 6 o'clock side mirrors it (y → -y).
   */
  readonly strap: {
    readonly y: number;
    readonly z: number;
    readonly width: number;
  };
}

type RoundStyle = Exclude<CaseStyle, 'tonneau'>;
type PusherStyle = Exclude<CaseSpec['pushers'], 'none'>;

interface CaseSize {
  readonly radius: number;
  readonly height: number;
  /** Where the top steps down at its edge: the bezel's outer radius. */
  readonly seat: number;
}

const BODY_SEGMENTS = 128;
/** Facets meeting at a sharper angle keep a crisp, polished edge. */
const BODY_CREASE = Math.PI / 6;
const LUG_CREASE = Math.PI / 5;
const SMALL_PART_CREASE = Math.PI / 5;
/** A small polished break on otherwise square edges. */
const EDGE_BREAK = 0.008;
/** The crown's head stays this far under the case top. */
const CROWN_CLEARANCE = 0.005;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

/**
 * Part of an ellipse, from one surface direction to another (degrees from
 * the outward radial, +90 facing up). Sampling by direction turns each
 * facet by the same angle, so creasing never catches a flat ellipse's tip.
 */
function arc(
  [centerX, centerZ]: Point,
  [radiusX, radiusZ]: Point,
  from: number,
  to: number,
  segments: number
): Point[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const direction = (from + ((to - from) * index) / segments) * DEG_TO_RAD;
    const angle = Math.atan2(
      radiusZ * Math.sin(direction),
      radiusX * Math.cos(direction)
    );
    return [
      centerX + Math.cos(angle) * radiusX,
      centerZ + Math.sin(angle) * radiusZ,
    ] as const;
  });
}

/** A curve's points strictly inside 0..1, at `steps` even intervals. */
function between(steps: number, point: (t: number) => Point): Point[] {
  return Array.from({ length: steps - 1 }, (_, index) =>
    point((index + 1) / steps)
  );
}

function finish(geometry: BufferGeometry): BufferGeometry {
  // One material, one draw call.
  geometry.clearGroups();
  return geometry;
}

// Round case middles, as [radius, height] profiles spun into lathe
// geometry. Each runs from the caseback centre out, up the flank and in
// along the top to the crystal, so the dial stays open.

const OYSTER = {
  /** The polished 45° bevel between the flank and the top. */
  chamfer: 0.045,
  /** Where the flat, vertical flank begins above the case bottom. */
  flankBase: 0.13,
} as const;

function oysterProfile({ radius, height, seat }: CaseSize): Point[] {
  const bottom = CASE_TOP - height;
  const { chamfer, flankBase } = OYSTER;
  return [
    // A gently domed screw-down back, narrower than the middle.
    [0, bottom - 0.012],
    [radius * 0.5, bottom - 0.007],
    [radius - 0.27, bottom],
    [radius - 0.245, bottom + 0.01],
    [radius - 0.235, bottom + 0.045],
    [radius - 0.2, bottom + 0.055],
    // The underside rounds into the flank.
    ...arc(
      [radius - 0.07, bottom + flankBase],
      [0.07, flankBase - 0.055],
      -90,
      0,
      6
    ),
    [radius, CASE_TOP - chamfer],
    [Math.min(seat, radius - chamfer), CASE_TOP],
    [LAYOUT.crystalRadius, CASE_TOP],
  ];
}

const TOOL = {
  flankBase: 0.11,
  /** The flank rounds over this far below the top. */
  flankTop: 0.03,
  /** A slight barrel to the flank, widest halfway up. */
  bulge: 0.012,
  topRound: 0.04,
} as const;

function toolProfile({ radius, height }: CaseSize): Point[] {
  const bottom = CASE_TOP - height;
  const { flankBase, flankTop, bulge, topRound } = TOOL;
  const low = bottom + flankBase;
  const high = CASE_TOP - flankTop;
  return [
    [0, bottom - 0.01],
    [radius * 0.5, bottom - 0.006],
    [radius - 0.25, bottom],
    [radius - 0.225, bottom + 0.012],
    [radius - 0.215, bottom + 0.04],
    [radius - 0.17, bottom + 0.05],
    ...arc([radius - bulge - 0.06, low], [0.06, flankBase - 0.05], -90, 0, 6),
    ...between(8, t => [radius - bulge * (2 * t - 1) ** 2, lerp(low, high, t)]),
    ...arc([radius - topRound, high], [topRound - bulge, flankTop], 0, 90, 4),
    [LAYOUT.crystalRadius, CASE_TOP],
  ];
}

const CALATRAVA = {
  /** The flank is widest this far below the top. */
  widest: 0.105,
  /** How far the flank curves in below and above its widest point. */
  lowerRound: 0.1,
  upperRound: 0.02,
  /** The snap-on back's lip, above the case bottom. */
  lip: 0.02,
} as const;

function calatravaProfile({ radius, height }: CaseSize): Point[] {
  const bottom = CASE_TOP - height;
  const { lowerRound, upperRound } = CALATRAVA;
  const widest = CASE_TOP - CALATRAVA.widest;
  const lip = bottom + CALATRAVA.lip;
  return [
    // A domed snap-on back.
    [0, bottom - 0.012],
    [radius * 0.45, bottom - 0.008],
    [radius - 0.24, bottom - 0.002],
    [radius - 0.16, bottom + 0.008],
    [radius - lowerRound - 0.025, lip],
    // The flank swells out to the full radius and rolls over into the top.
    ...arc(
      [radius - lowerRound, widest],
      [lowerRound, widest - lip],
      -90,
      0,
      7
    ),
    ...arc(
      [radius - upperRound, widest],
      [upperRound, CASE_TOP - widest],
      0,
      90,
      7
    ).slice(1),
    [LAYOUT.crystalRadius, CASE_TOP],
  ];
}

const GRAND = {
  flankBase: 0.122,
  /** The polished shoulder between the flank and the bezel. */
  shoulder: 0.05,
  /** How far the flank curves in at its waist. */
  concavity: 0.04,
} as const;

function grandProfile({ radius, height, seat }: CaseSize): Point[] {
  const bottom = CASE_TOP - height;
  const { flankBase, shoulder, concavity } = GRAND;
  const low = bottom + flankBase;
  const high = CASE_TOP - shoulder;
  const ledge = Math.min(seat, radius - shoulder);
  return [
    // A flat display back in its own ring.
    [0, bottom - 0.006],
    [radius - 0.36, bottom - 0.006],
    [radius - 0.33, bottom],
    [radius - 0.25, bottom],
    [radius - 0.225, bottom + 0.012],
    [radius - 0.215, bottom + 0.042],
    [radius - 0.17, bottom + 0.052],
    ...arc([radius - 0.07, low], [0.07, flankBase - 0.052], -90, 0, 6),
    // The concave flank meets the curves above and below at crisp edges.
    ...between(10, t => [
      radius - concavity * Math.sin(Math.PI * t),
      lerp(low, high, t),
    ]),
    ...arc([ledge, high], [radius - ledge, shoulder], 0, 90, 6),
    [LAYOUT.crystalRadius, CASE_TOP],
  ];
}

// Lugs are swept along Y: a cross-section in the XZ plane at each station,
// so they can taper, flare into the case and bend down towards the wrist.

type SectionStyle = 'chamfered' | 'plain' | 'rounded' | 'stepped';

interface LugDesign {
  /** The strap's width: the gap between each pair of lugs. */
  readonly gap: number;
  /** Width of each lug where it leaves the case, and at its end. */
  readonly width: number;
  readonly tipWidth: number;
  /** How far the outer edge sweeps out into the case, and over what run. */
  readonly flare: number;
  readonly flareLength: number;
  /** Where the lugs end, from the centre. */
  readonly tip: number;
  /** Plan-view radius of the end corners. */
  readonly tipRadius: number;
  /** Height of the lug top where it leaves the case. */
  readonly top: number;
  /** Thickness as a share of the case height, and its share at the end. */
  readonly thickness: number;
  readonly tipThickness: number;
  /** How far the ends bend down towards the wrist. */
  readonly drop: number;
  /**
   * The spring bar's distance in from the lug ends: the strap folds round
   * it, so this sets how close the strap comes to the case.
   */
  readonly springBar: number;
  readonly section: SectionStyle;
}

interface LugStation {
  readonly y: number;
  /** x of the inner (strap-side) and outer edges of the right lug. */
  readonly inner: number;
  readonly outer: number;
  readonly top: number;
  readonly bottom: number;
}

interface Section {
  /** The outline in [x, z], clockwise seen from the lug end. */
  readonly points: Point[];
  /** A point every edge can be seen from, for the end caps. */
  readonly center: Point;
}

const LUG_STEP = 0.03;
const TIP_STEPS = 6;
/** The end's top edge rounds down by this share of the corner radius. */
const TIP_SOFTEN = 0.4;
/**
 * The lug roots follow a circle this far out: under the case top, clear of
 * the crystal and the rehaut.
 */
const LUG_ROOT_RADIUS = LAYOUT.crystalRadius + 0.035;
/** The first full station sits just past the root circle. */
const ROOT_CLEARANCE = 0.008;
const OYSTER_LUG_BEVEL = 0.05;
const TOOL_LUG_BEVEL = 0.022;
const ROUNDED_LUG_SEGMENTS = 8;
/** The stepped lug's raised top: its share of the width and step depth. */
const STEPPED_LUG = { rib: 0.58, step: 0.32 } as const;

const SECTIONS: Readonly<Record<SectionStyle, (at: LugStation) => Section>> = {
  // Flat brushed top and side, a broad polished bevel between them.
  chamfered: ({ inner, outer, top, bottom }) => {
    const bevel = Math.min(OYSTER_LUG_BEVEL, (outer - inner) * 0.3);
    const edge = EDGE_BREAK;
    return {
      points: [
        [inner, bottom + edge],
        [inner, top - edge],
        [inner + edge, top],
        [outer - bevel, top],
        [outer, top - bevel * 0.85],
        [outer, bottom + edge],
        [outer - edge, bottom],
        [inner + edge, bottom],
      ],
      center: [(inner + outer) / 2, (top + bottom) / 2],
    };
  },
  // Plain lugs with a narrow bevel along both top edges.
  plain: ({ inner, outer, top, bottom }) => {
    const bevel = Math.min(TOOL_LUG_BEVEL, (outer - inner) * 0.2);
    const edge = EDGE_BREAK;
    return {
      points: [
        [inner, bottom + edge],
        [inner, top - bevel],
        [inner + bevel, top],
        [outer - bevel, top],
        [outer, top - bevel],
        [outer, bottom + edge],
        [outer - edge, bottom],
        [inner + edge, bottom],
      ],
      center: [(inner + outer) / 2, (top + bottom) / 2],
    };
  },
  // A slender lug with a rounded, polished top.
  rounded: ({ inner, outer, top, bottom }) => {
    const half = (outer - inner) / 2;
    const crown = Math.min(half, (top - bottom) * 0.6);
    const edge = EDGE_BREAK;
    return {
      points: [
        [inner, bottom + edge],
        ...arc(
          [inner + half, top - crown],
          [half, crown],
          180,
          0,
          ROUNDED_LUG_SEGMENTS
        ),
        [outer, bottom + edge],
        [outer - edge, bottom],
        [inner + edge, bottom],
      ],
      center: [inner + half, (top + bottom) / 2],
    };
  },
  // Two tiers: a raised top along the strap side, a lower step outside.
  stepped: ({ inner, outer, top, bottom }) => {
    const rib = inner + (outer - inner) * STEPPED_LUG.rib;
    const step = top - (top - bottom) * STEPPED_LUG.step;
    const edge = EDGE_BREAK;
    return {
      points: [
        [inner, bottom + edge],
        [inner, top - edge],
        [inner + edge, top],
        [rib - edge, top],
        [rib, top - edge],
        [rib, step],
        [outer - edge, step],
        [outer, step - edge],
        [outer, bottom + edge],
        [outer - edge, bottom],
        [inner + edge, bottom],
      ],
      // Under the raised top, where the whole L-shape is in view.
      center: [(inner + rib) / 2, (bottom + step) / 2],
    };
  },
};

/** The right 12 o'clock lug's section at any distance from the centre. */
function lugShape(design: LugDesign, spec: CaseSpec) {
  const inner = design.gap / 2;
  // Where the outer edge leaves the case: the free run starts here.
  const leaves = Math.sqrt(
    Math.max(spec.radius ** 2 - (inner + design.width) ** 2, 0)
  );
  const run = design.tip - leaves;
  const thickness = spec.height * design.thickness;
  return (y: number, inset = 0): LugStation => {
    const along = clamp01((y - leaves) / run);
    const sweep = clamp01((y - leaves) / design.flareLength);
    const width = lerp(design.width, design.tipWidth, along);
    const top = design.top - design.drop * along ** 2;
    return {
      y,
      inner: inner + inset,
      outer: inner + width + design.flare * (1 - sweep) ** 2 - inset,
      top: top - inset * TIP_SOFTEN,
      bottom: top - thickness * lerp(1, design.tipThickness, along),
    };
  };
}

function lugStations(design: LugDesign, spec: CaseSpec): LugStation[] {
  const at = lugShape(design, spec);
  const first =
    Math.sqrt(LUG_ROOT_RADIUS ** 2 - (design.gap / 2) ** 2) + ROOT_CLEARANCE;
  const straight = design.tip - design.tipRadius;
  const steps = Math.ceil((straight - first) / LUG_STEP);
  // The first station is the root; sweep() bends it onto the root circle.
  const stations = Array.from({ length: steps + 1 }, (_, index) =>
    at(lerp(first, straight, index / steps))
  );
  stations.unshift(at(first));
  // Round the end corners in plan view.
  for (let index = 1; index <= TIP_STEPS; index++) {
    const angle = (index / TIP_STEPS) * (Math.PI / 2);
    stations.push(
      at(
        straight + design.tipRadius * Math.sin(angle),
        design.tipRadius * (1 - Math.cos(angle))
      )
    );
  }
  return stations;
}

/**
 * Sweeps the section through the stations: the right lug for side 1, its
 * mirror image for -1. The first ring follows the root circle, buried in
 * the case; both ends are capped.
 */
function sweep(
  stations: readonly LugStation[],
  section: (at: LugStation) => Section,
  side: 1 | -1
): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const shapes = stations.map(station => {
    const { points, center } = section(station);
    // Mirroring turns the outline anticlockwise; reversing restores it.
    const loop =
      side === 1 ? points : points.map(([x, z]) => [-x, z] as const).reverse();
    return { loop, center: [center[0] * side, center[1]] as const };
  });
  const rootY = (x: number) =>
    Math.sqrt(Math.max(LUG_ROOT_RADIUS ** 2 - x ** 2, 0));
  const stationY = (index: number, x: number) =>
    index === 0 ? rootY(x) : (stations[index]?.y ?? 0);

  let ringSize = 0;
  shapes.forEach(({ loop }, index) => {
    // The first point again closes the ring with its own texture seam.
    const ring = [...loop, ...loop.slice(0, 1)];
    ringSize = ring.length;
    let around = 0;
    ring.forEach(([x, z], k) => {
      const previous = ring[k - 1];
      if (previous) around += Math.hypot(x - previous[0], z - previous[1]);
      const y = stationY(index, x);
      positions.push(x, y, z);
      // u runs along the lug, so the brushed grain does too.
      uvs.push(y, around);
    });
  });
  for (let index = 0; index < shapes.length - 1; index++) {
    for (let k = 0; k < ringSize - 1; k++) {
      const a = index * ringSize + k;
      const b = a + 1;
      const c = b + ringSize;
      const d = a + ringSize;
      indices.push(a, b, c, a, c, d);
    }
  }

  const cap = (index: number, facing: 1 | -1) => {
    const shape = shapes[index];
    if (!shape) return;
    const start = positions.length / 3;
    const [centerX, centerZ] = shape.center;
    positions.push(centerX, stationY(index, centerX), centerZ);
    uvs.push(centerX, centerZ);
    shape.loop.forEach(([x, z]) => {
      positions.push(x, stationY(index, x), z);
      uvs.push(x, z);
    });
    const count = shape.loop.length;
    for (let k = 0; k < count; k++) {
      const current = start + 1 + k;
      const next = start + 1 + ((k + 1) % count);
      if (facing === 1) indices.push(start, current, next);
      else indices.push(start, next, current);
    }
  };
  cap(0, -1);
  cap(shapes.length - 1, 1);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function lugGeometry(design: LugDesign, spec: CaseSpec): BufferGeometry {
  const stations = lugStations(design, spec);
  const section = SECTIONS[design.section];
  const upper = mergeGeometries([
    sweep(stations, section, 1),
    sweep(stations, section, -1),
  ]);
  const lower = upper.clone().rotateZ(Math.PI);
  return finish(toCreasedNormals(mergeGeometries([upper, lower]), LUG_CREASE));
}

interface RoundCase {
  readonly profile: (size: CaseSize) => Point[];
  /** How many of the profile's first points are the caseback's face. */
  readonly back: number;
  /** Halfway up the visible flank, where the crown and pushers sit. */
  readonly flankMiddle: (height: number) => number;
  readonly lugs: LugDesign;
}

// Lug to lug runs about 1.17-1.21 case diameters and the lug gap about
// 0.46 of one, as on the watches each is drawn after. The gaps stay a
// little narrower than theirs, so seen from above the bezel still leads.
const ROUND_CASES: Readonly<Record<RoundStyle, RoundCase>> = {
  // Thick, straight lugs with a polished bevel along their outer edge,
  // sweeping into the case.
  oyster: {
    profile: oysterProfile,
    back: 3,
    flankMiddle: height =>
      (CASE_TOP - height + OYSTER.flankBase + CASE_TOP - OYSTER.chamfer) / 2,
    lugs: {
      gap: 1.3,
      width: 0.24,
      tipWidth: 0.24,
      flare: 0.14,
      flareLength: 0.3,
      tip: 1.65,
      tipRadius: 0.05,
      top: 0.095,
      thickness: 0.7,
      tipThickness: 0.82,
      drop: 0.03,
      springBar: 0.12,
      section: 'chamfered',
    },
  },
  // Plain lugs, slimmer and a little longer.
  tool: {
    profile: toolProfile,
    back: 3,
    flankMiddle: height =>
      (CASE_TOP - height + TOOL.flankBase + CASE_TOP - TOOL.flankTop) / 2,
    lugs: {
      gap: 1.24,
      width: 0.18,
      tipWidth: 0.17,
      flare: 0.07,
      flareLength: 0.22,
      tip: 1.58,
      tipRadius: 0.04,
      top: 0.09,
      thickness: 0.62,
      tipThickness: 0.8,
      drop: 0.05,
      springBar: 0.18,
      section: 'plain',
    },
  },
  // Slender, tapering lugs with rounded tops that curve down to the wrist.
  calatrava: {
    profile: calatravaProfile,
    back: 3,
    flankMiddle: () => CASE_TOP - CALATRAVA.widest,
    lugs: {
      gap: 1.1,
      width: 0.14,
      tipWidth: 0.11,
      flare: 0.05,
      flareLength: 0.16,
      tip: 1.37,
      tipRadius: 0.035,
      top: 0.06,
      thickness: 0.55,
      tipThickness: 0.8,
      drop: 0.1,
      springBar: 0.09,
      section: 'rounded',
    },
  },
  // Stepped lugs: a wide lower tier, a narrower raised top.
  grand: {
    profile: grandProfile,
    back: 2,
    flankMiddle: height =>
      (CASE_TOP - height + GRAND.flankBase + CASE_TOP - GRAND.shoulder) / 2,
    lugs: {
      gap: 1.22,
      width: 0.2,
      tipWidth: 0.19,
      flare: 0.08,
      flareLength: 0.26,
      tip: 1.54,
      tipRadius: 0.04,
      top: 0.08,
      thickness: 0.6,
      tipThickness: 0.8,
      drop: 0.05,
      springBar: 0.16,
      section: 'stepped',
    },
  },
};

const TONNEAU = {
  /** A large rounded edge all round, top and bottom. */
  bevel: 0.06,
  bevelSegments: 6,
  /** The dial opening's own small rounded edge. */
  holeRound: 0.02,
  holeRoundSegments: 2,
  /** Samples round the barrel, and across its top and its underside. */
  outlineSegments: 144,
  topSteps: 7,
  bottomSteps: 4,
  /** A soft rectangle |x/w|^ends + |y/l|^sides = 1, flatter at the ends… */
  endsExponent: 4,
  sidesExponent: 3,
  /** …its sides bowed in towards the ends, as a barrel's staves. */
  bow: 0.14,
  /** The 12 and 6 ends drop this far, to follow the wrist. */
  drop: 0.08,
  /** The bend starts just inside the bezel's edge, so the bezel sits flat. */
  bendInset: 0.12,
  /** The strap goes into the case end, its bar this far inside. */
  strapInset: 0.05,
  strapWidth: 1.1,
  /** The floor under the movement, above the case bottom. */
  floor: 0.08,
  /** How far the back plate reaches under the shell round its opening. */
  plateOverlap: 0.03,
} as const;

/** The tonneau's barrel outline, `halfWidth` across and `halfLength` long. */
function barrelOutline(halfWidth: number, halfLength: number): Point[] {
  const { outlineSegments, endsExponent, sidesExponent, bow } = TONNEAU;
  return Array.from({ length: outlineSegments }, (_, index) => {
    const angle = (index / outlineSegments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const along = Math.abs(sin) ** (2 / sidesExponent);
    return [
      Math.sign(cos) *
        Math.abs(cos) ** (2 / endsExponent) *
        halfWidth *
        (1 - bow * along ** 2),
      Math.sign(sin) * along * halfLength,
    ] as const;
  });
}

/**
 * A point of the tonneau's cross-section: `blend` runs from the dial
 * opening (0) to the outer flank (1), `hole` is the distance out from the
 * opening and `flank` the distance in from the flank.
 */
interface ShellPoint {
  readonly blend: number;
  readonly hole: number;
  readonly flank: number;
  readonly z: number;
}

/**
 * The cross-section from the opening's wall, over the top, round the flank
 * and back underneath: clockwise, seen along the outline.
 */
function shellSection(height: number): ShellPoint[] {
  const { bevel, bevelSegments, holeRound, holeRoundSegments } = TONNEAU;
  const top = CASE_TOP;
  const bottom = CASE_TOP - height;
  const opening = (from: number, to: number, centerZ: number) =>
    arc(
      [holeRound, centerZ],
      [holeRound, holeRound],
      from,
      to,
      holeRoundSegments
    ).map(([hole, z]) => ({ blend: 0, hole, flank: 0, z }));
  const flank = (from: number, to: number, centerZ: number) =>
    arc([-bevel, centerZ], [bevel, bevel], from, to, bevelSegments).map(
      ([inset, z]) => ({ blend: 1, hole: 0, flank: -inset, z })
    );
  const across = (steps: number, z: number, outwards: boolean) =>
    between(steps, t => [outwards ? t : 1 - t, z]).map(([blend]) => ({
      blend,
      hole: holeRound,
      flank: bevel,
      z,
    }));
  return [
    ...opening(180, 90, top - holeRound),
    ...across(TONNEAU.topSteps, top, true),
    ...flank(90, 0, top - bevel),
    ...flank(0, -90, bottom + bevel),
    ...across(TONNEAU.bottomSteps, bottom, false),
    ...opening(-90, -180, bottom + holeRound),
  ];
}

/** The barrel swept round the dial opening, its rounded edges included. */
function tonneauShell(radius: number, length: number, height: number) {
  const outline = barrelOutline(radius, length);
  const section = shellSection(height);
  const ring = [...section, ...section.slice(0, 1)];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const count = outline.length;
  for (let index = 0; index <= count; index++) {
    const [x, y] = outline[index % count] ?? [0, 0];
    const [nextX, nextY] = outline[(index + 1) % count] ?? [0, 0];
    const [lastX, lastY] = outline[(index + count - 1) % count] ?? [0, 0];
    // The outward normal of an anticlockwise outline.
    const tangent = Math.hypot(nextX - lastX, nextY - lastY);
    const normalX = (nextY - lastY) / tangent;
    const normalY = -(nextX - lastX) / tangent;
    const distance = Math.hypot(x, y);
    let around = 0;
    let last: readonly [number, number, number] | null = null;
    for (const { blend, hole, flank, z } of ring) {
      const opening = (LAYOUT.crystalRadius + hole) / distance;
      const point = [
        lerp(x * opening, x - normalX * flank, blend),
        lerp(y * opening, y - normalY * flank, blend),
        z,
      ] as const;
      if (last) {
        around += Math.hypot(
          point[0] - last[0],
          point[1] - last[1],
          point[2] - last[2]
        );
      }
      last = point;
      positions.push(...point);
      uvs.push((index / count) * Math.PI * 2 * radius, around);
    }
  }
  const size = ring.length;
  for (let index = 0; index < count; index++) {
    for (let k = 0; k < size - 1; k++) {
      const a = index * size + k;
      const b = a + 1;
      const d = a + size;
      const c = d + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function tonneauCase(spec: CaseSpec, bezelOuter: number): CaseGeometry {
  const length = spec.length ?? spec.radius;
  const bottom = CASE_TOP - spec.height;
  const shell = tonneauShell(spec.radius, length, spec.height);

  // Curve the case to the wrist: the 12 and 6 ends bend down.
  const bendStart = Math.min(bezelOuter - TONNEAU.bendInset, length);
  const bendRun = Math.max(length - bendStart, Number.EPSILON);
  const drop = (y: number) =>
    TONNEAU.drop * clamp01((Math.abs(y) - bendStart) / bendRun) ** 2;
  const position = shell.getAttribute('position');
  for (let index = 0; index < position.count; index++) {
    position.setZ(index, position.getZ(index) - drop(position.getY(index)));
  }

  // A floor under the movement, so the open case never shows through.
  const floor = new CircleGeometry(LAYOUT.crystalRadius + 0.01, 64)
    .toNonIndexed()
    .translate(0, 0, bottom + TONNEAU.floor);
  const body = mergeGeometries([toCreasedNormals(shell, BODY_CREASE), floor]);

  const strapY = length - TONNEAU.strapInset;
  return {
    body: finish(body),
    lugs: null,
    strap: {
      y: strapY,
      z: CASE_TOP - spec.height / 2 - drop(strapY),
      width: TONNEAU.strapWidth,
    },
  };
}

/** How far the engraving stands off the caseback, against z-fighting. */
const ENGRAVING_LIFT = 0.0015;

/**
 * The caseback's face, to engrave: it follows the back's dome, its UVs
 * laid out flat across `radius` and mirrored, so a texture reads the right
 * way round from behind with 12 o'clock up.
 */
export function casebackGeometry(spec: CaseSpec): {
  readonly geometry: BufferGeometry;
  readonly radius: number;
  /** A back plate closing an open case underneath; null if it is closed. */
  readonly plate: BufferGeometry | null;
} {
  const bottom = CASE_TOP - spec.height;
  let geometry: BufferGeometry;
  let radius: number;
  let plate: BufferGeometry | null = null;
  if (spec.style === 'tonneau') {
    // The shell is open underneath, round the movement: a flat back plate
    // closes it, where the case doesn't bend to the wrist.
    radius = LAYOUT.crystalRadius;
    plate = new CircleGeometry(radius + TONNEAU.plateOverlap, 96)
      .rotateY(Math.PI)
      .translate(0, 0, bottom - ENGRAVING_LIFT / 2);
    geometry = new CircleGeometry(radius, 96)
      .rotateY(Math.PI)
      .translate(0, 0, bottom - ENGRAVING_LIFT);
  } else {
    const round = ROUND_CASES[spec.style];
    const face = round
      .profile({ radius: spec.radius, height: spec.height, seat: spec.radius })
      .slice(0, round.back);
    radius = face.at(-1)?.[0] ?? spec.radius;
    geometry = lathe(
      face.map(([r, z]) => [r, z - ENGRAVING_LIFT] as const),
      BODY_SEGMENTS
    );
  }
  const position = geometry.getAttribute('position');
  const uvs: number[] = [];
  for (let index = 0; index < position.count; index++) {
    uvs.push(
      0.5 - position.getX(index) / (2 * radius),
      0.5 + position.getY(index) / (2 * radius)
    );
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return { geometry, radius, plate };
}

/**
 * The case middle and its lugs. `bezelOuter` is the bezel's outer radius:
 * the case top steps down outside it.
 */
export function caseGeometry(spec: CaseSpec, bezelOuter: number): CaseGeometry {
  if (spec.style === 'tonneau') return tonneauCase(spec, bezelOuter);
  const round = ROUND_CASES[spec.style];
  const size = { radius: spec.radius, height: spec.height, seat: bezelOuter };
  const body = toCreasedNormals(
    lathe(round.profile(size), BODY_SEGMENTS),
    BODY_CREASE
  );
  const { lugs: design } = round;
  const springBar = design.tip - design.springBar;
  const station = lugShape(design, spec)(springBar);
  return {
    body: finish(body),
    lugs: lugGeometry(design, spec),
    strap: {
      y: springBar,
      z: (station.top + station.bottom) / 2,
      width: design.gap,
    },
  };
}

// Crowns and pushers are turned parts along +X, their inner face at x = 0:
// place them at the case radius, at crownAxisZ().

interface Fluting {
  readonly count: number;
  readonly depth: number;
  /** Share of each flute's pitch taken by its groove. */
  readonly groove: number;
  readonly samplesPerFlute: number;
}

interface CrownDesign {
  readonly radius: number;
  /** Length of the head, beyond its tube. */
  readonly length: number;
  readonly tube: { readonly radius: number; readonly length: number };
  readonly chamfer: number;
  /** How far the face bulges out. */
  readonly dome: number;
  readonly flutes: Fluting | null;
  /** A recessed grip band round the middle of the head. */
  readonly band: { readonly width: number; readonly depth: number } | null;
  /** A bulb, widest in the middle of its head, instead of a straight side. */
  readonly onion?: boolean;
}

/** An onion crown's radius at its ends, as a share of its widest. */
const ONION_WAIST = 0.62;
const ONION_STEPS = 12;

/** A crown that is there: a digital has none. */
export type CrownPart = Exclude<CrownStyle, 'none'>;

const CROWNS: Readonly<Record<CrownPart, CrownDesign>> = {
  // Coarse flutes on a short tube, between the guards.
  screwDown: {
    radius: 0.16,
    length: 0.17,
    tube: { radius: 0.07, length: 0.04 },
    chamfer: 0.014,
    dome: 0.008,
    flutes: { count: 24, depth: 0.014, groove: 0.5, samplesPerFlute: 8 },
    band: null,
  },
  // A big crown with a fine coin edge.
  tool: {
    radius: 0.18,
    length: 0.13,
    tube: { radius: 0.065, length: 0.045 },
    chamfer: 0.012,
    dome: 0,
    flutes: { count: 40, depth: 0.008, groove: 1, samplesPerFlute: 4 },
    band: null,
  },
  // A small, thin dress crown with fine fluting and a domed face.
  flat: {
    radius: 0.12,
    length: 0.09,
    tube: { radius: 0.05, length: 0.02 },
    chamfer: 0.01,
    dome: 0.012,
    flutes: { count: 36, depth: 0.005, groove: 1, samplesPerFlute: 4 },
    band: null,
  },
  // A big fluted onion a gloved hand can wind, as on a pilot's watch.
  onion: {
    radius: 0.2,
    length: 0.2,
    tube: { radius: 0.07, length: 0.04 },
    chamfer: 0,
    dome: 0.01,
    flutes: { count: 16, depth: 0.016, groove: 0.5, samplesPerFlute: 8 },
    band: null,
    onion: true,
  },
  // A tall barrel with a grip band, as on a racing tonneau.
  barrel: {
    radius: 0.17,
    length: 0.17,
    tube: { radius: 0.08, length: 0.03 },
    chamfer: 0.016,
    dome: 0,
    flutes: null,
    band: { width: 0.07, depth: 0.022 },
  },
};

const TURNED_SEGMENTS = 64;
const PUSHER_SEGMENTS = 48;
const FACE_STEPS = 5;

/** Spins a [radius, x] profile around the +X axis. */
function turned(
  profile: readonly Point[],
  segments: number,
  fluting?: { readonly flutes: Fluting; readonly radius: number }
): BufferGeometry {
  const geometry = new LatheGeometry(
    profile.map(([radius, x]) => new Vector2(radius, x)),
    segments
  );
  if (fluting) cutFlutes(geometry, fluting.flutes, fluting.radius);
  // Lathe geometry spins around +Y; these parts point along +X.
  geometry.rotateZ(-Math.PI / 2);
  return finish(toCreasedNormals(geometry, SMALL_PART_CREASE));
}

/**
 * Cuts grooves round a lathe part spun around Y. They run the full length
 * of the side and through the chamfers, fading out towards the face.
 */
function cutFlutes(
  geometry: BufferGeometry,
  { count, depth, groove }: Fluting,
  radius: number
) {
  const position = geometry.getAttribute('position');
  const start = radius - depth * 2.5;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const distance = Math.hypot(x, z);
    if (distance <= start) continue;
    const pitch = (Math.atan2(x, z) / (Math.PI * 2)) * count;
    const offset = Math.abs(pitch - Math.floor(pitch) - 0.5) / (groove / 2);
    const shape = offset < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * offset) : 0;
    const reach = clamp01((distance - start) / (radius - start));
    const scale = (distance - depth * shape * reach) / distance;
    position.setXYZ(index, x * scale, position.getY(index), z * scale);
  }
}

function crownProfile({
  radius,
  length,
  tube,
  chamfer,
  dome,
  band,
  onion,
}: CrownDesign): Point[] {
  const start = tube.length;
  const end = start + length;
  if (onion) {
    const waist = radius * ONION_WAIST;
    const bulb = Array.from({ length: ONION_STEPS + 1 }, (_, index) => {
      const t = index / ONION_STEPS;
      return [
        waist + (radius - waist) * Math.sin(Math.PI * t),
        start + t * length,
      ] as const;
    });
    const cap = Array.from({ length: FACE_STEPS }, (_, index) => {
      const r = waist * (1 - (index + 1) / FACE_STEPS);
      return [r, end + dome * (1 - (r / waist) ** 2)] as const;
    });
    return [[0, 0], [tube.radius, 0], [tube.radius, start], ...bulb, ...cap];
  }
  const middle = (start + end) / 2;
  const grip: Point[] = band
    ? [
        [radius, middle - band.width / 2],
        [radius - band.depth, middle - band.width / 2 + band.depth / 2],
        [radius - band.depth, middle + band.width / 2 - band.depth / 2],
        [radius, middle + band.width / 2],
      ]
    : [];
  const faceRadius = radius - chamfer;
  const face = Array.from({ length: FACE_STEPS + 1 }, (_, index) => {
    const r = faceRadius * (1 - index / FACE_STEPS);
    return [r, end + dome * (1 - (r / faceRadius) ** 2)] as const;
  });
  return [
    [0, 0],
    [tube.radius, 0],
    [tube.radius, start],
    [faceRadius, start],
    [radius, start + chamfer],
    ...grip,
    [radius, end - chamfer],
    ...face,
  ];
}

/** The crown: its axis along +X, its inner face (the tube's) at x = 0. */
export function crownGeometry(style: CrownPart): BufferGeometry {
  const design = CROWNS[style];
  const profile = crownProfile(design);
  if (!design.flutes) return turned(profile, TURNED_SEGMENTS);
  return turned(profile, design.flutes.count * design.flutes.samplesPerFlute, {
    flutes: design.flutes,
    radius: design.radius,
  });
}

/** Height of the crown's axis (and the pushers'), halfway up the flank. */
export function crownAxisZ(spec: CaseSpec): number {
  const middle =
    spec.style === 'tonneau'
      ? CASE_TOP - spec.height / 2
      : ROUND_CASES[spec.style].flankMiddle(spec.height);
  // Without a crown, its buttons sit where it would.
  const radius =
    spec.crown === 'none'
      ? PUSHERS.buttons.collar.radius
      : CROWNS[spec.crown].radius;
  const highest = CASE_TOP - radius - CROWN_CLEARANCE;
  return Math.min(middle, highest);
}

const GUARD = {
  /** The faces either side of the crown, clear of its head. */
  inner: 0.185,
  /** Where each shoulder has eased back into the flank. */
  outer: 0.5,
  /** How far the shoulders stand out of the flank beside the crown. */
  reach: 0.135,
  /** How deep the outline reaches into the case. */
  embed: 0.07,
  halfHeight: 0.12,
  bevel: 0.012,
  samples: 16,
} as const;

/** The upper shoulder seen from the front; the lower one mirrors it. */
function guardOutline(radius: number): Point[] {
  const { inner, outer, reach, embed, bevel, samples } = GUARD;
  // The extrude bevel grows the outline by its size; start that far in.
  const flank = (y: number) => Math.sqrt(radius ** 2 - y ** 2) - bevel;
  const shoulder = Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    // Highest beside the crown, easing into the flank with no step.
    const rise = reach * (1 - t) ** 2 * (1 + 2 * t);
    const y = lerp(inner, outer, t);
    return [flank(y) + rise, y] as const;
  });
  return [[radius - embed, inner], ...shoulder, [flank(outer) - embed, outer]];
}

/**
 * Both crown guards at 3 o'clock, for a case of `radius`, centred on the
 * crown's axis height. Placed at the origin, not at the crown.
 */
export function crownGuardGeometry(
  radius: number,
  axisZ = CASE_TOP - CROWNS.screwDown.radius - CROWN_CLEARANCE
): BufferGeometry {
  const upper = guardOutline(radius);
  const lower = upper.map(([x, y]) => [x, -y] as const);
  const options = {
    depth: GUARD.halfHeight * 2,
    bevel: GUARD.bevel,
    curveSegments: 4,
    bevelSegments: 3,
  };
  const both = mergeGeometries([
    extrude(upper, options),
    extrude(lower, options),
  ]);
  both.translate(0, 0, axisZ - GUARD.halfHeight);
  return finish(toCreasedNormals(both, SMALL_PART_CREASE));
}

interface PusherDesign {
  /** The tube it slides in, standing out of the case. */
  readonly collar: { readonly radius: number; readonly length: number };
  readonly neck: { readonly radius: number; readonly length: number };
  readonly radius: number;
  /** Overall length, cap included. */
  readonly length: number;
  readonly chamfer: number;
  /** Height of a domed cap; 0 for a flat one. */
  readonly dome: number;
}

const PUSHERS: Readonly<Record<PusherStyle, PusherDesign>> = {
  // A flat-topped piston over a wider collar.
  pump: {
    collar: { radius: 0.082, length: 0.04 },
    neck: { radius: 0.045, length: 0.015 },
    radius: 0.06,
    length: 0.15,
    chamfer: 0.008,
    dome: 0,
  },
  // A digital's broad button, flat-faced over a deep collar.
  buttons: {
    collar: { radius: 0.095, length: 0.05 },
    neck: { radius: 0.06, length: 0.012 },
    radius: 0.075,
    length: 0.14,
    chamfer: 0.012,
    dome: 0,
  },
  // A slim round pusher with a domed cap.
  round: {
    collar: { radius: 0.06, length: 0.025 },
    neck: { radius: 0.045, length: 0.01 },
    radius: 0.055,
    length: 0.14,
    chamfer: 0.006,
    dome: 0.035,
  },
};

function pusherProfile({
  collar,
  neck,
  radius,
  length,
  chamfer,
  dome,
}: PusherDesign): Point[] {
  const head = collar.length + neck.length;
  const cap: Point[] =
    dome > 0
      ? arc([0, length - dome], [radius, dome], 0, 90, 6)
      : [
          [radius, length - chamfer],
          [radius - chamfer, length],
          [0, length],
        ];
  return [
    [0, 0],
    [collar.radius, 0],
    [collar.radius, collar.length - chamfer],
    [collar.radius - chamfer, collar.length],
    [neck.radius, collar.length],
    [neck.radius, head],
    [radius - chamfer, head],
    [radius, head + chamfer],
    ...cap,
  ];
}

/** A chronograph pusher: its axis along +X, its inner face at x = 0. */
export function pusherGeometry(style: PusherStyle): BufferGeometry {
  return turned(pusherProfile(PUSHERS[style]), PUSHER_SEGMENTS);
}
