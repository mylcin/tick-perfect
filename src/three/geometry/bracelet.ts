import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  mergeGeometries,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';

import { extrude } from './build';
import type { Point } from './outlines';

// Metal link bracelets for one side of the case, the 12 o'clock one. Each
// link is built once in its own frame (x across the bracelet, y along it,
// z out of its top face, centred on the origin) and drawn as instances; the
// 6 o'clock side is the same set turned half a turn about the watch axis.

export type BraceletType = 'oyster' | 'jubilee';

interface BraceletStyle {
  /** Distance between the pins of consecutive rows. */
  readonly pitch: number;
  readonly thickness: number;
  /** Each outer link's share of the row width. */
  readonly outerShare: number;
  /** Links between the two outer ones; they share what is left. */
  readonly centreLinks: number;
  /** Edge rounding of the outer and centre links. */
  readonly outerRadius: number;
  readonly centreRadius: number;
  /**
   * Alternate columns sit half a pitch apart, the way a five-piece
   * bracelet's links interlock around their pins.
   */
  readonly staggered: boolean;
}

/**
 * The three-piece bracelet has broad, flat links in aligned rows; the
 * five-piece one has narrower outer links around three small, rounded
 * centre links, the two beside the middle one offset by half a link.
 */
export const BRACELET_STYLES: Readonly<Record<BraceletType, BraceletStyle>> = {
  oyster: {
    pitch: 0.26,
    thickness: 0.11,
    outerShare: 0.36,
    centreLinks: 1,
    outerRadius: 0.022,
    centreRadius: 0.022,
    staggered: false,
  },
  jubilee: {
    pitch: 0.2,
    thickness: 0.1,
    outerShare: 0.3,
    centreLinks: 3,
    outerRadius: 0.022,
    centreRadius: 0.042,
    staggered: true,
  },
};

/** Links are built for a row this wide; instances scale them to fit. */
const ROW_WIDTH = 1;
const LINK_GAP = 0.008;
/** Segments per rounded edge; smooth normals do the rest at this size. */
const LINK_EDGE_SEGMENTS = 1;
/** The bracelet leaves the lugs dipping slightly, about the x axis. */
const START_ANGLE = -0.2;
/** Straight run past the lug ends before it bends round the wrist. */
const STRAIGHT_RUN = 0.4;
const BEND_RADIUS = 2.6;
/** Width at the far end, as a share of the width at the lugs. */
const END_TAPER = 0.8;
/** The end link sinks this far into the case, so no light shows between. */
const END_LINK_TUCK = 0.015;
/** At the case, the end link runs this deep to close the lug gap below. */
const END_LINK_DEPTH_AT_CASE = 0.2;
const END_LINK_BEVEL = 0.018;
const END_LINK_BEVEL_SEGMENTS = 3;
const END_LINK_CORNER = 0.03;
const CORNER_SEGMENTS = 6;
const CASE_EDGE_SEGMENTS = 24;
/** Above the bevel's 30° steps, so the rounded edges shade smoothly. */
const END_LINK_CREASE = Math.PI / 5;
/** How far a staggered stub sinks into the end link, hiding its back end. */
const STUB_TUCK = 0.05;
/** Keeps floating-point division from losing a row that fits exactly. */
const ROW_TOLERANCE = 1e-9;
const X_AXIS = new Vector3(1, 0, 0);

/**
 * How the end link meets the case it is fitted to: the row `width` its
 * instance is scaled to, the case radius its back edge is hollowed to, and
 * how far it reaches back from the spring bar (see endLinkReach).
 */
export interface EndLinkFit {
  readonly width: number;
  readonly caseRadius: number;
  readonly reach: number;
}

/**
 * How far the end link reaches back from a spring bar at `springBarY` to
 * meet a case of `caseRadius` at its centre line. It leaves the bar
 * dipping at START_ANGLE, so the run along it is a little longer than the
 * run along y.
 */
export function endLinkReach(springBarY: number, caseRadius: number): number {
  return (springBarY - caseRadius) / Math.cos(START_ANGLE) + END_LINK_TUCK;
}

export interface BraceletGeometry {
  /** Brushed outer links, in the case metal. */
  readonly outer: BufferGeometry;
  /** Centre links: brushed on the oyster, polished on the jubilee. */
  readonly centre: BufferGeometry;
  /** The solid end link that fills the lug gap, in the case metal. */
  readonly end: BufferGeometry;
}

export interface BraceletLinks {
  readonly outer: readonly Matrix4[];
  readonly centre: readonly Matrix4[];
  readonly end: Matrix4;
}

