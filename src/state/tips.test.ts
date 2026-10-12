import { describe, expect, it } from 'vitest';

import { DEFAULT_SCORING, type GameEvent, type HitQuality } from '../game';
import { mergeTips, restoreTips, tipFor, trailingPerfects } from './tips';

const hit = (
  quality: HitQuality,
  streak: number
): Extract<GameEvent, { type: 'hit' }> => ({
  type: 'hit',
  time: 0,
  quality,
  offset: 0,
  ms: 0,
  leg: 'single',
  points: quality === 'perfect' ? 2 : 1,
  score: 10,
  streak,
});
const multiplier = (factor: number): GameEvent => ({
  type: 'multiplier',
  time: 0,
  factor,
});

/** The tip a hit calls for, `seen` already shown. */
const tip = (
  events: readonly GameEvent[],
  streakBefore: number,
  seen: readonly string[] = []
) => tipFor(events, streakBefore, seen, DEFAULT_SCORING);

describe('tipFor', () => {
  it('explains the bright core at the first Perfect', () => {
    expect(tip([hit('perfect', 1)], 0)).toBe('perfect');
    expect(tip([hit('perfect', 1)], 0, ['perfect'])).not.toBe('perfect');
  });

  it('explains the multiplier at a later Perfect on the way to it', () => {
    expect(tip([hit('perfect', 2)], 1, ['perfect'])).toBe('streak');
    expect(tip([hit('perfect', 1)], 0, ['perfect'])).toBe('streak');
    // Not before the core has been explained, and only once.
    expect(tip([hit('perfect', 2)], 1)).toBe('perfect');
    expect(tip([hit('perfect', 2)], 1, ['perfect', 'streak'])).toBeNull();
  });

  it('says how long the multiplier lasts as it first switches on', () => {
    const on = [hit('perfect', 3), multiplier(2)];
    expect(tip(on, 2, ['perfect', 'streak'])).toBe('multiplier');
    // Before anything else still to say.
    expect(tip(on, 2)).toBe('multiplier');
    expect(tip(on, 2, ['multiplier'])).toBe('perfect');
  });

  it('names only the first multiplier, so waits for it', () => {
    // On the way to ×3, a Perfect isn't how ×2 is earned.
    expect(tip([hit('perfect', 5)], 4, ['perfect'])).toBeNull();
    // The tip names ×2; ×3 switching on waits for a run that earns ×2.
    expect(tip([hit('perfect', 8), multiplier(3)], 7, ['perfect'])).toBeNull();
  });

  it('says a plain hit ends a streak, once streaks have been explained', () => {
    const plain = [hit('good', 0)];
    expect(tip(plain, 2, ['perfect', 'streak'])).toBe('streakBroken');
    expect(
      tip([...plain, multiplier(1)], 5, ['perfect', 'streak', 'multiplier'])
    ).toBe('streakBroken');
    expect(tip(plain, 2, ['perfect'])).toBeNull();
    // No streak, nothing broken.
    expect(tip(plain, 0, ['perfect', 'streak'])).toBeNull();
    expect(tip(plain, 2, ['perfect', 'streak', 'streakBroken'])).toBeNull();
  });

  it('stays quiet for everything else', () => {
    expect(tip([], 0)).toBeNull();
    expect(tip([{ type: 'started', time: 0 }], 0)).toBeNull();
    expect(
      tip([{ type: 'miss', time: 0, reason: 'late', offset: 9, score: 4 }], 3)
    ).toBeNull();
  });
});

describe('trailingPerfects', () => {
  it('counts the Perfects at the end of a run', () => {
    expect(trailingPerfects([])).toBe(0);
    expect(trailingPerfects(['good'])).toBe(0);
    expect(trailingPerfects(['perfect', 'good', 'perfect', 'perfect'])).toBe(2);
    expect(trailingPerfects(['perfect', 'perfect', 'perfect'])).toBe(3);
  });
});

describe('restoreTips and mergeTips', () => {
  it('keeps every tip seen in either, each once', () => {
    expect(mergeTips(['perfect'], ['streak', 'perfect'])).toEqual([
      'perfect',
      'streak',
    ]);
    const seen = ['perfect', 'streak'];
    expect(mergeTips(seen, ['streak'])).toBe(seen);
    expect(mergeTips([], [])).toEqual([]);
  });

  it('reads saved tips field by field', () => {
    expect(restoreTips(['perfect', 'homeScreen'])).toEqual([
      'perfect',
      'homeScreen',
    ]);
    expect(restoreTips(undefined)).toEqual([]);
    expect(restoreTips(['perfect', 3, 'two words'])).toEqual(['perfect']);
  });
});
