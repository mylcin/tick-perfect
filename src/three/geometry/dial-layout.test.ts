import { Box3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import {
  CHRONOGRAPH,
  GRAND_COMPLICATION,
  type DialSlot,
  type WatchSpec,
} from '../../watches';
import {
  CHAPTER,
  dateWindowCentre,
  polar,
  slotFor,
  type SlotLayout,
} from '../layout';
import { DATE_RING } from '../prints';
import { markerKinds } from './dial-parts';
import { DATE_WINDOW } from './parts';

// Everything on a chronograph dial, laid out flat: the registers, the moon,
// the apertures, the date window and the hour markers must keep clear of
// each other, of the centre and of the scale round the edge.

/** The least room between any two parts, in dial radii. */
const MIN_GAP = 0.03;
/** The hands' hub at the centre. */
const HUB = 0.048;
/** How far a sub-dial's polished rim reaches past its radius. */
const RIM = 0.01;
/** How far a small aperture's frame reaches past its opening. */
const APERTURE_FRAME = 0.018;
/** The bevel round the date window's frame. */
const FRAME_BEVEL = 0.004;
/** Where a panda's printed minute track starts. */
const MINUTE_TRACK = 0.935;

interface Circle {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

interface Box {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

function circleAt(name: string, slot: SlotLayout, reach: number): Circle {
  return { name, x: slot.x, y: slot.y, r: slot.radius + reach };
}

/** The sub-dials and apertures of a dial, each as the circle it covers. */
function rounds(spec: WatchSpec): Circle[] {
  const { chronograph, smallSeconds, moon } = spec.complications;
  const at = (slot: DialSlot) => slotFor(spec, slot);
  return [
    ...(smallSeconds
      ? [circleAt('small seconds', at(smallSeconds.slot), RIM)]
      : []),
    ...(chronograph ? [circleAt('counter', at(chronograph.counter), RIM)] : []),
    ...(moon
      ? [
          {
            name: 'moon',
            ...at(moon.slot),
            r: DATE_RING.radius + 0.028 + RIM,
          },
        ]
      : []),
    ...(spec.date.at === 'fourThirty'
      ? [circleAt('score', at('fourThirty'), APERTURE_FRAME)]
      : []),
  ];
}

/** Each applied marker, as small circles along its length. */
function markers(spec: WatchSpec): Circle[] {
  return markerKinds(spec.dial.style).flatMap(kind => {
    const { max } = box(kind.frame);
    const steps = 6;
    return kind.hours.flatMap(hour =>
      Array.from({ length: steps + 1 }, (_, step) => {
        const along = -max.y + (step / steps) * max.y * 2;
        const [x, y] = polar(hour * 30, kind.radius + along);
        return { name: `marker at ${String(hour)}`, x, y, r: max.x };
      })
    );
  });
}

function dateBox(spec: WatchSpec): Box | null {
  if (spec.date.at === 'fourThirty') return null;
  const [x, y] = dateWindowCentre(spec);
  return {
    name: 'date window',
    x,
    y,
    halfWidth: DATE_WINDOW.width / 2 + DATE_WINDOW.frame + FRAME_BEVEL,
    halfHeight: DATE_WINDOW.height / 2 + DATE_WINDOW.frame + FRAME_BEVEL,
  };
}

function gap(a: Circle, b: Circle): number {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
}

function gapToBox(circle: Circle, { x, y, halfWidth, halfHeight }: Box) {
  const dx = Math.max(Math.abs(circle.x - x) - halfWidth, 0);
  const dy = Math.max(Math.abs(circle.y - y) - halfHeight, 0);
  return Math.hypot(dx, dy) - circle.r;
}

describe.each([
  ['Chronograph', CHRONOGRAPH, MINUTE_TRACK],
  ['Grand Complication', GRAND_COMPLICATION, CHAPTER.inner],
] as const)('the %s dial', (_, spec, edge) => {
  const parts = rounds(spec);
  const marks = markers(spec);

  it('keeps its sub-dials and apertures apart', () => {
    parts.forEach((a, index) => {
      for (const b of parts.slice(index + 1)) {
        expect(gap(a, b), `${a.name} and ${b.name}`).toBeGreaterThan(MIN_GAP);
      }
    });
  });

  it('keeps every part clear of the markers', () => {
    for (const part of parts) {
      for (const mark of marks) {
        expect(gap(part, mark), `${part.name}, ${mark.name}`).toBeGreaterThan(
          MIN_GAP
        );
      }
    }
  });

  it('keeps every part clear of the centre and the scale round it', () => {
    for (const part of parts) {
      const distance = Math.hypot(part.x, part.y);
      expect(distance - part.r, part.name).toBeGreaterThan(HUB + MIN_GAP);
      expect(distance + part.r, part.name).toBeLessThan(edge);
    }
  });
});

describe('the Chronograph date at 6', () => {
  const date = dateBox(CHRONOGRAPH);

  it('is a window, clear of the registers and the markers', () => {
    if (!date) throw new Error('the Chronograph has a date window');
    for (const part of [...rounds(CHRONOGRAPH), ...markers(CHRONOGRAPH)]) {
      expect(gapToBox(part, date), part.name).toBeGreaterThan(MIN_GAP);
    }
    const corner = Math.hypot(
      Math.abs(date.x) + date.halfWidth,
      Math.abs(date.y) + date.halfHeight
    );
    expect(corner).toBeLessThan(MINUTE_TRACK - MIN_GAP);
  });
});
