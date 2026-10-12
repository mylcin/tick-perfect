import { describe, expect, it } from 'vitest';

import { DIVER_RULES } from './rules/diver.js';
import {
  medianOf,
  normalSource,
  shareAtLeast,
  simulatedScores,
  simulateRound,
} from './simulate.js';

describe('normalSource', () => {
  it('repeats for a seed and centres on 0 with a spread of 1', () => {
    const [a, b] = [normalSource(5), normalSource(5)];
    const values = Array.from({ length: 4000 }, a);
    expect(Array.from({ length: 4000 }, b)).toEqual(values);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length
    );
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(spread).toBeCloseTo(1, 1);
  });
});

describe('simulateRound', () => {
  it('plays the same round for the same seed and steadiness', () => {
    expect(simulateRound(DIVER_RULES, { seed: 2, sigma: 20 })).toEqual(
      simulateRound(DIVER_RULES, { seed: 2, sigma: 20 })
    );
  });

  it('logs a tap per hit, and the one that missed', () => {
    const { hits, log } = simulateRound(DIVER_RULES, { seed: 2, sigma: 30 });
    expect(log.actions).toHaveLength(hits + 1);
    expect(log.start).toBe(1000);
  });

  it('stops a round no player could last', () => {
    const perfect = simulateRound(DIVER_RULES, { seed: 2, sigma: 0 });
    expect(perfect.log.actions).toHaveLength(5000);
  });
});

describe('score summaries', () => {
  it('sorts, takes the middle and the share above a mark', () => {
    const scores = simulatedScores(DIVER_RULES, 30, 21);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(medianOf(scores)).toBe(scores[10]);
    expect(medianOf([])).toBe(0);
    expect(shareAtLeast([1, 2, 3, 4], 3)).toBe(0.5);
    expect(shareAtLeast([], 3)).toBe(0);
  });
});
