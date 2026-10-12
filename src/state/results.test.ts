import { describe, expect, it } from 'vitest';

import { dailySeed } from '../game';
import { APP_URL } from '../utils/share';
import { RULES_REVISION } from '../watches/revisions';
import { parseChallenge } from './challenge';
import { INITIAL_PROGRESS, recordScore, type Progress } from './progress';
import { goalAfter, roundShareText } from './results';

function after(progress: Progress, score: number, watch = 'diver' as const) {
  const recorded = recordScore(progress, watch, score).progress;
  return goalAfter(recorded, watch, score);
}

describe('goalAfter', () => {
  const withPoints = (points: number): Progress => ({
    ...INITIAL_PROGRESS,
    points,
  });

  it('points at unlocking the next watch once its level is reached', () => {
    expect(after(withPoints(200), 8)).toEqual({
      kind: 'unlock',
      watch: 'chronograph',
      points: 7,
    });
  });

  it('points at the next level when it is nearest', () => {
    // 5 more points reach level 2; Adjusted is 10 away.
    expect(after(withPoints(140), 5)).toEqual({
      kind: 'level',
      level: 2,
      points: 5,
    });
  });

  it('points at the next certificate before the level is near', () => {
    expect(after(INITIAL_PROGRESS, 8)).toEqual({
      kind: 'certificate',
      tier: 'adjusted',
      points: 7,
    });
    const progress = recordScore(withPoints(200), 'diver', 20).progress;
    expect(after(progress, 36)).toEqual({
      kind: 'certificate',
      tier: 'chronometer',
      points: 4,
    });
  });

  it('points at the best when it is nearer', () => {
    const progress = recordScore(withPoints(200), 'diver', 33).progress;
    // 3 short of the best of 33, 10 short of Chronometer.
    expect(after(progress, 30)).toEqual({ kind: 'best', points: 3 });
  });

  it('points at the level alone after an Observatory best', () => {
    expect(after(INITIAL_PROGRESS, 80)).toEqual({
      kind: 'level',
      level: 2,
      points: 70,
    });
  });

  it('has nothing to point at with every certificate and level', () => {
    expect(after(withPoints(1_000_000), 80)).toBeNull();
  });

  it('never points at a watch the round just unlocked', () => {
    expect(after(withPoints(140), 15)).toEqual({
      kind: 'certificate',
      tier: 'chronometer',
      points: 25,
    });
  });
});

describe('roundShareText', () => {
  const round = {
    watch: 'gmt',
    watchName: 'GMT',
    seed: 1234,
    score: 9,
    qualities: ['perfect', 'good'],
    daily: null,
  } as const;

  /** The challenge the shared link carries. */
  const linked = (text: string) =>
    parseChallenge(
      new URL(text.split('\n').at(-1) ?? '').searchParams.get('c')
    );

  it('shares a collection round with a challenge on its own seed', () => {
    const text = roundShareText({ ...round, mode: { kind: 'collection' } });
    expect(text).toBe(
      `Tick Perfect · GMT · 9\n◆◇\n${APP_URL}/?c=gmt.ya.9.${String(RULES_REVISION.gmt)}`
    );
    expect(linked(text)).toEqual({
      watch: 'gmt',
      seed: 1234,
      score: 9,
      revision: RULES_REVISION.gmt,
    });
  });

  it('shares a challenge round as a new challenge with its own score', () => {
    const text = roundShareText({
      ...round,
      mode: {
        kind: 'challenge',
        challenge: { watch: 'gmt', seed: 1234, score: 30, revision: 1 },
      },
    });
    expect(text.split('\n')[0]).toBe('Tick Perfect · GMT · 9');
    expect(linked(text)).toEqual({
      watch: 'gmt',
      seed: 1234,
      score: 9,
      revision: RULES_REVISION.gmt,
    });
  });

  it('shares the day’s best Daily run, not the round just played', () => {
    const text = roundShareText({
      ...round,
      watch: 'chronograph',
      seed: dailySeed(2),
      mode: { kind: 'daily', number: 2 },
      daily: { number: 2, best: 23, marks: 'PPGP' },
    });
    expect(text.split('\n').slice(0, 2)).toEqual([
      'Tick Perfect #2 · 23',
      '◆◆◇◆',
    ]);
    expect(linked(text)).toEqual({
      watch: 'chronograph',
      seed: dailySeed(2),
      score: 23,
      revision: RULES_REVISION.chronograph,
    });
  });

  it('shares the round itself when the saved Daily is another day’s', () => {
    const text = roundShareText({
      ...round,
      mode: { kind: 'daily', number: 2 },
      daily: { number: 3, best: 40, marks: 'PPPP' },
    });
    expect(text.split('\n').slice(0, 2)).toEqual(['Tick Perfect #2 · 9', '◆◇']);
    expect(linked(text)?.score).toBe(9);
  });
});
