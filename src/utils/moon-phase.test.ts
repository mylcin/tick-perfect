import { describe, expect, it } from 'vitest';

import { moonPhase, SYNODIC_MONTH } from './moon-phase';

const MS_PER_DAY = 86_400_000;

describe('moonPhase', () => {
  it('is new at the epoch and a cycle later', () => {
    const epoch = Date.UTC(2000, 0, 6, 18, 14);
    expect(moonPhase(epoch)).toBeCloseTo(0, 9);
    // A whole cycle on, it is new again (just either side of 0).
    const later = moonPhase(epoch + SYNODIC_MONTH * MS_PER_DAY);
    expect(Math.min(later, 1 - later)).toBeCloseTo(0, 6);
  });

  it('matches known full moons', () => {
    // 17 October 2024, 11:26 UTC, and 12 December 2027, 16:09 UTC.
    expect(moonPhase(Date.UTC(2024, 9, 17, 11, 26))).toBeCloseTo(0.5, 1);
    expect(moonPhase(Date.UTC(2027, 11, 12, 16, 9))).toBeCloseTo(0.5, 1);
  });

  it('stays in [0, 1) before the epoch too', () => {
    const phase = moonPhase(Date.UTC(1969, 6, 20));
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
  });
});
