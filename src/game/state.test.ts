import { describe, expect, it } from 'vitest';

import { angularDistance, CLOCKWISE, COUNTERCLOCKWISE } from './angle.js';
import { difficultyAt } from './difficulty.js';
import { DIVER_RULES } from './rules/diver.js';
import type { GameRules } from './rules/types.js';
import { firstTargetWidth } from './spawn.js';
import {
  INITIAL_STATE,
  START_ANGLE,
  update,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayingState,
} from './state.js';
import {
  centerTime,
  handAngleAt,
  ringAngleAt,
  targetCenterAt,
  windowCloseTime,
  type Segment,
} from './timing.js';

const RULES = DIVER_RULES;
const T0 = 10_000;
const GRACE = RULES.timing.inputGraceMs;
const DEBOUNCE = RULES.timing.tapDebounceMs;

function apply(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(
    (current, action) => update(current, action, RULES).state,
    state
  );
}

function started(seed = 1, time = T0): PlayingState {
  return playing(apply(INITIAL_STATE, { type: 'start', time, seed }));
}

function playing(state: GameState): PlayingState {
  if (state.phase !== 'playing') {
    throw new Error(`Expected a round in play, got ${state.phase}`);
  }
  return state;
}

const segmentOf = (state: GameState): Segment => playing(state).round.segment;

/** Taps `offsetMs` after the hand meets the current target's centre. */
function tapAtCenter(state: GameState, offsetMs = 0) {
  return update(
    state,
    { type: 'tap', time: centerTime(segmentOf(state)) + offsetMs },
    RULES
  );
}

/**
 * Taps as soon as the debounce allows. Targets spawn at least 60° ahead, so
 * this is always early.
 */
function tapEarly(state: GameState) {
  return update(
    state,
    { type: 'tap', time: segmentOf(state).startTime + DEBOUNCE },
    RULES
  );
}

/** Lands `count` Perfect hits in a row. */
function perfectRun(count: number, seed = 1): PlayingState {
  let state: GameState = started(seed);
  for (let hit = 0; hit < count; hit++) state = tapAtCenter(state).state;
  return playing(state);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('starting a round', () => {
  it('goes from idle to playing', () => {
    const { state, events } = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      RULES
    );
    expect(state.phase).toBe('playing');
    expect(events).toEqual([{ type: 'started', time: T0 }]);
  });

  it('starts the hand at 12 o’clock, clockwise, at 100°/s with a ±120 ms target', () => {
    const { round } = started();
    expect(round).toMatchObject({
      hits: 0,
      score: 0,
      streak: 0,
      startedAt: T0,
    });
    expect(round.segment).toMatchObject({
      startTime: T0,
      handAngle: START_ANGLE,
      direction: CLOCKWISE,
      speed: 100,
      target: { width: firstTargetWidth(RULES) },
    });
    expect(round.segment.target.hitWindow).toBeCloseTo(12, 9);
  });

  it('retries from game over with a fresh round', () => {
    // End a round that had a score, a streak and an active multiplier.
    const over = tapEarly(perfectRun(3)).state;
    expect(over).toMatchObject({
      phase: 'gameOver',
      round: { score: 8, streak: 3 },
    });

    const retried = playing(
      apply(over, { type: 'start', time: T0 + 5000, seed: 2 })
    );
    expect(retried.round).toMatchObject({
      seed: 2,
      startedAt: T0 + 5000,
      hits: 0,
      perfects: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
    });
    const { events } = tapAtCenter(retried);
    expect(events).toEqual([expect.objectContaining({ points: 2 })]);
  });

  it('ignores start while a round is running or paused', () => {
    const running = started();
    expect(
      update(running, { type: 'start', time: T0 + 1, seed: 9 }, RULES).state
    ).toBe(running);
    const paused = apply(running, { type: 'pause', time: T0 + 10 });
    expect(
      update(paused, { type: 'start', time: T0 + 20, seed: 9 }, RULES).state
    ).toBe(paused);
  });
});

