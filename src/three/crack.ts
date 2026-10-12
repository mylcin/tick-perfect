import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

import { createRng, nextFloat, type RngState } from '../game';
import { LAYOUT } from './layout';

// The crystal cracking on a miss. The pattern is generated from a seed with
// the impact at 12 o'clock; the mesh then turns it to where the hand stopped.

type Point = readonly [x: number, y: number];

interface CrackLine {
  readonly points: readonly Point[];
  /** Relative stroke width, 1 for the main fractures. */
  readonly weight: number;
}

/** How far out along the hand the glass breaks, in dial radii. */
export const IMPACT_RADIUS = 0.6;
const EDGE = LAYOUT.crystalRadius * 0.985;
const MAX_BRANCH_DEPTH = 2;

/** A tiny wrapper so the generator reads like ordinary random calls. */
function random(seed: number) {
  let state: RngState = createRng(seed);
  return (min = 0, max = 1) => {
    const [value, next] = nextFloat(state);
    state = next;
    return min + value * (max - min);
  };
}

function clipToCrystal([x, y]: Point): Point {
  const distance = Math.hypot(x, y);
  return distance <= EDGE
    ? [x, y]
    : [(x / distance) * EDGE, (y / distance) * EDGE];
}

/**
 * Fracture lines for one impact: radial cracks that wander and branch,
 * joined near the impact by two jagged rings, all inside the crystal.
 */
export function crackLines(
  seed: number,
  impact: Point = [0, IMPACT_RADIUS]
): CrackLine[] {
  const next = random(seed);
  const lines: CrackLine[] = [];
  const reach = LAYOUT.crystalRadius;

  const walk = (
    start: Point,
    heading: number,
    length: number,
    weight: number,
    depth: number
  ) => {
    const points: Point[] = [start];
    let [x, y] = start;
    let direction = heading;
    let travelled = 0;
    while (travelled < length) {
      const step = reach * next(0.03, 0.075);
      direction += next(-0.28, 0.28);
      x += Math.cos(direction) * step;
      y += Math.sin(direction) * step;
      travelled += step;
      const point = clipToCrystal([x, y]);
      points.push(point);
      if (point[0] !== x || point[1] !== y) break;
      if (depth < MAX_BRANCH_DEPTH && next() < 0.14) {
        const turn = next(0.35, 0.8) * (next() < 0.5 ? -1 : 1);
        walk(
          point,
          direction + turn,
          (length - travelled) * next(0.35, 0.7),
          weight * 0.6,
          depth + 1
        );
      }
    }
    if (points.length > 1) lines.push({ points, weight });
  };

  const spokes = Math.floor(next(7, 12));
  const offset = next(0, Math.PI * 2);
  const headings = Array.from(
    { length: spokes },
    (_, index) => offset + (index / spokes) * Math.PI * 2 + next(-0.22, 0.22)
  );
  for (const heading of headings) {
    walk(impact, heading, reach * next(0.3, 1.05), 1, 0);
  }

  // Concentric fractures close to the impact, linking neighbouring spokes.
  for (const radius of [reach * next(0.06, 0.09), reach * next(0.15, 0.21)]) {
    headings.forEach((heading, index) => {
      if (next() < 0.25) return;
      const following = headings[(index + 1) % spokes] ?? heading;
      const end = following < heading ? following + Math.PI * 2 : following;
      const middle = (heading + end) / 2;
      const around = (angle: number, scale: number): Point =>
        clipToCrystal([
          impact[0] + Math.cos(angle) * radius * scale,
          impact[1] + Math.sin(angle) * radius * scale,
        ]);
      lines.push({
        points: [
          around(heading, 1),
          around(middle, next(0.8, 1.05)),
          around(end, 1),
        ],
        weight: 0.55,
      });
    });
  }

  return lines;
}

const TEXTURE_SIZE = 1024;
/** Stroke width of a main fracture, in texture pixels. */
const LINE_WIDTH = 2.4;

/**
 * A canvas texture covering the crystal disc that `draw` paints a crack
 * pattern into. Lines are white on black, for additive blending: the glass
 * shows only the light its fractures catch.
 */
export function createCrackTexture(): {
  texture: Texture;
  draw: (seed: number) => void;
} {
  const element = document.createElement('canvas');
  element.width = TEXTURE_SIZE;
  element.height = TEXTURE_SIZE;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;

  const scale = TEXTURE_SIZE / (LAYOUT.crystalRadius * 2);
  const toPixels = ([x, y]: Point): Point => [
    TEXTURE_SIZE / 2 + x * scale,
    TEXTURE_SIZE / 2 - y * scale,
  ];

  const stroke = (lines: CrackLine[], width: number, alpha: number) => {
    context.strokeStyle = `rgba(235, 242, 250, ${String(alpha)})`;
    for (const line of lines) {
      context.lineWidth = width * line.weight;
      context.beginPath();
      line.points.forEach((point, index) => {
        const [x, y] = toPixels(point);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  };

  const draw = (seed: number) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const lines = crackLines(seed);
    // A soft halo, then the sharp edge of each fracture.
    stroke(lines, LINE_WIDTH * 3.5, 0.08);
    stroke(lines, LINE_WIDTH, 0.75);

    const [x, y] = toPixels([0, IMPACT_RADIUS]);
    const spot = context.createRadialGradient(x, y, 0, x, y, 26);
    spot.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    spot.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = spot;
    context.fillRect(x - 26, y - 26, 52, 52);
    texture.needsUpdate = true;
  };

  return { texture, draw };
}
