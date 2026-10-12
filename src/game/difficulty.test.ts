import { describe, expect, it } from 'vitest';

import { DEFAULT_DIFFICULTY, difficultyAt, rampAt } from './difficulty.js';

const HITS = Array.from({ length: 501 }, (_, hits) => hits);
const at = (hits: number) => difficultyAt(DEFAULT_DIFFICULTY, hits);

describe('rampAt', () => {
  it('rises towards a ceiling, closing its share of the gap every hit', () => {
    const ramp = { start: 0, limit: 8, rate: 0.5 };
    expect([0, 1, 2, 3].map(hits => rampAt(ramp, hits))).toEqual([0, 4, 6, 7]);
  });

  it('falls towards a floor the same way', () => {
    const ramp = { start: 10, limit: 2, rate: 0.5 };
    expect([0, 1, 2, 3].map(hits => rampAt(ramp, hits))).toEqual([10, 6, 4, 3]);
  });

  it('reaches its limit at once with a rate of 1', () => {
    expect(rampAt({ start: 10, limit: 2, rate: 1 }, 1)).toBe(2);
  });

  it('never passes its limit', () => {
    const ramp = { start: 120, limit: 24, rate: 0.06 };
    HITS.forEach(hits => {
      expect(rampAt(ramp, hits)).toBeGreaterThanOrEqual(24);
    });
  });

  it('holds still when it starts at its limit', () => {
    expect(rampAt({ start: 4, limit: 4, rate: 0.3 }, 50)).toBe(4);
  });

  it.each([0, -0.1, 1.5, Number.NaN])('rejects a rate of %d', rate => {
    expect(() => rampAt({ start: 1, limit: 2, rate }, 3)).toThrow(RangeError);
  });
});

describe('difficultyAt', () => {
  it('starts slow and forgiving', () => {
    expect(at(0)).toMatchObject({
      handSpeed: 100,
      hitWindowMs: 120,
      perfectWindowMs: 28,
      specialChance: 0,
    });
  });

  it('keeps changing a little with every hit, with no sudden stop', () => {
    HITS.slice(1, 200).forEach(hits => {
      const [before, after] = [at(hits - 1), at(hits)];
      expect(after.handSpeed).toBeGreaterThan(before.handSpeed);
      expect(after.hitWindowMs).toBeLessThan(before.hitWindowMs);
      // Each hit changes it less than the one before.
      expect(after.handSpeed - before.handSpeed).toBeLessThan(
        before.handSpeed - (hits > 1 ? at(hits - 2).handSpeed : 0)
      );
    });
  });

  it('narrows the hit window past ±50 ms around the 20th hit', () => {
    expect(at(18).hitWindowMs).toBeGreaterThan(50);
    expect(at(24).hitWindowMs).toBeLessThan(50);
  });

  it('never squeezes the windows below what a steady hand can do', () => {
    HITS.forEach(hits => {
      const { hitWindowMs, perfectWindowMs, handSpeed } = at(hits);
      expect(hitWindowMs).toBeGreaterThanOrEqual(24);
      expect(perfectWindowMs).toBeGreaterThanOrEqual(10);
      expect(perfectWindowMs).toBeLessThan(hitWindowMs);
      expect(handSpeed).toBeLessThanOrEqual(360);
    });
  });

  it('keeps the special-rule chance a probability', () => {
    HITS.forEach(hits => {
      const { specialChance } = at(hits);
      expect(specialChance).toBeGreaterThanOrEqual(0);
      expect(specialChance).toBeLessThanOrEqual(1);
    });
  });

  it('keeps a moving ring well below the hand speed', () => {
    HITS.forEach(hits => {
      const { ringSpeed, handSpeed } = at(hits);
      expect(ringSpeed).toBeGreaterThanOrEqual(0);
      expect(ringSpeed).toBeLessThanOrEqual(handSpeed / 2);
    });
  });

  it.each([-1, 1.5, Number.NaN])('rejects %d hits', hits => {
    expect(() => at(hits)).toThrow(RangeError);
  });
});
