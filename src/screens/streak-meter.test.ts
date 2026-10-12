import { describe, expect, it } from 'vitest';

import { DIVER_RULES } from '../game';
import { streakMeter } from './streak-meter';

const meter = (streak: number) => streakMeter(streak, DIVER_RULES);

describe('streakMeter', () => {
  it('counts the first three Perfects towards ×2', () => {
    expect(meter(0)).toEqual({ filled: 0, needed: 3, next: 2 });
    expect(meter(2)).toEqual({ filled: 2, needed: 3, next: 2 });
  });

  it('starts again from ×2 towards ×3', () => {
    expect(meter(3)).toEqual({ filled: 0, needed: 5, next: 3 });
    expect(meter(7)).toEqual({ filled: 4, needed: 5, next: 3 });
  });

  it('stays full once the top multiplier is on', () => {
    expect(meter(8)).toEqual({ filled: 5, needed: 5, next: null });
    expect(meter(40)).toEqual({ filled: 5, needed: 5, next: null });
  });

  it('fills a single tier outright', () => {
    const rules = {
      ...DIVER_RULES,
      scoring: {
        ...DIVER_RULES.scoring,
        multipliers: [{ streak: 3, factor: 2 }],
      },
    } as const;
    expect(streakMeter(5, rules)).toEqual({ filled: 3, needed: 3, next: null });
  });
});