describe('hitting a target', () => {
  it('scores a Perfect at the exact centre', () => {
    const { state, events } = tapAtCenter(started());
    expect(playing(state).round).toMatchObject({
      hits: 1,
      perfects: 1,
      score: 2,
      streak: 1,
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'hit',
        quality: 'perfect',
        points: 2,
        score: 2,
      }),
    ]);
  });

  it('scores 1 for a hit away from the centre', () => {
    const first = started();
    const offsetMs = (6 / first.round.segment.speed) * 1000; // 6° late
    const { state, events } = tapAtCenter(first, offsetMs);
    expect(playing(state).round).toMatchObject({
      score: 1,
      streak: 0,
      perfects: 0,
    });
    expect(events[0]).toMatchObject({
      type: 'hit',
      quality: 'good',
      points: 1,
    });
  });

  it('reverses the hand, speeds it up and narrows the target', () => {
    const before = started();
    const tapTime = centerTime(before.round.segment);
    const after = segmentOf(tapAtCenter(before).state);

    const next = difficultyAt(RULES.difficulty, 1);
    expect(after.direction).toBe(COUNTERCLOCKWISE);
    expect(after.speed).toBe(next.handSpeed);
    expect(after.speed).toBeGreaterThan(before.round.segment.speed);
    expect((after.target.hitWindow / after.speed) * 1000).toBeCloseTo(
      next.hitWindowMs,
      9
    );
    expect(next.hitWindowMs).toBeLessThan(120);
    expect(after.startTime).toBe(tapTime);
    expect(after.handAngle).toBeCloseTo(
      handAngleAt(before.round.segment, tapTime),
      9
    );
    expect(after.ringAngle).toBeCloseTo(
      ringAngleAt(before.round.segment, tapTime),
      9
    );
  });

  it('carries on from where the hand was on an off-centre hit', () => {
    const before = started().round.segment;
    const tapTime = centerTime(before) + (6 / before.speed) * 1000;
    const { state, events } = update(
      started(),
      { type: 'tap', time: tapTime },
      RULES
    );
    const after = segmentOf(state);

    expect(events[0]).toMatchObject({ quality: 'good' });
    expect(after.startTime).toBe(tapTime);
    expect(after.direction).toBe(-before.direction);
    expect(
      angularDistance(after.handAngle, handAngleAt(before, tapTime))
    ).toBeLessThan(1e-9);
    // The hand doesn't jump to the target centre.
    expect(
      angularDistance(after.handAngle, targetCenterAt(before, tapTime))
    ).toBeGreaterThan(5);
  });

  it('keeps a turning ring where it was at the hit', () => {
    const turning: GameRules = {
      ...RULES,
      ring: { turns: 'always', direction: COUNTERCLOCKWISE },
    };
    let state = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      turning
    ).state;
    for (let hit = 0; hit < 3; hit++) {
      const before = segmentOf(state);
      const tapTime = centerTime(before);
      state = update(state, { type: 'tap', time: tapTime }, turning).state;
      const after = segmentOf(state);

      expect(
        angularDistance(after.ringAngle, ringAngleAt(before, tapTime))
      ).toBeLessThan(1e-9);
      // The ring really moved, so the check above can fail.
      expect(
        angularDistance(after.ringAngle, before.ringAngle)
      ).toBeGreaterThan(1);
    }
  });

  it('alternates direction on every hit', () => {
    let state: GameState = started();
    const directions = [];
    for (let hit = 0; hit < 6; hit++) {
      directions.push(segmentOf(state).direction);
      state = tapAtCenter(state).state;
    }
    expect(directions).toEqual([1, -1, 1, -1, 1, -1]);
  });

  it('eases towards 270°/s and a ±24 ms window, never past them', () => {
    // On a plain target: a turning ring closes in faster than the hand.
    let state = perfectRun(300);
    while (state.round.segment.special) {
      state = playing(tapAtCenter(state).state);
    }
    const { segment } = state.round;
    expect(segment.speed).toBeGreaterThan(269.8);
    expect(segment.speed).toBeLessThanOrEqual(270);
    const windowMs = (segment.target.hitWindow / segment.speed) * 1000;
    expect(windowMs).toBeGreaterThanOrEqual(24);
    expect(windowMs).toBeLessThan(24.1);
  });

  it('switches the multiplier on with the third Perfect and keeps it', () => {
    let state: GameState = started();
    const points: number[] = [];
    const multiplierEvents: GameEvent[] = [];
    for (let hit = 0; hit < 6; hit++) {
      const transition = tapAtCenter(state);
      state = transition.state;
      for (const event of transition.events) {
        if (event.type === 'hit') points.push(event.points);
        if (event.type === 'multiplier') multiplierEvents.push(event);
      }
    }
    expect(points).toEqual([2, 2, 4, 4, 4, 4]);
    expect(multiplierEvents).toEqual([expect.objectContaining({ factor: 2 })]);
    expect(playing(state).round).toMatchObject({
      score: 20,
      streak: 6,
      bestStreak: 6,
    });
  });

  it('switches the multiplier off with a good hit', () => {
    const streaking = perfectRun(3);
    const goodOffset = (5 / streaking.round.segment.speed) * 1000;
    const { state, events } = tapAtCenter(streaking, goodOffset);
    expect(events.map(event => event.type)).toEqual(['hit', 'multiplier']);
    expect(events[1]).toMatchObject({ factor: 1 });
    expect(playing(state).round).toMatchObject({ streak: 0, bestStreak: 3 });
  });

  it('adds up a long Perfect run', () => {
    // 2 + 2, then 4 points for the third to the seventh Perfect and 6 for
    // every one from the eighth on.
    expect(perfectRun(40).round.score).toBe(2 + 2 + 5 * 4 + 33 * 6);
  });
});

