import { describe, expect, it } from 'vitest';

import { nearMiss } from './near-miss.js';
import { DIVER_RULES } from './rules/diver.js';
import { INITIAL_STATE, update, type GameState } from './state.js';
import { centerTime, closingSpeed, type Segment } from './timing.js';

function missedBy(degrees: number): GameState {
  const playing = update(
    INITIAL_STATE,
    { type: 'start', time: 1000, seed: 3 },
    DIVER_RULES
  ).state;
  if (playing.phase !== 'playing') throw new Error();
  const segment: Segment = playing.round.segment;
  const offset = degrees + Math.sign(degrees) * segment.target.hitWindow;
  const time = centerTime(segment) + (offset / closingSpeed(segment)) * 1000;
  return update(playing, { type: 'tap', time }, DIVER_RULES).state;
}

describe('nearMiss', () => {
  it('measures an early tap from the window’s near edge', () => {
    const state = missedBy(-4);
    if (state.phase !== 'gameOver') throw new Error();
    const miss = nearMiss(state);
    expect(miss?.side).toBe('early');
    expect(miss?.degrees).toBeCloseTo(4, 6);
    expect(miss?.ms).toBeCloseTo((4 / 100) * 1000, 4);
  });

  it('measures a late tap from the far edge', () => {
    const state = missedBy(2);
    if (state.phase !== 'gameOver') throw new Error();
    expect(nearMiss(state)).toMatchObject({ side: 'late' });
    expect(nearMiss(state)?.degrees).toBeCloseTo(2, 6);
  });

  it('has nothing to say about a hand that ran past', () => {
    const playing = update(
      INITIAL_STATE,
      { type: 'start', time: 1000, seed: 3 },
      DIVER_RULES
    ).state;
    const over = update(
      playing,
      { type: 'tick', time: 60_000 },
      DIVER_RULES
    ).state;
    if (over.phase !== 'gameOver') throw new Error();
    expect(nearMiss(over)).toBeNull();
  });
});