interface Column {
  /** Centre across a row of ROW_WIDTH. */
  readonly x: number;
  readonly width: number;
  readonly part: 'outer' | 'centre';
  /** Offset along the bracelet, in pitches. */
  readonly phase: number;
}

function centreLinkWidth(style: BraceletStyle): number {
  const outer = style.outerShare * ROW_WIDTH * 2;
  const gaps = (style.centreLinks + 1) * LINK_GAP;
  return (ROW_WIDTH - outer - gaps) / style.centreLinks;
}

/** The links of one row, left to right. */
function rowColumns(style: BraceletStyle): Column[] {
  const outer = style.outerShare * ROW_WIDTH;
  const widths = [
    outer,
    ...Array.from({ length: style.centreLinks }, () => centreLinkWidth(style)),
    outer,
  ];
  let left = -ROW_WIDTH / 2;
  return widths.map((width, index) => {
    const x = left + width / 2;
    left += width + LINK_GAP;
    return {
      x,
      width,
      part: index === 0 || index === widths.length - 1 ? 'outer' : 'centre',
      phase: style.staggered && index % 2 === 1 ? 0.5 : 0,
    };
  });
}

/**
 * A rounded link. Its UVs are swapped so u runs along the bracelet and a
 * brushed material's grain follows the links, as the case's grain follows
 * its lathe UVs round the axis.
 */
function link(
  width: number,
  length: number,
  thickness: number,
  radius: number
): BufferGeometry {
  const geometry = new RoundedBoxGeometry(
    width,
    length,
    thickness,
    LINK_EDGE_SEGMENTS,
    radius
  );
  geometry.clearGroups();
  return grainAlongLength(geometry);
}

function grainAlongLength(geometry: BufferGeometry): BufferGeometry {
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) {
    const u = uv.getX(index);
    uv.setXY(index, uv.getY(index), u);
  }
  uv.needsUpdate = true;
  return geometry;
}

