import { describe, expect, it } from 'vitest';

import {
  CHRONOGRAPH_RULES,
  DIVER_RULES,
  MAX_LOGGED_ACTIONS,
  simulateRound,
  windowCloseTime,
} from '../game';
import {
  checkGhost,
  ghostLog,
  ghostOf,
  mergeGhosts,
  NO_GHOSTS,
  restoreGhost,
  restoreGhosts,
  type GhostRun,
} from './ghost';
import { createGhostRunner } from './ghost-runner';

/** A steady player's round on the Diver, as a ghost. */
function played(seed = 11, sigma = 12) {
  const round = simulateRound(DIVER_RULES, { seed, sigma, start: 5000 });
  return { round, ghost: ghostOf(round.log, round.score) };
}

describe('ghostOf', () => {
  it('keeps each tap’s moment of play, pauses taken out', () => {
    expect(
      ghostOf(
        {
          seed: 3,
          start: 1000,
          actions: [
            ['tap', 1500],
            ['pause', 1700],
            ['resume', 4700],
            ['tap', 5000],
            ['tap', 5600.5],
          ],
        },
        4
      )
    ).toEqual({ seed: 3, score: 4, taps: [500, 1000, 1600.5] });
  });

  it('plays back as the round it was', () => {
    const { round, ghost } = played();
    expect(round.score).toBeGreaterThan(5);
    expect(checkGhost(DIVER_RULES, ghost)).toMatchObject({
      score: round.score,
      hits: round.hits,
    });
  });

  it('is no ghost on rules it doesn’t play the same on', () => {
    const { ghost } = played();
    expect(checkGhost(CHRONOGRAPH_RULES, ghost)).toBeNull();
    expect(checkGhost(DIVER_RULES, { ...ghost, score: ghost.score + 1 })).toBe(
      null
    );
    const tooLong = { ...ghost, taps: Array(MAX_LOGGED_ACTIONS + 1).fill(1) };
    expect(checkGhost(DIVER_RULES, tooLong)).toBeNull();
    expect(ghostLog({ seed: 1, score: 0, taps: [5] })).toEqual({
      seed: 1,
      start: 0,
      actions: [['tap', 5]],
    });
  });
});

describe('a ghost raced live', () => {
  it('plays its round again on another clock, through the player’s pauses', () => {
    const { round, ghost } = played();
    const runner = createGhostRunner(DIVER_RULES, ghost);
    const start = 90_000;
    runner.start(start);
    expect(runner.angle(start)).toBe(0);
    let now = start;
    let paused = false;
    // Frames of 16 ms; the player pauses for 5 s, a third of the way in.
    while (runner.controller.snapshot().state.phase !== 'gameOver') {
      now += 16;
      if (!paused && now > start + 3000) {
        runner.pause(now);
        now += 5000;
        runner.resume(now);
        paused = true;
      }
      runner.advance(now);
    }
    expect(paused).toBe(true);
    expect(runner.controller.score.get()).toBe(round.score);
    expect(runner.angle(now)).toBeNull();
  });

  it('holds still once the player’s round is over', () => {
    const { ghost } = played();
    const runner = createGhostRunner(DIVER_RULES, ghost);
    runner.start(0);
    runner.advance(400);
    runner.stop(400);
    const held = runner.angle(400);
    runner.advance(5000);
    expect(runner.angle(5000)).toBe(held);
    expect(runner.controller.snapshot().state.phase).toBe('paused');
  });

  it('runs past a target as its round did, with no tap left', () => {
    const ghost: GhostRun = { seed: 5, score: 0, taps: [] };
    const runner = createGhostRunner(DIVER_RULES, ghost);
    runner.start(0);
    const { state } = runner.controller.snapshot();
    if (state.phase !== 'playing') throw new Error('Not started');
    runner.advance(windowCloseTime(state.round.segment) + 500);
    expect(runner.controller.snapshot().state.phase).toBe('gameOver');
  });
});

describe('mergeGhosts', () => {
  const ghost = (score: number): GhostRun => ({ seed: 1, score, taps: [] });
  const daily = (number: number, score: number) => ({
    ...ghost(score),
    number,
    watch: 'diver',
  });

  it('keeps each watch’s better ghost and the later Daily’s', () => {
    expect(
      mergeGhosts(
        { best: { diver: ghost(20), gmt: ghost(9) }, daily: daily(4, 10) },
        { best: { diver: ghost(25) }, daily: daily(5, 3) }
      )
    ).toEqual({
      best: { diver: ghost(25), gmt: ghost(9) },
      daily: daily(5, 3),
    });
  });

  it('keeps the better of the same Daily, the first on a tie', () => {
    const first = daily(5, 8);
    expect(
      mergeGhosts({ best: {}, daily: first }, { best: {}, daily: daily(5, 8) })
        .daily
    ).toBe(first);
    expect(mergeGhosts({ best: {}, daily: first }, NO_GHOSTS).daily).toBe(
      first
    );
    expect(
      mergeGhosts({ best: {}, daily: daily(6, 1) }, { best: {}, daily: first })
        .daily
    ).toEqual(daily(6, 1));
    expect(mergeGhosts(NO_GHOSTS, { best: {}, daily: first }).daily).toBe(
      first
    );
  });
});

describe('restoreGhosts', () => {
  it.each([
    null,
    'ghost',
    { seed: -1, score: 3, taps: [] },
    { seed: 2 ** 32, score: 3, taps: [] },
    { seed: 1, score: 1.5, taps: [] },
    { seed: 1, score: 3, taps: 'taps' },
    { seed: 1, score: 3, taps: [5, 4] },
    { seed: 1, score: 3, taps: [-1] },
    { seed: 1, score: 3, taps: [Number.NaN] },
    { seed: 1, score: 3, taps: Array(MAX_LOGGED_ACTIONS + 1).fill(1) },
  ])('drops the unusable ghost %j', saved => {
    expect(restoreGhost(saved)).toBeNull();
  });

  it('keeps the valid ghosts and a whole Daily one', () => {
    const ghost = { seed: 1, score: 3, taps: [400, 900] };
    expect(
      restoreGhosts({
        best: { diver: ghost, 'not a watch': ghost, gmt: { seed: 'x' } },
        daily: { ...ghost, number: 4, watch: 'chronograph' },
      })
    ).toEqual({
      best: { diver: ghost },
      daily: { ...ghost, number: 4, watch: 'chronograph' },
    });
  });

  it.each([
    null,
    [],
    { best: [], daily: { seed: 1, score: 3, taps: [], number: 0, watch: 'x' } },
    { best: null, daily: { seed: 1, score: 3, taps: [], number: 4 } },
  ])('reads %j as no ghosts', saved => {
    expect(restoreGhosts(saved)).toEqual(NO_GHOSTS);
  });
});
