// 2D outlines for the flat parts of the watch, as [x, y] points in scene
// units. They are plain data so their proportions can be tested without a
// renderer; build.ts turns them into Three.js geometry.

export type Point = readonly [x: number, y: number];

/**
 * A sword hand pointing up (+Y): widest about 60% of the way out, tapering
 * to a point, with a short tail past the centre.
 */
export function swordHand({
  length,
  width,
  tail,
}: {
  length: number;
  width: number;
  tail: number;
}): Point[] {
  const half = width / 2;
  const shoulder = length * 0.62;
  return [
    [0, -tail],
    [half * 0.55, -tail * 0.6],
    [half * 0.7, 0],
    [half, shoulder],
    [half * 0.35, length * 0.93],
    [0, length],
    [-half * 0.35, length * 0.93],
    [-half, shoulder],
    [-half * 0.7, 0],
    [-half * 0.55, -tail * 0.6],
  ];
}

/** `outline` pulled towards its own centroid by `inset` (0..1). */
export function insetOutline(
  outline: readonly Point[],
  inset: number
): Point[] {
  const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length;
  const cy = outline.reduce((sum, [, y]) => sum + y, 0) / outline.length;
  return outline.map(([x, y]) => [
    cx + (x - cx) * (1 - inset),
    cy + (y - cy) * (1 - inset),
  ]);
}

/** A circle of `radius` approximated with `segments` points. */
export function circle(
  radius: number,
  segments: number,
  center: Point = [0, 0]
): Point[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ] as const;
  });
}

/** A rectangle centred on `center`. */
export function rectangle(
  width: number,
  height: number,
  center: Point = [0, 0]
): Point[] {
  const [cx, cy] = center;
  const w = width / 2;
  const h = height / 2;
  return [
    [cx - w, cy - h],
    [cx + w, cy - h],
    [cx + w, cy + h],
    [cx - w, cy + h],
  ];
}

/** A triangle pointing down at `center`, as the 12 o'clock diver marker. */
export function downTriangle(
  width: number,
  height: number,
  center: Point = [0, 0]
): Point[] {
  const [cx, cy] = center;
  return [
    [cx - width / 2, cy + height / 2],
    [cx, cy - height / 2],
    [cx + width / 2, cy + height / 2],
  ];
}

/**
 * The bezel's grip edge seen from the front: `ridges` teeth alternating
 * between `outer` and `outer - depth`.
 */
export function gripEdge(
  ridges: number,
  outer: number,
  depth: number
): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < ridges * 2; index++) {
    const angle = (index / (ridges * 2)) * Math.PI * 2;
    const radius = index % 2 === 0 ? outer : outer - depth;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

/** A straight baton hand pointing up, with a short pointed tip. */
export function batonHand({
  length,
  width,
  tail,
}: {
  length: number;
  width: number;
  tail: number;
}): Point[] {
  const half = width / 2;
  return [
    [-half, -tail],
    [half, -tail],
    [half, length - width],
    [0, length],
    [-half, length - width],
  ];
}

/**
 * A dauphine hand: a long faceted lozenge, widest a quarter of the way
 * out, tapering to a fine point.
 */
export function dauphineHand({
  length,
  width,
  tail,
}: {
  length: number;
  width: number;
  tail: number;
}): Point[] {
  const half = width / 2;
  return [
    [0, -tail],
    [half * 0.45, -tail * 0.4],
    [half, length * 0.22],
    [0, length],
    [-half, length * 0.22],
    [-half * 0.45, -tail * 0.4],
  ];
}

/**
 * A leaf hand: slender at the hub, swelling to its widest past halfway and
 * curving in to a point, like a willow leaf.
 */
export function leafHand({
  length,
  width,
  tail,
  segments = 16,
}: {
  length: number;
  width: number;
  tail: number;
  segments?: number;
}): Point[] {
  const half = width / 2;
  const right: Point[] = [];
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    // A sine swell, its widest point pushed out to 60% of the length.
    const swell = Math.sin(Math.PI * t ** 1.35);
    right.push([half * (0.18 + 0.82 * swell) * (1 - t ** 6), length * t]);
  }
  right[right.length - 1] = [0, length];
  const left = right
    .slice(0, -1)
    .reverse()
    .map(([x, y]) => [-x, y] as const);
  return [[0, -tail], ...right.slice(0, -1), [0, length], ...left];
}

/**
 * The tourbillon's bridge: a ring with `arms` spokes reaching out to its
 * screws, seen from the front.
 */
export function bridgeOutline(
  radius: number,
  arms: number,
  armWidth: number,
  segments = 72
): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    // Each arm swells the outline out to the full radius.
    const phase = Math.cos(angle * arms);
    const lobe = Math.max(0, phase) ** (1 / armWidth);
    const reach = radius * (0.32 + 0.68 * lobe);
    points.push([Math.sin(angle) * reach, Math.cos(angle) * reach]);
  }
  return points;
}

/** A chevron pointing along +X (the direction of travel), centred. */
export function chevron(width: number, height: number): Point[] {
  const w = width / 2;
  const h = height / 2;
  return [
    [-w, -h],
    [w * 0.15, -h],
    [w, 0],
    [w * 0.15, h],
    [-w, h],
    [-w * 0.15, 0],
  ];
}
