import { describe, expect, it } from 'vitest';

import { FIRST_SERIES } from '../watches/ids';
import { pointsFor } from './levels';
import {
  bestScore,
  INITIAL_PROGRESS,
  isUnlocked,
  mergeProgress,
  recordScore,
  requirementFor,
  requirementMet,
  withEarnedUnlocks,
  type Progress,
} from './progress';

const NOTHING_NEW = {
  unlocked: [],
  certificate: null,
  levelUp: null,
} as const;

/** Progress with `points` already earned, as a player well on their way. */
const withPoints = (points: number): Progress => ({
  ...INITIAL_PROGRESS,
  points,
});

describe('recordScore', () => {
  it('keeps the first score as the best, and adds it to the points', () => {
    const { progress, record } = recordScore(INITIAL_PROGRESS, 'diver', 12);
    expect(bestScore(progress, 'diver')).toBe(12);
    expect(progress.points).toBe(12);
    expect(record).toEqual({
      score: 12,
      best: 12,
      isNewBest: true,
      points: 12,
      ...NOTHING_NEW,
    });
  });

  it('raises the best only when beaten, and adds every score up', () => {
    const first = recordScore(INITIAL_PROGRESS, 'diver', 12).progress;

    const lower = recordScore(first, 'diver', 7);
    expect(lower.progress).toEqual({ ...first, points: 19 });
    expect(lower.record).toEqual({
      score: 7,
      best: 12,
      isNewBest: false,
      points: 19,
      ...NOTHING_NEW,
    });

    const equal = recordScore(first, 'diver', 12);
    expect(equal.record.isNewBest).toBe(false);

    const higher = recordScore(first, 'diver', 14);
    expect(bestScore(higher.progress, 'diver')).toBe(14);
    expect(higher.record.isNewBest).toBe(true);
    expect(higher.progress.points).toBe(26);
  });

  it('changes nothing for a zero on a fresh watch', () => {
    const { progress, record } = recordScore(INITIAL_PROGRESS, 'diver', 0);
    expect(progress).toBe(INITIAL_PROGRESS);
    expect(record).toEqual({
      score: 0,
      best: 0,
      isNewBest: false,
      points: 0,
      ...NOTHING_NEW,
    });
  });

  it('needs level 2 as well as 15 on the Diver to open the Chronograph', () => {
    const early = recordScore(INITIAL_PROGRESS, 'diver', 15);
    expect(early.record.unlocked).toEqual([]);
    expect(early.record.certificate).toBe('adjusted');

    const { progress, record } = recordScore(withPoints(140), 'diver', 15);
    expect(progress.unlocked).toEqual(['diver', 'chronograph']);
    expect(record.unlocked).toEqual(['chronograph']);
    expect(record.levelUp).toBe(2);
  });

  it('opens the next watch with the round that reaches its level', () => {
    const adjusted = recordScore(withPoints(100), 'diver', 20).progress;
    expect(isUnlocked(adjusted, 'chronograph')).toBe(false);
    // A poor round still counts: its points reach level 2.
    const { record } = recordScore(adjusted, 'diver', 30);
    expect(record).toMatchObject({ unlocked: ['chronograph'], levelUp: 2 });
  });

  it('never opens a watch on its level alone', () => {
    const { record } = recordScore(withPoints(5000), 'diver', 14);
    expect(record.unlocked).toEqual([]);
    expect(record.levelUp).toBeNull();
  });

  it('reports only certificates that are new', () => {
    const adjusted = recordScore(INITIAL_PROGRESS, 'diver', 20).progress;
    expect(recordScore(adjusted, 'diver', 35).record.certificate).toBeNull();
    expect(recordScore(adjusted, 'diver', 40).record.certificate).toBe(
      'chronometer'
    );
    // Straight past two tiers: the higher one is the one reported.
    expect(recordScore(adjusted, 'diver', 80).record.certificate).toBe(
      'observatory'
    );
  });

  it('never unlocks a watch from a locked one’s score', () => {
    // A save that somehow has a GMT score without the GMT unlocked.
    const { record } = recordScore(withPoints(5000), 'gmt', 40);
    expect(record.unlocked).toEqual([]);
  });

  it('opens Endless last, after 15 on the Tourbillon', () => {
    let progress = withPoints(5000);
    const opened: string[] = [];
    for (const watch of [
      'diver',
      'chronograph',
      'gmt',
      'moonphase',
      'tourbillon',
    ] as const) {
      const result = recordScore(progress, watch, 15);
      progress = result.progress;
      opened.push(...result.record.unlocked);
    }
    expect(opened).toEqual([
      'chronograph',
      'gmt',
      'moonphase',
      'tourbillon',
      'grandComplication',
    ]);
    // The second series waits for a score on Endless.
    expect(progress.unlocked).toEqual(FIRST_SERIES);
  });

  it('opens the Field after 15 on Endless, at level 7', () => {
    const endless = withEarnedUnlocks({
      best: {
        diver: 15,
        chronograph: 15,
        gmt: 15,
        moonphase: 15,
        tourbillon: 15,
      },
      unlocked: [],
      points: pointsFor(7) - 20,
    });
    expect(endless.unlocked).toEqual(FIRST_SERIES);
    // The score is there before the level is.
    const early = recordScore(endless, 'grandComplication', 15);
    expect(early.record.unlocked).toEqual([]);
    const { record, progress } = recordScore(
      early.progress,
      'grandComplication',
      10
    );
    expect(record.unlocked).toEqual(['field']);
    expect(progress.unlocked).toEqual([...FIRST_SERIES, 'field']);
    expect(requirementFor('field')).toMatchObject({
      watch: 'grandComplication',
      level: 7,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the score %s',
    score => {
      expect(() => recordScore(INITIAL_PROGRESS, 'diver', score)).toThrow(
        RangeError
      );
    }
  );
});

describe('requirementFor', () => {
  it('chains the watches, each a level further on', () => {
    expect(requirementFor('diver')).toBeNull();
    expect(requirementFor('chronograph')).toEqual({
      watch: 'diver',
      score: 15,
      level: 2,
      points: 150,
    });
    expect(requirementFor('tourbillon')).toEqual({
      watch: 'moonphase',
      score: 15,
      level: 5,
      points: 1400,
    });
    expect(requirementFor('grandComplication')).toEqual({
      watch: 'tourbillon',
      score: 15,
      level: 6,
      points: 2200,
    });
  });

  it('says which part a player has met', () => {
    const requirement = requirementFor('chronograph');
    if (!requirement) throw new Error('The Chronograph has a requirement');
    expect(
      requirementMet({ ...withPoints(160), best: { diver: 9 } }, requirement)
    ).toEqual({ score: false, level: true });
    expect(
      requirementMet({ ...withPoints(90), best: { diver: 15 } }, requirement)
    ).toEqual({ score: true, level: false });
  });
});

describe('withEarnedUnlocks', () => {
  it('catches up on every watch a saved best has earned', () => {
    const repaired = withEarnedUnlocks({
      best: { diver: 20, chronograph: 18, gmt: 30 },
      unlocked: ['diver'],
      points: 500,
    });
    // The Moonphase waits for level 4.
    expect(repaired.unlocked).toEqual(['diver', 'chronograph', 'gmt']);
  });

  it('returns the same progress when nothing changes', () => {
    expect(withEarnedUnlocks(INITIAL_PROGRESS)).toBe(INITIAL_PROGRESS);
  });

  it('keeps watches this version doesn’t know', () => {
    const progress = withEarnedUnlocks({
      best: {},
      unlocked: ['worldtimer', 'diver'],
      points: 0,
    });
    expect(progress.unlocked).toEqual(['diver', 'worldtimer']);
    expect(isUnlocked(progress, 'chronograph')).toBe(false);
  });
});

describe('mergeProgress', () => {
  it('keeps the higher best, every unlocked watch and the more points', () => {
    expect(
      mergeProgress(
        { best: { diver: 12 }, unlocked: ['diver'], points: 400 },
        { best: { diver: 30 }, unlocked: ['diver', 'chronograph'], points: 90 }
      )
    ).toEqual({
      best: { diver: 30 },
      unlocked: ['diver', 'chronograph'],
      points: 400,
    });
    expect(
      mergeProgress(
        { best: { diver: 30 }, unlocked: ['diver'], points: 30 },
        INITIAL_PROGRESS
      ).best
    ).toEqual({ diver: 30 });
  });

  it('records nothing for watches neither side has played', () => {
    expect(mergeProgress(INITIAL_PROGRESS, INITIAL_PROGRESS)).toEqual(
      INITIAL_PROGRESS
    );
  });

  it('keeps bests and unlocks for watches it doesn’t know', () => {
    expect(
      mergeProgress(
        { best: { diver: 3 }, unlocked: ['diver'], points: 3 },
        { best: { worldtimer: 9 }, unlocked: ['worldtimer'], points: 9 }
      )
    ).toEqual({
      best: { diver: 3, worldtimer: 9 },
      unlocked: ['diver', 'worldtimer'],
      points: 9,
    });
  });
});
