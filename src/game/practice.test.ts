import { describe, expect, it } from 'vitest';

import { nearMiss } from './near-miss.js';
import { PRACTICE_PACES, PRACTICE_SET, practiceRules } from './practice.js';
import { CHRONOGRAPH_RULES } from './rules/chronograph.js';
import { DIGITAL_RULES } from './rules/digital.js';
import { DIVER_RULES } from './rules/diver.js';
import { FIELD_RULES } from './rules/field.js';
import { GMT_RULES } from './rules/gmt.js';
import { GRAND_COMPLICATION_RULES } from './rules/grand-complication.js';
import { MOONPHASE_RULES } from './rules/moonphase.js';
import { PILOT_RULES } from './rules/pilot.js';
import { TOURBILLON_RULES } from './rules/tourbillon.js';
import type { GameRules } from './rules/types.js';
import { checkRules } from './rules/validate.js';
import {
  INITIAL_STATE,
  update,
  type GameAction,
  type GameState,
  type PlayingState,
  type PracticeOptions,
} from './state.js';
import { centerTime, windowCloseTime } from './timing.js';

const T0 = 10_000;

function playing(state: GameState): PlayingState {
  if (state.phase !== 'playing') {
    throw new Error(`Expected a round in play, got ${state.phase}`);
  }
  return state;
}

/** A practice round, on `rules`, in a set of `targets`. */
function practise(rules: GameRules = DIVER_RULES, targets = 25) {
  const options: PracticeOptions = { targets };
  const step = (state: GameState, action: GameAction) =>
    update(state, action, rules, options);
  const start = (seed = 1) =>
    playing(step(INITIAL_STATE, { type: 'start', time: T0, seed }).state);
  const atCentre = (state: GameState, offsetMs = 0) =>
    step(state, {
      type: 'tap',
      time: centerTime(playing(state).round.segment) + offsetMs,
    });
  const early = (state: GameState) =>
    step(state, {
      type: 'tap',
      time: playing(state).round.segment.startTime + rules.timing.tapDebounceMs,
    });
  return { step, start, atCentre, early };
}

describe('a practice miss', () => {
  it('moves on to a new target, the hand turning back as a tap turns it', () => {
    const { start, early } = practise();
    const before = start();
    const { state, events } = early(before);
    const after = playing(state);
    expect(events).toEqual([
      expect.objectContaining({ type: 'slip', reason: 'early' }),
    ]);
    const [slip] = events;
    expect(slip?.type === 'slip' && slip.ms).toBeLessThan(0);
    expect(after.round.slips).toBe(1);
    expect(after.round.hits).toBe(0);
    expect(after.round.score).toBe(0);
    expect(after.round.segment.direction).toBe(-before.round.segment.direction);
  });

  it('breaks the streak and switches the multiplier off', () => {
    const { start, atCentre, early } = practise();
    let state: GameState = start();
    for (let hit = 0; hit < 3; hit++) state = atCentre(state).state;
    expect(playing(state).round.streak).toBe(3);
    const { state: after, events } = early(state);
    expect(playing(after).round.streak).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'multiplier', factor: 1 })
    );
  });

  it('sweeps on past a target it was never tapped on, with no timing', () => {
    const { start, step } = practise();
    const before = start();
    const passed = windowCloseTime(before.round.segment) + 500;
    const { state, events } = step(before, { type: 'tick', time: passed });
    expect(events).toEqual([
      expect.objectContaining({ type: 'slip', reason: 'passed', ms: null }),
    ]);
    expect(playing(state).round.segment.direction).toBe(
      before.round.segment.direction
    );
  });

  it('moves on when the hand runs past during a pause too', () => {
    const { start, step } = practise();
    const before = start();
    const passed = windowCloseTime(before.round.segment) + 500;
    const { state } = step(before, { type: 'pause', time: passed });
    expect(playing(state).round.slips).toBe(1);
  });
});

describe('a practice set', () => {
  it('ends after its targets, hit or missed, with nothing missed', () => {
    const { start, atCentre, early } = practise(DIVER_RULES, 4);
    let state: GameState = start();
    state = atCentre(state).state;
    state = early(state).state;
    state = atCentre(state, 5).state;
    const last = early(state);
    expect(last.state).toMatchObject({ phase: 'gameOver', miss: null });
    expect(last.events.at(-1)).toMatchObject({ type: 'complete', score: 4 });
    const complete = last.events.at(-1);
    if (last.state.phase !== 'gameOver' || complete?.type !== 'complete') {
      throw new Error('Not over');
    }
    expect(last.state.endedAt).toBe(complete.time);
    expect(nearMiss(last.state)).toBeNull();
  });

  it('can end on a hit', () => {
    const { start, atCentre } = practise(DIVER_RULES, 1);
    const { state, events } = atCentre(start());
    expect(state.phase).toBe('gameOver');
    expect(events.map(event => event.type)).toEqual(['hit', 'complete']);
  });

  it('counts a chronograph pair once, at its stop mark', () => {
    const { start, atCentre } = practise(CHRONOGRAPH_RULES, 99);
    let state: GameState = start();
    // Hit on until a pair comes up.
    while (playing(state).round.segment.twist?.kind !== 'chrono') {
      state = atCentre(state).state;
    }
    const round = playing(state).round;
    const { atCentre: finishing } = practise(CHRONOGRAPH_RULES, round.hits + 1);
    const afterStart = finishing(state);
    expect(afterStart.state.phase).toBe('playing');
    expect(finishing(afterStart.state).state.phase).toBe('gameOver');
  });

  it('plays a round outside practice exactly as before', () => {
    const plain = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      DIVER_RULES
    );
    const { start } = practise();
    expect(start()).toEqual(plain.state);
  });
});

const EVERY_WATCH = [
  DIVER_RULES,
  CHRONOGRAPH_RULES,
  GMT_RULES,
  MOONPHASE_RULES,
  TOURBILLON_RULES,
  GRAND_COMPLICATION_RULES,
  FIELD_RULES,
  PILOT_RULES,
  DIGITAL_RULES,
];

describe('practiceRules', () => {
  it('plays the watch’s own rules at its own pace', () => {
    expect(practiceRules(DIVER_RULES, 'normal')).toBe(DIVER_RULES);
  });

  it.each(EVERY_WATCH.map((rules, index) => [index, rules] as const))(
    'eases rule set %i into rules that still check out',
    (_, rules) => {
      const slow = practiceRules(rules, 'slow');
      expect(checkRules(slow).ok).toBe(true);
      const { difficulty } = slow;
      expect(difficulty.handSpeed.start).toBeLessThan(
        rules.difficulty.handSpeed.start
      );
      expect(difficulty.handSpeed.limit).toBeLessThan(
        rules.difficulty.handSpeed.limit
      );
      expect(difficulty.hitWindowMs.limit).toBeGreaterThan(
        rules.difficulty.hitWindowMs.limit
      );
      expect(difficulty.perfectWindowMs.limit).toBeGreaterThan(
        rules.difficulty.perfectWindowMs.limit
      );
      expect(slow.twists).toBe(rules.twists);
    }
  );

  it('offers both paces, and sets of 25', () => {
    expect(PRACTICE_PACES).toEqual(['slow', 'normal']);
    expect(PRACTICE_SET.targets).toBe(25);
  });
});
