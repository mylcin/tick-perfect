import { describe, expect, it } from 'vitest';

import {
  CAMERA_FAR,
  CAMERA_NEAR,
  fitInBox,
  framingFor,
  FULL_SCREEN,
  SHORT_HEIGHT,
  type Box,
} from './camera';
import { DEG_TO_RAD } from './layout';

const FOV = 26;
const halfHeightAt = (distance: number) =>
  Math.tan((FOV / 2) * DEG_TO_RAD) * distance;

/** Where a world point lands on screen, as fractions from the top left. */
function toScreen(
  [x, y]: [number, number],
  distance: number,
  aspect: number
): [number, number] {
  const half = halfHeightAt(distance);
  return [(1 + x / (half * aspect)) / 2, (1 - y / half) / 2];
}

/** Checks the circle lies inside the box (and touches it on one axis). */
function expectInside(box: Box, aspect: number, radius: number) {
  const { distance, x, y } = fitInBox({ fov: FOV, aspect, radius, box });
  const [left, top] = toScreen([x - radius, y + radius], distance, aspect);
  const [right, bottom] = toScreen([x + radius, y - radius], distance, aspect);
  const slack = 1e-9;
  expect(left).toBeGreaterThanOrEqual(box.left - slack);
  expect(right).toBeLessThanOrEqual(box.right + slack);
  expect(top).toBeGreaterThanOrEqual(box.top - slack);
  expect(bottom).toBeLessThanOrEqual(box.bottom + slack);
  const touches =
    Math.abs(right - left - (box.right - box.left)) < 1e-6 ||
    Math.abs(bottom - top - (box.bottom - box.top)) < 1e-6;
  expect(touches).toBe(true);
  const [centreX, centreY] = toScreen([x, y], distance, aspect);
  expect(centreX).toBeCloseTo((box.left + box.right) / 2, 9);
  expect(centreY).toBeCloseTo((box.top + box.bottom) / 2, 9);
}

describe('fitInBox', () => {
  it.each([
    ['portrait phone', 390 / 844],
    ['square', 1],
    ['landscape', 16 / 9],
  ])('fits the whole screen on a %s screen', (_, aspect) => {
    const { distance, x, y } = fitInBox({
      fov: FOV,
      aspect,
      radius: 1.85,
      box: FULL_SCREEN,
    });
    const half = halfHeightAt(distance);
    expect(Math.min(half, half * aspect)).toBeCloseTo(1.85, 9);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it('stands further back on narrower screens', () => {
    const at = (aspect: number) =>
      fitInBox({ fov: FOV, aspect, radius: 1, box: FULL_SCREEN }).distance;
    expect(at(0.46)).toBeGreaterThan(at(1.8));
    // Once wider than tall, the height decides.
    expect(at(2.5)).toBeCloseTo(at(1), 12);
  });

  it.each([
    [
      'a band at the top of a phone',
      { top: 0.05, bottom: 0.6, left: 0, right: 1 },
      390 / 844,
    ],
    [
      'a band at the top of a laptop',
      { top: 0.05, bottom: 0.6, left: 0, right: 1 },
      16 / 10,
    ],
    [
      'the left of a laptop',
      { top: 0.06, bottom: 0.94, left: 0, right: 0.55 },
      16 / 10,
    ],
    [
      'the left of a phone held sideways',
      { top: 0.06, bottom: 0.94, left: 0, right: 0.55 },
      844 / 390,
    ],
  ])('keeps the circle inside %s', (_, box, aspect) => {
    expectInside(box, aspect, 1.7);
  });
});

describe('framingFor', () => {
  const PHONE = { width: 390, height: 844 };
  const LAPTOP = { width: 1440, height: 900 };
  const SIDEWAYS = { width: 844, height: 390 };

  it('raises the watch above the results on tall screens', () => {
    const { box } = framingFor('result', PHONE);
    expect(box.bottom).toBeLessThan(0.6);
    expect(box.right).toBe(1);
  });

  it('raises it further on a small phone, where the results are compact', () => {
    const small = framingFor('result', { width: 320, height: 568 }).box;
    expect(small.bottom).toBeLessThan(framingFor('result', PHONE).box.bottom);
  });

  it('moves the watch beside the results on wide screens', () => {
    for (const viewport of [LAPTOP, SIDEWAYS]) {
      const { box } = framingFor('result', viewport);
      expect(box.right).toBeLessThan(0.6);
      expect(box.bottom - box.top).toBeGreaterThan(0.8);
    }
  });

  it('ends the watch where the text under it starts, upright', () => {
    for (const mode of ['showcase', 'result'] as const) {
      const free = framingFor(mode, PHONE).box;
      expect(framingFor(mode, PHONE, 0.42).box).toEqual({
        ...free,
        bottom: 0.42,
      });
      // Text lower down than the usual box changes nothing.
      expect(framingFor(mode, PHONE, 0.9).box).toEqual(free);
      // However tall the text, the watch keeps some of the screen.
      const squeezed = framingFor(mode, PHONE, 0.05).box;
      expect(squeezed.bottom - squeezed.top).toBeCloseTo(0.14, 9);
    }
  });

  it('keeps the watch whole above the text on the smallest phone', () => {
    const SMALL = { width: 320, height: 568 };
    // Where a challenge card and the unlock results start there.
    expect(framingFor('showcase', SMALL, 0.243).box.bottom).toBe(0.243);
    expect(framingFor('result', SMALL, 0.231).box.bottom).toBe(0.231);
    // However far back that puts the camera, the watch stays in its range.
    for (const mode of ['showcase', 'result'] as const) {
      const { box, radius } = framingFor(mode, SMALL, 0);
      const { distance } = fitInBox({
        fov: FOV,
        aspect: SMALL.width / SMALL.height,
        radius,
        box,
      });
      expect(distance - radius).toBeGreaterThan(CAMERA_NEAR);
      expect(distance + radius).toBeLessThan(CAMERA_FAR);
    }
  });

  it('frames beside the text on wide screens, wherever it starts', () => {
    for (const mode of ['showcase', 'result', 'play'] as const) {
      expect(framingFor(mode, LAPTOP, 0.2)).toEqual(framingFor(mode, LAPTOP));
    }
    expect(framingFor('play', PHONE, 0.2)).toEqual(framingFor('play', PHONE));
  });

  it('gives the watch the full height in play on a phone held sideways', () => {
    expect(SIDEWAYS.height).toBeLessThan(SHORT_HEIGHT);
    const sideways = framingFor('play', SIDEWAYS).box;
    const laptop = framingFor('play', LAPTOP).box;
    expect(sideways.bottom - sideways.top).toBeGreaterThan(
      laptop.bottom - laptop.top
    );
  });
});