describe('missing', () => {
  it('ends the round when the tap is early', () => {
    const { state, events } = tapEarly(started());
    expect(state).toMatchObject({
      phase: 'gameOver',
      miss: { reason: 'early' },
    });
    expect(events).toEqual([
      expect.objectContaining({ type: 'miss', reason: 'early', score: 0 }),
    ]);
  });

  it('ends the round when the tap is late', () => {
    const round = started();
    const late = windowCloseTime(round.round.segment) + GRACE / 2;
    const { state } = update(round, { type: 'tap', time: late }, RULES);
    expect(state).toMatchObject({
      phase: 'gameOver',
      miss: { reason: 'late', time: late },
    });
  });

  it('ends the round once the hand has passed the target untouched', () => {
    const round = started();
    const close = windowCloseTime(round.round.segment);
    const { state, events } = update(
      round,
      { type: 'tick', time: close + GRACE },
      RULES
    );
    expect(state).toMatchObject({
      phase: 'gameOver',
      miss: {
        reason: 'passed',
        time: close,
        offset: round.round.segment.target.hitWindow,
      },
    });
    expect(events).toEqual([
      expect.objectContaining({ type: 'miss', reason: 'passed' }),
    ]);
  });

  it('keeps the score of the round in the miss', () => {
    const { state, events } = tapEarly(perfectRun(4));
    expect(state).toMatchObject({ phase: 'gameOver', round: { score: 12 } });
    expect(events[0]).toMatchObject({ score: 12 });
  });

  it('reports a passed target when the tap arrives long after it', () => {
    const round = started();
    const close = windowCloseTime(round.round.segment);
    const { state } = update(round, { type: 'tap', time: close + 5000 }, RULES);
    expect(state).toMatchObject({ miss: { reason: 'passed', time: close } });
  });

  it('ignores taps and ticks after the round is over', () => {
    const over = tapEarly(started()).state;
    expect(update(over, { type: 'tap', time: T0 + 99_999 }, RULES).state).toBe(
      over
    );
    expect(update(over, { type: 'tick', time: T0 + 99_999 }, RULES).state).toBe(
      over
    );
  });
});

