import { describe, expect, it } from 'vitest';

import { memoryStorage } from '../utils/safe-storage';
import {
  drawnTier,
  lowerTier,
  MAX_TIER_CHANGES,
  pixelRatio,
  QUALITY_KEY,
  QUALITY_TIERS,
  raiseTier,
  rememberedTierState,
  rememberTier,
  START_TIER,
  START_TIER_STATE,
  stepTier,
  tierAt,
  tierBounds,
  type TierState,
} from './quality';

describe('quality tiers', () => {
  it('starts at the richest tier and goes from cheap to rich', () => {
    expect(tierAt(START_TIER).name).toBe('high');
    expect(QUALITY_TIERS.map(tier => tier.name)).toEqual([
      'low',
      'balanced',
      'medium',
      'high',
    ]);
    const dprs = QUALITY_TIERS.map(tier => tier.maxDpr);
    expect([...dprs].sort((a, b) => a - b)).toEqual(dprs);
  });

  it('never renders above a device pixel ratio of 2', () => {
    for (const tier of QUALITY_TIERS) {
      expect(pixelRatio(tier, 3)).toBeLessThanOrEqual(2);
      expect(tier.maxDpr).toBeLessThanOrEqual(2);
    }
  });

  it('uses the device ratio when it is below the cap, but never below 1', () => {
    const high = tierAt(START_TIER);
    expect(pixelRatio(high, 1.5)).toBe(1.5);
    expect(pixelRatio(high, 0.5)).toBe(1);
  });

  it('drops bloom on the lowest tier', () => {
    expect(tierAt(0).bloom).toBe(false);
  });

  it('steps down and up without leaving the list', () => {
    expect(lowerTier(2)).toBe(1);
    expect(lowerTier(0)).toBe(0);
    expect(raiseTier(1)).toBe(2);
    expect(raiseTier(START_TIER)).toBe(START_TIER);
  });

  it('never gets cheaper going up a tier', () => {
    QUALITY_TIERS.slice(1).forEach((tier, index) => {
      const below = tierAt(index);
      expect(tier.maxDpr).toBeGreaterThan(below.maxDpr);
      expect(tier.multisampling).toBeGreaterThanOrEqual(below.multisampling);
    });
  });

  it('steps down from 40-50 fps on a 60 Hz screen', () => {
    // A 60 Hz screen measures a little above 60 in drei's windows.
    const [lower, upper] = tierBounds(64);
    expect(lower).toBeGreaterThan(50);
    expect(lower).toBeLessThan(upper);
    expect(upper).toBeLessThanOrEqual(60);
  });

  it('scales the bounds with a faster screen', () => {
    const [lower, upper] = tierBounds(120);
    expect(lower).toBe(90);
    expect(upper).toBe(114);
  });

  it('rejects an unknown tier', () => {
    expect(() => tierAt(7)).toThrow(RangeError);
  });
});

describe('stepTier', () => {
  it('ignores steps past the top and bottom without counting them', () => {
    // A smooth 60 Hz screen keeps asking to go up from the top tier.
    let state: TierState = START_TIER_STATE;
    for (let index = 0; index < 50; index++) state = stepTier(state, 'up');
    expect(state).toBe(START_TIER_STATE);

    let bottom: TierState = { index: 0, changes: 1 };
    bottom = stepTier(bottom, 'down');
    expect(bottom).toEqual({ index: 0, changes: 1 });
  });

  it('steps down one tier at a time', () => {
    const once = stepTier(START_TIER_STATE, 'down');
    expect(once).toEqual({ index: START_TIER - 1, changes: 1 });
    expect(stepTier(once, 'down')).toEqual({
      index: START_TIER - 2,
      changes: 2,
    });
  });

  it('settles after a few real changes', () => {
    let state: TierState = START_TIER_STATE;
    for (let index = 0; index < 20; index++) {
      state = stepTier(state, index % 2 === 0 ? 'down' : 'up');
    }
    expect(state.changes).toBe(MAX_TIER_CHANGES);
    const settled = state;
    expect(stepTier(settled, 'down')).toBe(settled);
    expect(stepTier(settled, 'up')).toBe(settled);
  });
});

describe('remembered tier', () => {
  it('starts a first visit at the richest tier', () => {
    expect(rememberedTierState(memoryStorage())).toBe(START_TIER_STATE);
  });

  it('starts the next visit where this device settled, free to step up', () => {
    const storage = memoryStorage();
    rememberTier(storage, 1);
    expect(storage.items.get(QUALITY_KEY)).toBe('balanced');
    const state = rememberedTierState(storage);
    expect(state).toEqual({ index: 1, changes: 0 });
    expect(stepTier(state, 'up')).toEqual({ index: 2, changes: 1 });
  });

  it.each(['ultra', '', '0', 'Low', '{"index":0}'])(
    'starts at the richest tier for the unknown tier %j',
    saved => {
      const storage = memoryStorage({ [QUALITY_KEY]: saved });
      expect(rememberedTierState(storage)).toBe(START_TIER_STATE);
    }
  );
});

describe('drawnTier', () => {
  it('draws the tier the frame rate led to', () => {
    expect(drawnTier({ index: 2, changes: 1 }, false)).toBe(tierAt(2));
  });

  it('draws the cheapest tier, without bloom, to save battery', () => {
    const saver = drawnTier(START_TIER_STATE, true);
    expect(saver).toBe(tierAt(0));
    expect(saver.bloom).toBe(false);
    expect(saver.maxDpr).toBe(1);
  });
});
