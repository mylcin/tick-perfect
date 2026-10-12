import { describe, expect, it } from 'vitest';

import {
  circle,
  downTriangle,
  gripEdge,
  insetOutline,
  rectangle,
  swordHand,
  type Point,
} from './outlines';

const xs = (points: readonly Point[]) => points.map(([x]) => x);
const ys = (points: readonly Point[]) => points.map(([, y]) => y);

describe('swordHand', () => {
  const hand = swordHand({ length: 0.86, width: 0.08, tail: 0.12 });

  it('points up from the tail to the tip', () => {
    expect(Math.max(...ys(hand))).toBeCloseTo(0.86, 12);
    expect(Math.min(...ys(hand))).toBeCloseTo(-0.12, 12);
  });

  it('is as wide as asked and mirror-symmetric', () => {
    expect(Math.max(...xs(hand)) - Math.min(...xs(hand))).toBeCloseTo(0.08, 12);
    const mirrored = hand.map(([x, y]) => `${(-x).toFixed(9)},${y.toFixed(9)}`);
    const original = new Set(
      hand.map(([x, y]) => `${x.toFixed(9)},${y.toFixed(9)}`)
    );
    expect(mirrored.every(point => original.has(point))).toBe(true);
  });
});

describe('insetOutline', () => {
  it('shrinks an outline towards its centre', () => {
    const square = rectangle(2, 2);
    const inner = insetOutline(square, 0.25);
    expect(Math.max(...xs(inner))).toBeCloseTo(0.75, 12);
    expect(Math.min(...ys(inner))).toBeCloseTo(-0.75, 12);
  });
});

describe('basic shapes', () => {
  it('places every circle point on the radius', () => {
    for (const [x, y] of circle(0.5, 24, [1, 1])) {
      expect(Math.hypot(x - 1, y - 1)).toBeCloseTo(0.5, 12);
    }
  });

  it('centres rectangles and triangles where asked', () => {
    expect(rectangle(2, 4, [1, 1])).toEqual([
      [0, -1],
      [2, -1],
      [2, 3],
      [0, 3],
    ]);
    const triangle = downTriangle(0.2, 0.1, [0, 0.8]);
    expect(Math.min(...ys(triangle))).toBeCloseTo(0.75, 12);
    expect(triangle[1]).toEqual([0, 0.75]);
  });
});

describe('gripEdge', () => {
  it('alternates between the outer and inner radius', () => {
    const edge = gripEdge(60, 1.42, 0.014);
    expect(edge).toHaveLength(120);
    edge.forEach(([x, y], index) => {
      expect(Math.hypot(x, y)).toBeCloseTo(index % 2 === 0 ? 1.42 : 1.406, 9);
    });
  });
});