describe('timing accuracy', () => {
  it('returns the same state object for ticks that change nothing', () => {
    const round = started();
    const { state, events } = update(
      round,
      { type: 'tick', time: T0 + 16 },
      RULES
    );
    expect(state).toBe(round);
    expect(events).toHaveLength(0);
  });

  it('waits for the input grace before declaring a pass', () => {
    const round = started();
    const close = windowCloseTime(round.round.segment);
    expect(
      update(round, { type: 'tick', time: close + GRACE - 1 }, RULES).state
    ).toBe(round);
  });

  it('still honours a tap that is delivered after a later frame', () => {
    // The tap happened 1 ms before the window closed, but the page only saw
    // it after drawing a frame 30 ms later.
    const round = started();
    const close = windowCloseTime(round.round.segment);
    const afterFrame = apply(round, { type: 'tick', time: close + 30 });
    const { state, events } = update(
      afterFrame,
      { type: 'tap', time: close - 1 },
      RULES
    );
    expect(state.phase).toBe('playing');
    expect(events[0]).toMatchObject({ type: 'hit', quality: 'good' });
  });

  it('judges taps by timestamp, whatever the frame rate', () => {
    // The same taps under very different frame cadences give the same game.
    const offsets = [0, 4, -7, 12, 0, -3, 9, 0, 0, -5, 2, 0, 15, -11, 0];
    const play = (frameMs: (index: number) => number) => {
      let state: GameState = started(42);
      let now = T0;
      let frame = 0;
      for (const offset of offsets) {
        const tapTime: number = centerTime(segmentOf(state)) + offset;
        // Frames keep coming until the one after the tap; the tap is
        // delivered after that frame, as a busy main thread would.
        while (now < tapTime) {
          now += frameMs(frame++);
          state = update(state, { type: 'tick', time: now }, RULES).state;
        }
        state = update(state, { type: 'tap', time: tapTime }, RULES).state;
        if (state.phase !== 'playing') break;
      }
      return state;
    };

    const smooth = play(() => 1000 / 120);
    expect(smooth.phase).toBe('playing');
    expect(play(() => 1000 / 60)).toEqual(smooth);
    expect(play(() => 50)).toEqual(smooth);
    expect(play(index => (index % 7 === 0 ? 45 : 4))).toEqual(smooth);
  });

  it('ignores a second tap within the debounce window after a hit', () => {
    const hit = tapAtCenter(started()).state;
    const hitAt = segmentOf(hit).startTime;
    for (const time of [hitAt - 5, hitAt, hitAt + DEBOUNCE - 1]) {
      const bounce = update(hit, { type: 'tap', time }, RULES);
      expect(bounce.state).toBe(hit);
      expect(bounce.events).toHaveLength(0);
    }
    expect(tapEarly(hit).state.phase).toBe('gameOver');
  });

  it('ignores a repeat of the press that started the round', () => {
    const round = started();
    for (const time of [T0 - 500, T0, T0 + DEBOUNCE - 1]) {
      expect(update(round, { type: 'tap', time }, RULES).state).toBe(round);
    }
    expect(tapEarly(round).state).toMatchObject({
      miss: { reason: 'early', time: T0 + DEBOUNCE },
    });
  });

  it.each([
    { type: 'start', time: Number.NaN, seed: 1 },
    { type: 'tap', time: Number.NaN },
    { type: 'tick', time: Number.POSITIVE_INFINITY },
    { type: 'pause', time: Number.NEGATIVE_INFINITY },
    { type: 'resume', time: Number.NaN },
  ] as const)('rejects a $type with time $time', action => {
    expect(() => update(started(), action, RULES)).toThrow(RangeError);
  });
});

describe('determinism', () => {
  it('replays the same round from the same seed and taps', () => {
    expect(perfectRun(15, 7)).toEqual(perfectRun(15, 7));
  });

  it('places different targets for different seeds', () => {
    const firstTargets = new Set(
      Array.from(
        { length: 20 },
        (_, seed) => started(seed).round.segment.target.mark
      )
    );
    expect(firstTargets.size).toBeGreaterThan(5);
  });

  it('turns the Diver bezel on some targets once the run warms up', () => {
    let state: GameState = started(3);
    const specials: boolean[] = [];
    for (let hit = 0; hit < 60; hit++) {
      specials.push(segmentOf(state).special);
      state = tapAtCenter(state).state;
    }
    expect(specials.slice(0, 1)).toEqual([false]);
    expect(specials.some(Boolean)).toBe(true);
    expect(specials.every(Boolean)).toBe(false);
  });

  it('never mutates the state it is given', () => {
    const round = deepFreeze(started());
    expect(() => tapAtCenter(round)).not.toThrow();
    expect(() => tapEarly(round)).not.toThrow();
    expect(() =>
      update(round, { type: 'pause', time: T0 + 5 }, RULES)
    ).not.toThrow();
  });
});

