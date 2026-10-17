import { describe, expect, it } from 'vitest';

import { VARIANTS, WATCH_ORDER } from '../watches';
import { collectionSummary, masteryOf } from './atelier';
import { INITIAL_PROGRESS, type Progress } from './progress';

const progress = (best: Record<string, number>, unlocked: string[]) =>
  ({ best, unlocked, points: 0 }) as Progress;

describe('masteryOf', () => {
  it('starts a watch with everything still to do', () => {
    const mastery = masteryOf('diver', INITIAL_PROGRESS, {});
    expect(mastery.best).toBe(0);
    expect(mastery.certificates.map(goal => [goal.tier, goal.done])).toEqual([
      ['adjusted', false],
      ['chronometer', false],
      ['observatory', false],
    ]);
    expect(mastery.variants).toHaveLength(VARIANTS.diver.length - 1);
    expect(mastery.engravings.map(goal => goal.id)).toEqual([
      'isochronism',
      'beatError',
    ]);
    expect(mastery.done).toBe(0);
    expect(mastery.of).toBe(3 + VARIANTS.diver.length - 1 + 2);
  });

  it('counts the certificates, variants and engravings a best has earned', () => {
    const mastery = masteryOf('diver', progress({ diver: 41 }, ['diver']), {
      'beatError:diver': 4,
      'beatError:gmt': 5,
    });
    expect(mastery.certificates.map(goal => goal.done)).toEqual([
      true,
      true,
      false,
    ]);
    expect(mastery.variants.map(goal => [goal.tier, goal.done])).toEqual([
      ['chronometer', true],
      ['observatory', false],
    ]);
    expect(mastery.engravings.map(goal => goal.done)).toEqual([false, true]);
    expect(mastery.done).toBe(4);
  });
});

describe('collectionSummary', () => {
  it('has the first watch open and nothing else done at first', () => {
    const summary = collectionSummary(INITIAL_PROGRESS, {});
    expect(summary.watches).toEqual({ done: 1, of: WATCH_ORDER.length });
    expect(summary.certificates).toEqual({
      done: 0,
      of: 3 * WATCH_ORDER.length,
    });
    expect(summary.achievements).toEqual({
      done: 0,
      of: 2 * WATCH_ORDER.length + 3,
    });
    expect(summary.share).toBeGreaterThan(0);
    expect(summary.share).toBeLessThan(0.05);
  });

  it('adds up every watch, and the collection’s own achievements', () => {
    const everyBest = Object.fromEntries(WATCH_ORDER.map(watch => [watch, 99]));
    const engravings: Record<string, number> = {
      positionalTest: 1,
      powerReserve: 1,
      escapement: 1,
    };
    for (const watch of WATCH_ORDER) {
      engravings[`isochronism:${watch}`] = 1;
      engravings[`beatError:${watch}`] = 1;
    }
    const summary = collectionSummary(
      progress(everyBest, [...WATCH_ORDER]),
      engravings
    );
    expect(summary.share).toBe(1);
    expect(summary.variants.done).toBe(summary.variants.of);
  });
});
