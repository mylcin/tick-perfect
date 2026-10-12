import { describe, expect, it } from 'vitest';

import type { GameEvent } from '../game';
import { milestoneOf, passesMilestone, type Standing } from './milestones';

const best = (score: number): Standing => ({ kind: 'best', score });

describe('milestoneOf', () => {
  it('marks the hit that passes the best, and no other', () => {
    expect(milestoneOf(19, 21, best(20))).toEqual({ kind: 'standing' });
    expect(milestoneOf(20, 21, best(20))).toEqual({ kind: 'standing' });
    // Equalling it isn't passing it, and past it is old news.
    expect(milestoneOf(18, 20, best(20))).toBeNull();
    expect(milestoneOf(21, 23, best(20))).toBeNull();
  });

  it('has no best to pass before the first score', () => {
    expect(milestoneOf(0, 1, best(0))).toBeNull();
  });

  it('marks a certificate the watch hasn’t earned yet', () => {
    expect(milestoneOf(13, 15, best(0))).toEqual({
      kind: 'certificate',
      tier: 'adjusted',
    });
    expect(milestoneOf(38, 44, best(20))).toEqual({
      kind: 'certificate',
      tier: 'chronometer',
    });
    expect(milestoneOf(74, 80, best(41))).toEqual({
      kind: 'certificate',
      tier: 'observatory',
    });
    // One already earned is passed as quietly as any score.
    expect(milestoneOf(14, 16, best(30))).toBeNull();
  });

  it('marks a certificate over a best passed by the same hit', () => {
    expect(milestoneOf(13, 15, best(14))).toEqual({
      kind: 'certificate',
      tier: 'adjusted',
    });
  });

  it('marks the day’s best and a score to beat, never certificates', () => {
    expect(milestoneOf(9, 11, { kind: 'today', score: 10 })).toEqual({
      kind: 'standing',
    });
    expect(milestoneOf(22, 24, { kind: 'toBeat', score: 23 })).toEqual({
      kind: 'standing',
    });
    expect(milestoneOf(13, 15, { kind: 'today', score: 0 })).toBeNull();
    expect(milestoneOf(13, 15, { kind: 'toBeat', score: 30 })).toBeNull();
  });
});

describe('passesMilestone', () => {
  const hit = (score: number, points: number): GameEvent => ({
    type: 'hit',
    time: 0,
    quality: 'good',
    offset: 0,
    ms: 0,
    leg: 'single',
    points,
    score,
    streak: 0,
  });

  it('reads the hit’s score before and after', () => {
    expect(passesMilestone([hit(21, 2)], best(20))).toBe(true);
    expect(passesMilestone([hit(23, 2)], best(20))).toBe(false);
    expect(passesMilestone([{ type: 'started', time: 0 }], best(20))).toBe(
      false
    );
  });
});
