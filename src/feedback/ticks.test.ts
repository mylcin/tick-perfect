import { describe, expect, it } from 'vitest';

import {
  CLOCKWISE,
  COUNTERCLOCKWISE,
  DIVER_RULES,
  INITIAL_STATE,
  update,
  type Segment,
} from '../game';
import { TICK_STEP, tickIndex } from './ticks';

function firstSegment(): Segment {
  const { state } = update(
    INITIAL_STATE,
    { type: 'start', time: 0, seed: 3 },
    DIVER_RULES
  );
  if (state.phase !== 'playing') throw new Error('not playing');
  return state.round.segment;
}

/** Ticks heard over [from, to] when sampled every `step` ms. */
function ticksBetween(segment: Segment, from: number, to: number, step = 16) {
  let ticks = 0;
  let last = tickIndex(segment, from);
  for (let time = from + step; time <= to; time += step) {
    const index = tickIndex(segment, time);
    if (index !== last) ticks += 1;
    last = index;
  }
  return ticks;
}

describe('tickIndex', () => {
  it('ticks once per hour mark the hand passes', () => {
    const segment = {
      ...firstSegment(),
      handAngle: 0,
      direction: CLOCKWISE,
      speed: 120,
    };
    // 120°/s for 1 s crosses the marks at 30°, 60°, 90° and 120°.
    expect(ticksBetween(segment, 0, 1000, 1)).toBe(120 / TICK_STEP);
  });

  it('ticks just the same going backwards', () => {
    const segment = {
      ...firstSegment(),
      handAngle: 15,
      direction: COUNTERCLOCKWISE,
      speed: 90,
    };
    // From 15° back to -75°: past 0°, -30° and -60°.
    expect(ticksBetween(segment, 0, 1000, 1)).toBe(3);
  });

  it('ticks faster as the hand speeds up', () => {
    const slow = { ...firstSegment(), speed: 110 };
    const fast = { ...slow, speed: 340 };
    expect(ticksBetween(fast, 0, 2000)).toBeGreaterThan(
      ticksBetween(slow, 0, 2000) * 2
    );
  });
});
