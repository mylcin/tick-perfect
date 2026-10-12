import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  RingGeometry,
} from 'three';

import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

import type { DialStyle } from '../../watches';
import { CHAPTER } from '../layout';
import { extrude } from './build';
import {
  circle,
  downTriangle,
  insetOutline,
  rectangle,
  type Point,
} from './outlines';

// The parts that sit on a dial: applied hour markers in each dial style,
// the chapter ring, the cyclops lens and the small hands of the registers.

/** One kind of applied marker and the hours it stands at. */
export interface MarkerKind {
  readonly frame: BufferGeometry;
  /** A lume inlay, slightly proud of the frame. */
  readonly inlay: BufferGeometry | null;
  readonly hours: readonly number[];
  readonly radius: number;
  /** Turned to point at the centre, as batons are. */
  readonly radial: boolean;
}

const MARKER_DEPTH = 0.02;
const INLAY_DEPTH = 0.024;
/** A dress watch's 12 is a pair of batons this far apart. */
const DOUBLE_GAP = 0.05;

/**
 * A faceted baton (an obelisk), its top two slopes meeting in a ridge along
 * its length so each slope catches the light differently. It points up +Y,
 * centred on the origin, rising from z = 0.
 */
function facetedBaton(
  width: number,
  length: number,
  height: number
): BufferGeometry {
  const w = width / 2;
  const l = length / 2;
  const shoulder = height * 0.35;
  // The ridge stops short of the ends, which slope down to them.
  const ridge = l - w * 0.9;
  const base = [
    [-w, -l],
    [w, -l],
    [w, l],
    [-w, l],
  ] as const;
  const top = (x: number, y: number): [number, number, number] => [
    x,
    y,
    shoulder,
  ];
  const corners = base.map(([x, y]) => top(x, y));
  const [bl, br, tr, tl] = corners as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  const ridgeTop: [number, number, number] = [0, ridge, height];
  const ridgeBottom: [number, number, number] = [0, -ridge, height];
  const floor = base.map(([x, y]) => [x, y, 0] as [number, number, number]);
  const [fbl, fbr, ftr, ftl] = floor as typeof corners &
    [
      [number, number, number],
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
  const triangles: [number, number, number][][] = [
    // The two long slopes.
    [bl, ridgeBottom, ridgeTop],
    [bl, ridgeTop, tl],
    [br, tr, ridgeTop],
    [br, ridgeTop, ridgeBottom],
    // The two end slopes.
    [bl, br, ridgeBottom],
    [tl, ridgeTop, tr],
    // The low walls round the base.
    [fbl, fbr, br],
    [fbl, br, bl],
    [fbr, ftr, tr],
    [fbr, tr, br],
    [ftr, ftl, tl],
    [ftr, tl, tr],
    [ftl, fbl, bl],
    [ftl, bl, tl],
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(triangles.flat(2), 3)
  );
  geometry.computeVertexNormals();
  return geometry;
}

function flat(outline: readonly Point[], bevel = 0.004): BufferGeometry {
  return extrude(outline, { depth: MARKER_DEPTH, bevel });
}

function inlay(outline: readonly Point[]): BufferGeometry {
  return extrude(outline, { depth: INLAY_DEPTH });
}

/** A pair of outlines side by side, for a double marker at 12. */
function doubled(outline: readonly Point[]): Point[][] {
  const offset = (dx: number) => outline.map(([x, y]) => [x + dx, y] as const);
  return [offset(-DOUBLE_GAP / 2), offset(DOUBLE_GAP / 2)];
}

function merged(outlines: readonly (readonly Point[])[], make: typeof flat) {
  const parts = outlines.map(outline => make(outline));
  const [first, ...rest] = parts;
  if (!first) return new BufferGeometry();
  if (rest.length === 0) return first;
  // Extrusions share their attributes, so they merge into one draw.
  const positions = parts.flatMap(part =>
    Array.from(part.getAttribute('position').array)
  );
  const normals = parts.flatMap(part =>
    Array.from(part.getAttribute('normal').array)
  );
  const uvs = parts.flatMap(part => Array.from(part.getAttribute('uv').array));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  parts.forEach(part => {
    part.dispose();
  });
  return geometry;
}

/** The applied markers of each dial style; a skeleton has none. */
export function markerKinds(style: DialStyle): MarkerKind[] {
  switch (style) {
    case 'maxi': {
      // Big lume dots, batons at 6 and 9, a triangle at 12; 3 is the date.
      const dot = circle(0.07, 48);
      const baton = rectangle(0.085, 0.22);
      const triangle = downTriangle(0.22, 0.18);
      return [
        {
          frame: flat(dot),
          inlay: inlay(circle(0.054, 48)),
          hours: [1, 2, 4, 5, 7, 8, 10, 11],
          radius: 0.79,
          radial: false,
        },
        {
          frame: flat(baton),
          inlay: inlay(rectangle(0.064, 0.198)),
          hours: [6, 9],
          radius: 0.78,
          radial: true,
        },
        {
          frame: flat(triangle),
          inlay: inlay(insetOutline(triangle, 0.22)),
          hours: [0],
          radius: 0.79,
          radial: true,
        },
      ];
    }
    case 'panda': {
      // Slim lume batons, doubled at 12; the registers take 3 and 9 and
      // the date 6.
      const baton = rectangle(0.04, 0.13);
      const lume = rectangle(0.024, 0.112);
      return [
        {
          frame: flat(baton),
          inlay: inlay(lume),
          hours: [1, 2, 4, 5, 7, 8, 10, 11],
          radius: 0.82,
          radial: true,
        },
        {
          frame: merged(doubled(baton), flat),
          inlay: merged(doubled(lume), inlay),
          hours: [0],
          radius: 0.82,
          radial: true,
        },
      ];
    }
    case 'dress':
      // Faceted gold batons; the moon takes 6 and the date 3.
      return [
        {
          frame: facetedBaton(0.034, 0.15, 0.022),
          inlay: null,
          hours: [1, 2, 4, 5, 7, 8, 9, 10, 11],
          radius: 0.775,
          radial: true,
        },
        {
          frame: facetedBaton(0.07, 0.16, 0.022),
          inlay: null,
          hours: [0],
          radius: 0.775,
          radial: true,
        },
      ];
    case 'perpetual':
      // Short faceted batons between the windows, registers, moon and
      // apertures.
      return [
        {
          frame: facetedBaton(0.028, 0.1, 0.018),
          inlay: null,
          hours: [1, 2, 4, 5, 7, 8, 10, 11],
          radius: 0.79,
          radial: true,
        },
      ];
    case 'field': {
      // A lume dot outside each printed numeral; the date takes 3.
      return [
        {
          frame: flat(circle(0.03, 32), 0.002),
          inlay: inlay(circle(0.022, 32)),
          hours: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
          radius: 0.815,
          radial: false,
        },
      ];
    }
    case 'pilot': {
      // The observer's triangle at 12, its two dots printed beside it.
      const triangle = downTriangle(0.2, 0.16);
      return [
        {
          frame: flat(triangle),
          inlay: inlay(insetOutline(triangle, 0.22)),
          hours: [0],
          radius: 0.8,
          radial: true,
        },
      ];
    }
    case 'anadigi': {
      // Slim batons, doubled at 12; the windows take 3 and 6.
      const baton = rectangle(0.034, 0.13);
      const lume = rectangle(0.02, 0.112);
      return [
        {
          frame: flat(baton),
          inlay: inlay(lume),
          hours: [1, 2, 4, 5, 7, 8, 9, 10, 11],
          radius: 0.8,
          radial: true,
        },
        {
          frame: merged(doubled(baton), flat),
          inlay: merged(doubled(lume), inlay),
          hours: [0],
          radius: 0.8,
          radial: true,
        },
      ];
    }
    case 'skeleton':
      return [];
  }
}

/** The chapter ring, its UVs planar over its own outer radius. */
export function chapterRing(): BufferGeometry {
  return new RingGeometry(CHAPTER.inner, CHAPTER.outer, 128, 1);
}

/** The cyclops: a domed lens over the date, magnifying it. */
export const CYCLOPS = {
  width: 0.27,
  height: 0.21,
  /** How much bigger the date looks through it. */
  magnification: 1.5,
} as const;

function roundedRectangle(
  width: number,
  height: number,
  radius: number,
  segments = 6
): Point[] {
  const w = width / 2 - radius;
  const h = height / 2 - radius;
  const points: Point[] = [];
  const corners: Point[] = [
    [w, h],
    [-w, h],
    [-w, -h],
    [w, -h],
  ];
  corners.forEach(([cx, cy], corner) => {
    for (let step = 0; step <= segments; step++) {
      const angle = ((corner + step / segments) * Math.PI) / 2;
      points.push([
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
      ]);
    }
  });
  return points;
}

export function cyclopsLens(): BufferGeometry {
  const lens = extrude(roundedRectangle(CYCLOPS.width, CYCLOPS.height, 0.045), {
    depth: 0.032,
    bevel: 0.014,
    bevelSegments: 5,
    curveSegments: 6,
  });
  return toCreasedNormals(lens, Math.PI / 3);
}

/** The magnified date seen through the lens. */
export function cyclopsDate(): BufferGeometry {
  return new PlaneGeometry(CYCLOPS.width * 0.92, CYCLOPS.height * 0.9);
}

/** A register's small hand, or a perpetual's date hand: a fine needle. */
export function registerHand(length: number): BufferGeometry {
  return extrude(
    [
      [-0.006, -0.03],
      [0.006, -0.03],
      [0.0035, length - 0.02],
      [0, length],
      [-0.0035, length - 0.02],
    ],
    { depth: 0.006 }
  );
}

/** The hub a register's hand turns on. */
export function registerHub(): BufferGeometry {
  return new CircleGeometry(0.016, 20);
}
