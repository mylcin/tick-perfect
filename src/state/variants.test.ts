import { describe, expect, it } from 'vitest';

import { VARIANTS, variantOf, WATCHES, withVariant } from '../watches';
import { INITIAL_PROGRESS, type Progress } from './progress';
import {
  isVariantEarned,
  newlyEarnedVariants,
  shownSpec,
  shownVariant,
  variantScore,
} from './variants';

function diverVariant(id: string) {
  const variant = variantOf('diver', id);
  if (!variant) throw new Error(`No Diver variant ${id}`);
  return variant;
}
const standard = diverVariant('standard');
const greenVariant = diverVariant('green');
const blue = diverVariant('blue');

function onDiver(best: number): Progress {
  return {
    best: { diver: best },
    unlocked: ['diver', 'chronograph'],
    points: 150 + best,
  };
}

describe('variants', () => {
  it('are earned by their certificate’s score on that watch', () => {
    expect(variantScore(standard)).toBe(0);
    expect(variantScore(greenVariant)).toBe(40);
    expect(variantScore(blue)).toBe(75);
    for (const [best, green, blued] of [
      [0, false, false],
      [39, false, false],
      [40, true, false],
      [75, true, true],
    ] as const) {
      const progress = onDiver(best);
      expect(isVariantEarned(progress, 'diver', standard)).toBe(true);
      expect(isVariantEarned(progress, 'diver', greenVariant)).toBe(green);
      expect(isVariantEarned(progress, 'diver', blue)).toBe(blued);
    }
  });

  it('are never earned on a locked watch', () => {
    const progress = {
      best: { chronograph: 60 },
      unlocked: ['diver'],
      points: 60,
    };
    for (const variant of VARIANTS.chronograph.slice(1)) {
      expect(isVariantEarned(progress, 'chronograph', variant)).toBe(false);
    }
  });

  it('wear the pick while it is earned, the standard otherwise', () => {
    const choices = { diver: 'blue', gmt: 'unknownVariant' };
    expect(shownVariant(onDiver(80), choices, 'diver').id).toBe('blue');
    expect(shownVariant(onDiver(50), choices, 'diver').id).toBe('standard');
    expect(shownVariant(INITIAL_PROGRESS, choices, 'gmt').id).toBe('standard');
    expect(shownVariant(onDiver(80), {}, 'diver').id).toBe('standard');
    expect(shownSpec(onDiver(80), choices, 'diver')).toBe(
      withVariant(WATCHES.diver, 'blue')
    );
    expect(shownSpec(onDiver(50), choices, 'diver')).toBe(WATCHES.diver);
  });

  it('report what a round newly earned, both at once on a big jump', () => {
    expect(
      newlyEarnedVariants(onDiver(10), onDiver(41), 'diver').map(v => v.id)
    ).toEqual(['green']);
    expect(
      newlyEarnedVariants(onDiver(0), onDiver(77), 'diver').map(v => v.id)
    ).toEqual(['green', 'blue']);
    expect(newlyEarnedVariants(onDiver(41), onDiver(60), 'diver')).toEqual([]);
  });
});