function arc(
  [cx, cy]: Point,
  radius: number,
  from: number,
  to: number
): Point[] {
  return Array.from({ length: CORNER_SEGMENTS + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / CORNER_SEGMENTS;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

/**
 * Where the end link meets the case, `x` across from the centre line. The
 * link is built a row ROW_WIDTH wide and scaled to the real width, so the
 * case is followed at the scaled x, and its curve away from the bar is
 * measured along the dipping link.
 */
function caseEdge(x: number, fit: EndLinkFit): number {
  const across = (x / ROW_WIDTH) * fit.width;
  const sag = fit.caseRadius - Math.sqrt(fit.caseRadius ** 2 - across ** 2);
  return -fit.reach - sag / Math.cos(START_ANGLE);
}

/**
 * The solid end link, seen from the front: a block the full row width, its
 * front edge facing the first row and its back edge hollowed to the case.
 * The bevel grows the outline, so it is drawn inset by that much.
 */
function endLinkOutline(fit: EndLinkFit): Point[] {
  const half = ROW_WIDTH / 2 - END_LINK_BEVEL;
  const front = -LINK_GAP / 2 - END_LINK_BEVEL;
  const corner = END_LINK_CORNER;
  const back = Array.from({ length: CASE_EDGE_SEGMENTS + 1 }, (_, index) => {
    const x = -half + (2 * half * index) / CASE_EDGE_SEGMENTS;
    return [x, caseEdge(x, fit) + END_LINK_BEVEL] as const;
  });
  return [
    ...arc([half - corner, front - corner], corner, 0, Math.PI / 2),
    ...arc([-half + corner, front - corner], corner, Math.PI / 2, Math.PI),
    ...back,
  ];
}

function endLink(style: BraceletStyle, fit: EndLinkFit): BufferGeometry {
  const { thickness } = style;
  const block = extrude(endLinkOutline(fit), {
    depth: thickness,
    bevel: END_LINK_BEVEL,
    bevelSegments: END_LINK_BEVEL_SEGMENTS,
  });
  block.translate(0, 0, -thickness / 2);

  // Its underside slopes down towards the case, so the lug gap reads as
  // solid metal from a low angle; the top stays flush with the links.
  const position = block.getAttribute('position');
  const front = -LINK_GAP / 2;
  const extra = END_LINK_DEPTH_AT_CASE - thickness;
  for (let index = 0; index < position.count; index++) {
    const z = position.getZ(index);
    if (z >= 0) continue;
    const towardsCase = (front - position.getY(index)) / fit.reach;
    position.setZ(index, z - extra * Math.min(Math.max(towardsCase, 0), 1));
  }
  position.needsUpdate = true;

  const body = grainAlongLength(toCreasedNormals(block, END_LINK_CREASE));
  if (!style.staggered) return body;

  // A staggered column's first link starts half a pitch out; the end link
  // fills that half with a stub of its own, as the real ones do.
  const stubFront = style.pitch / 2 - LINK_GAP / 2;
  const stubs = rowColumns(style)
    .filter(column => column.phase > 0)
    .map(column =>
      link(
        column.width,
        stubFront + STUB_TUCK,
        thickness,
        style.centreRadius
      ).translate(column.x, (stubFront - STUB_TUCK) / 2, 0)
    );
  return mergeGeometries([body, ...stubs]);
}

/**
 * The link shapes of a bracelet, sized for a row one unit wide. Each sits
 * centred on its origin and is placed by the matrices from braceletLinks;
 * the end link is fitted to the case and the width given by `fit`.
 */
export function braceletGeometry(
  type: BraceletType,
  fit: EndLinkFit
): BraceletGeometry {
  const style = BRACELET_STYLES[type];
  const length = style.pitch - LINK_GAP;
  return {
    outer: link(
      style.outerShare * ROW_WIDTH,
      length,
      style.thickness,
      style.outerRadius
    ),
    centre: link(
      centreLinkWidth(style),
      length,
      style.thickness,
      style.centreRadius
    ),
    end: endLink(style, fit),
  };
}

/**
 * The bracelet's centre line `distance` along it from the lug ends, as
 * [y, z] from its start: straight at first, then bending away from the
 * viewer round the wrist.
 */
export function braceletPath(distance: number): [y: number, z: number] {
  const straight = Math.min(distance, STRAIGHT_RUN);
  const y = straight * Math.cos(START_ANGLE);
  const z = straight * Math.sin(START_ANGLE);
  if (distance <= STRAIGHT_RUN) return [y, z];
  const angle = START_ANGLE - (distance - STRAIGHT_RUN) / BEND_RADIUS;
  return [
    y + BEND_RADIUS * (Math.sin(START_ANGLE) - Math.sin(angle)),
    z + BEND_RADIUS * (Math.cos(angle) - Math.cos(START_ANGLE)),
  ];
}

/**
 * Where every link of one side goes. Rows run from the lug ends at
 * (0, startY, startZ) out along +Y for `length`, tapering from `width` to
 * END_TAPER of it. Each link is rigid between its two pins, which sit on
 * the bent centre line, so neighbours meet at the pins.
 */
export function braceletLinks(
  type: BraceletType,
  options: {
    readonly width: number;
    readonly startY: number;
    readonly startZ: number;
    readonly length: number;
  }
): BraceletLinks {
  const { width, startY, startZ, length } = options;
  const style = BRACELET_STYLES[type];
  const rows = Math.max(Math.floor(length / style.pitch + ROW_TOLERANCE), 0);
  const last = rows * style.pitch;

  const widthAt = (distance: number) => {
    const along = length > 0 ? Math.min(distance / length, 1) : 0;
    return width * (1 - (1 - END_TAPER) * along);
  };

  const place = (from: number, to: number, x: number) => {
    const [y0, z0] = braceletPath(from);
    const [y1, z1] = braceletPath(to);
    const scale = widthAt((from + to) / 2) / ROW_WIDTH;
    return new Matrix4().compose(
      new Vector3(x * scale, startY + (y0 + y1) / 2, startZ + (z0 + z1) / 2),
      new Quaternion().setFromAxisAngle(X_AXIS, Math.atan2(z1 - z0, y1 - y0)),
      new Vector3(scale, 1, 1)
    );
  };

  const outer: Matrix4[] = [];
  const centre: Matrix4[] = [];
  const columns = rowColumns(style);
  for (let row = 0; row < rows; row++) {
    for (const column of columns) {
      const from = (row + column.phase) * style.pitch;
      const to = from + style.pitch;
      // A staggered column's last link would hang past the final row.
      if (to > last + ROW_TOLERANCE) continue;
      (column.part === 'outer' ? outer : centre).push(
        place(from, to, column.x)
      );
    }
  }

  const end = new Matrix4().compose(
    new Vector3(0, startY, startZ),
    new Quaternion().setFromAxisAngle(X_AXIS, START_ANGLE),
    new Vector3(width / ROW_WIDTH, 1, 1)
  );
  return { outer, centre, end };
}
