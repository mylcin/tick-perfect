import { describe, expect, it } from 'vitest';

import { DIVER_RULES } from './rules/diver.js';
import { GRAND_COMPLICATION_RULES } from './rules/grand-complication.js';
import { MOONPHASE_RULES } from './rules/moonphase.js';
import { TOURBILLON_RULES } from './rules/tourbillon.js';
import { CHRONOGRAPH_RULES } from './rules/chronograph.js';
import { GMT_RULES } from './rules/gmt.js';
import { MAX_LOGGED_ACTIONS, replayRound, type RoundLog } from './replay.js';
import { simulateRound } from './simulate.js';
import { INITIAL_STATE, update, type GameState } from './state.js';
import { centerTime } from './timing.js';

const ALL = [
  DIVER_RULES,
  CHRONOGRAPH_RULES,
  GMT_RULES,
  MOONPHASE_RULES,
  TOURBILLON_RULES,
  GRAND_COMPLICATION_RULES,
];

function replayed(log: RoundLog) {
  const result = replayRound(DIVER_RULES, log);
  if ('rejected' in result) throw new Error(result.rejected);
  return result;
}

describe('replayRound', () => {
  it('scores every watch exactly as the round was played', () => {
    for (const rules of ALL) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const played = simulateRound(rules, { seed, sigma: 20 });
        const result = replayRound(rules, played.log);
        expect(result).toMatchObject({
          score: played.score,
          hits: played.hits,
        });
      }
    }
  });

  it('reports each hit’s timing and how long the round took', () => {
    const played = simulateRound(DIVER_RULES, { seed: 3, sigma: 15 });
    const result = replayed(played.log);
    expect(result.errors).toHaveLength(played.hits);
    expect(result.playedMs).toBeGreaterThan(0);
    expect(result.elapsedMs).toBe(result.playedMs);
  });

  it('leaves pauses out of the time played', () => {
    const start = 5000;
    const state: GameState = update(
      INITIAL_STATE,
      { type: 'start', time: start, seed: 9 },
      DIVER_RULES
    ).state;
    if (state.phase !== 'playing') throw new Error('not playing');
    const first = centerTime(state.round.segment);
    const result = replayed({
      seed: 9,
      start,
      actions: [
        ['tap', first],
        ['pause', first + 100],
        ['resume', first + 10_100],
      ],
    });
    expect(result.hits).toBe(1);
    expect(result.elapsedMs - result.playedMs).toBeCloseTo(10_000, 6);
  });

  it('ends a round left paused where it stood', () => {
    const result = replayed({ seed: 4, start: 0, actions: [['pause', 100]] });
    expect(result.score).toBe(0);
  });

  it('runs the hand on past the last tap until it passes a target', () => {
    const result = replayed({ seed: 4, start: 0, actions: [] });
    expect(result).toMatchObject({ score: 0, hits: 0 });
    expect(result.playedMs).toBeGreaterThan(0);
  });

  it.each([
    [
      'tooLong',
      {
        seed: 1,
        start: 0,
        actions: Array.from(
          { length: MAX_LOGGED_ACTIONS + 1 },
          () => ['tap', 1] as const
        ),
      },
    ],
    ['badTime', { seed: 1, start: Number.NaN, actions: [] }],
    ['badTime', { seed: 1.5, start: 0, actions: [] }],
    [
      'badTime',
      { seed: 1, start: 0, actions: [['tap', Number.POSITIVE_INFINITY]] },
    ],
    ['outOfOrder', { seed: 1, start: 100, actions: [['tap', 50]] }],
    [
      'outOfOrder',
      {
        seed: 1,
        start: 0,
        actions: [
          ['tap', 120],
          ['tap', 200],
        ],
      },
    ],
  ] as const)('refuses a log that is %s', (reason, log) => {
    expect(replayRound(DIVER_RULES, log as RoundLog)).toEqual({
      rejected: reason,
    });
  });

  it('refuses a round that never ends', () => {
    const endless = {
      ...DIVER_RULES,
      timing: { ...DIVER_RULES.timing, inputGraceMs: Number.POSITIVE_INFINITY },
    };
    expect(replayRound(endless, { seed: 1, start: 0, actions: [] })).toEqual({
      rejected: 'neverEnded',
    });
  });
});