describe('pausing', () => {
  it('freezes the hand and resumes where it stopped', () => {
    const round = started();
    const paused = apply(round, { type: 'pause', time: T0 + 300 });
    expect(paused).toMatchObject({ phase: 'paused', pausedAt: T0 + 300 });

    const resumed = playing(
      apply(paused, { type: 'resume', time: T0 + 60_300 })
    );
    expect(handAngleAt(resumed.round.segment, T0 + 60_300)).toBeCloseTo(
      handAngleAt(round.round.segment, T0 + 300),
      9
    );
    expect(resumed.round.startedAt).toBe(T0 + 60_000);
  });

  it('does not count paused time against the player', () => {
    const round = started();
    const close = windowCloseTime(round.round.segment);
    const resumed = apply(
      round,
      { type: 'pause', time: T0 + 100 },
      { type: 'resume', time: T0 + 10_100 }
    );
    expect(
      update(resumed, { type: 'tick', time: close + GRACE }, RULES).state.phase
    ).toBe('playing');
    expect(
      update(resumed, { type: 'tick', time: close + 10_000 + GRACE }, RULES)
        .state.phase
    ).toBe('gameOver');
  });

  it('shifts the debounce window with the pause', () => {
    const hit = tapAtCenter(started()).state;
    const hitAt = segmentOf(hit).startTime;
    const resumed = apply(
      hit,
      { type: 'pause', time: hitAt + 10 },
      { type: 'resume', time: hitAt + 1010 }
    );
    const shiftedHit = hitAt + 1000;
    expect(segmentOf(resumed).startTime).toBe(shiftedHit);
    expect(
      update(resumed, { type: 'tap', time: shiftedHit + DEBOUNCE - 1 }, RULES)
        .state
    ).toBe(resumed);
  });

  it('never pauses before the current sweep began', () => {
    // The frame that requests the pause can be stamped before a tap that
    // was handled just ahead of it.
    const before = started().round.segment;
    const hitAt = centerTime(before);
    const hit = tapAtCenter(started()).state;
    const { state, events } = update(
      hit,
      { type: 'pause', time: hitAt - 16 },
      RULES
    );
    expect(state).toMatchObject({ phase: 'paused', pausedAt: hitAt });
    expect(events).toEqual([{ type: 'paused', time: hitAt }]);

    const resumed = apply(state, { type: 'resume', time: hitAt + 2000 });
    expect(
      angularDistance(
        handAngleAt(segmentOf(resumed), hitAt + 2000),
        handAngleAt(before, hitAt)
      )
    ).toBeLessThan(1e-9);
  });

  it('ignores taps and ticks while paused', () => {
    const paused = apply(started(), { type: 'pause', time: T0 + 100 });
    expect(update(paused, { type: 'tap', time: T0 + 200 }, RULES).state).toBe(
      paused
    );
    expect(
      update(paused, { type: 'tick', time: T0 + 99_000 }, RULES).state
    ).toBe(paused);
  });

  it('ends the round instead of pausing once the target has passed', () => {
    const round = started();
    const close = windowCloseTime(round.round.segment);
    const { state } = update(
      round,
      { type: 'pause', time: close + GRACE },
      RULES
    );
    expect(state).toMatchObject({
      phase: 'gameOver',
      miss: { reason: 'passed' },
    });
  });

  it('only resumes a paused round', () => {
    const round = started();
    expect(update(round, { type: 'resume', time: T0 + 5 }, RULES).state).toBe(
      round
    );
  });

  it('never moves time backwards on resume', () => {
    const paused = apply(started(), { type: 'pause', time: T0 + 500 });
    const resumed = playing(apply(paused, { type: 'resume', time: T0 + 400 }));
    expect(resumed.round.startedAt).toBe(T0);
  });
});

describe('exiting', () => {
  it.each([
    ['playing', (): GameState => started()],
    [
      'paused',
      (): GameState => apply(started(), { type: 'pause', time: T0 + 1 }),
    ],
    ['gameOver', (): GameState => tapEarly(started()).state],
  ])('returns to idle from %s', (_, make) => {
    const { state, events } = update(make(), { type: 'exit' }, RULES);
    expect(state).toBe(INITIAL_STATE);
    expect(events).toEqual([{ type: 'exited' }]);
  });

  it('does nothing when already idle', () => {
    const { state, events } = update(INITIAL_STATE, { type: 'exit' }, RULES);
    expect(state).toBe(INITIAL_STATE);
    expect(events).toHaveLength(0);
  });

  it.each(['tap', 'tick', 'pause', 'resume'] as const)(
    'ignores %s while idle',
    type => {
      expect(update(INITIAL_STATE, { type, time: T0 }, RULES).state).toBe(
        INITIAL_STATE
      );
    }
  );
});

describe('custom rules', () => {
  it('plays with a different scoring and timing setup', () => {
    const rules: GameRules = {
      ...RULES,
      scoring: {
        goodPoints: 5,
        perfectPoints: 10,
        multipliers: [{ streak: 2, factor: 3 }],
      },
    };
    let state: GameState = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      rules
    ).state;
    for (let hit = 0; hit < 3; hit++) {
      state = update(
        state,
        { type: 'tap', time: centerTime(segmentOf(state)) },
        rules
      ).state;
    }
    expect(playing(state).round.score).toBe(10 + 30 + 30);
  });
});
