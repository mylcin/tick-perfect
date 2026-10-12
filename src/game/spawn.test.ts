import { describe, expect, it } from 'vitest';

import {
  CLOCKWISE,
  COUNTERCLOCKWISE,
  forwardDistance,
  MINUTE_MARK,
  normalizeAngle,
  type Direction,
} from './angle.js';
import {
  DEFAULT_DIFFICULTY,
  difficultyAt,
  type Difficulty,
} from './difficulty.js';
import { createRng, nextFloat, type RngState } from './rng.js';
import { DIVER_RULES } from './rules/diver.js';
import type { GameRules } from './rules/types.js';
import { planSegment, targetWindows, type SegmentStart } from './spawn.js';
import { targetCenterAt } from './timing.js';

const START: SegmentStart = {
  time: 1000,
  handAngle: 0,
  direction: CLOCKWISE,
  ringAngle: 0,
};

const calm = difficultyAt(DEFAULT_DIFFICULTY, 0);
const special: Difficulty = { ...calm, specialChance: 1 };

function plan(
  overrides: Partial<SegmentStart> = {},
  difficulty: Difficulty = calm,
  rules: GameRules = DIVER_RULES,
  seed = 1
) {
  return planSegment(
    { ...START, ...overrides },
    difficulty,
    rules,
    createRng(seed)
  );
}

const isOnMark = (angle: number) =>
  Math.abs(angle / MINUTE_MARK - Math.round(angle / MINUTE_MARK)) < 1e-9;

const SEEDS = Array.from({ length: 400 }, (_, seed) => seed);

describe('planSegment', () => {
  it('starts the sweep where the hand and ring are', () => {
    const { segment } = plan({ handAngle: 123, ringAngle: 4, time: 777 });
    expect(segment).toMatchObject({
      startTime: 777,
      handAngle: 123,
      ringAngle: 4,
      direction: CLOCKWISE,
      speed: 100,
    });
  });

  it('sizes the target from the difficulty and timing rules', () => {
    // ±120 ms at 100°/s is ±12°, drawn 2° short of either edge.
    const { target } = plan().segment;
    expect(target.hitWindow).toBeCloseTo(12, 9);
    expect(target.width).toBeCloseTo(
      2 * (12 - DIVER_RULES.timing.hitToleranceDegrees),
      9
    );
    expect(target.perfectWindow).toBeCloseTo(2.8, 9);
  });

  it('sets the windows in time, however fast the hand closes in', () => {
    for (const handSpeed of [110, 200, 340]) {
      const fast = { ...calm, handSpeed };
      const { target, speed } = plan({}, fast).segment;
      expect((target.hitWindow / speed) * 1000).toBeCloseTo(
        calm.hitWindowMs,
        9
      );
      expect((target.perfectWindow / speed) * 1000).toBeCloseTo(
        calm.perfectWindowMs,
        9
      );
    }
  });

  it('never lets the Perfect window outgrow the target', () => {
    const wide = { ...calm, hitWindowMs: 40, perfectWindowMs: 90 };
    const { target } = plan({}, wide).segment;
    expect(target.perfectWindow).toBeCloseTo(target.width / 2, 9);
  });

  it('widens only the hit window when asked to', () => {
    const { timing } = DIVER_RULES;
    const plain = targetWindows(110, calm, timing);
    const wide = targetWindows(110, calm, timing, 1.5);
    expect(wide.hitWindow).toBeCloseTo(1.5 * plain.hitWindow, 9);
    expect(wide.width).toBeCloseTo(
      2 * (wide.hitWindow - timing.hitToleranceDegrees),
      9
    );
    expect(wide.perfectWindow).toBe(plain.perfectWindow);
  });

  it('rejects a window no wider than the edge tolerance', () => {
    const narrow = { ...calm, hitWindowMs: 10 };
    expect(() => plan({}, narrow)).toThrow(RangeError);
  });

  it.each([
    ['clockwise', CLOCKWISE],
    ['counter-clockwise', COUNTERCLOCKWISE],
  ] as const)('places the target ahead of a %s hand', (_, direction) => {
    for (const seed of SEEDS) {
      const { segment } = plan(
        { handAngle: 200, direction },
        calm,
        DIVER_RULES,
        seed
      );
      const ahead = forwardDistance(
        segment.handAngle,
        targetCenterAt(segment, segment.startTime),
        direction
      );
      expect(ahead).toBeCloseTo(segment.approach, 9);
      expect(segment.approach).toBeGreaterThanOrEqual(60);
      expect(segment.approach).toBeLessThan(240);
    }
  });

  it('uses the whole gap range over many seeds', () => {
    const approaches = SEEDS.map(
      seed => plan({}, calm, DIVER_RULES, seed).segment.approach
    );
    expect(Math.min(...approaches)).toBe(60);
    expect(Math.max(...approaches)).toBe(234);
  });

  it('lands on a minute mark of the ring even when hand and ring are off-grid', () => {
    for (const seed of SEEDS) {
      const { segment } = plan(
        { handAngle: 7.3, ringAngle: 2.5 },
        calm,
        DIVER_RULES,
        seed
      );
      expect(isOnMark(segment.target.mark)).toBe(true);
      expect(segment.target.mark).toBeGreaterThanOrEqual(0);
      expect(segment.target.mark).toBeLessThan(360);
      const center = targetCenterAt(segment, segment.startTime);
      expect(isOnMark(normalizeAngle(center - 2.5))).toBe(true);
    }
  });

  it('gives every player the same marks-ahead for the same draw', () => {
    // Two players reach the n-th target with the hand in different places.
    for (const seed of SEEDS) {
      const a = plan({ handAngle: 0.4 }, calm, DIVER_RULES, seed).segment;
      const b = plan({ handAngle: 5.9 }, calm, DIVER_RULES, seed).segment;
      const firstMark = (hand: number) =>
        forwardDistance(hand, 0, CLOCKWISE) % MINUTE_MARK;
      expect(a.approach - firstMark(0.4)).toBeCloseTo(
        b.approach - firstMark(5.9),
        9
      );
      expect(a.special).toBe(b.special);
    }
  });

  it('gives the player more room at high speed', () => {
    const fast = difficultyAt(DEFAULT_DIFFICULTY, 40);
    const minLead = (fast.handSpeed * DEFAULT_DIFFICULTY.gap.minLeadMs) / 1000;
    for (const seed of SEEDS) {
      const { segment } = plan({}, fast, DIVER_RULES, seed);
      expect(segment.approach).toBeGreaterThanOrEqual(minLead);
    }
  });

  it('measures reaction room by closing speed when the bezel turns towards the hand', () => {
    const fast = { ...difficultyAt(DEFAULT_DIFFICULTY, 40), specialChance: 1 };
    const closing = fast.handSpeed + fast.ringSpeed;
    const minLead = (closing * DEFAULT_DIFFICULTY.gap.minLeadMs) / 1000;
    for (const seed of SEEDS) {
      const { segment } = plan({}, fast, DIVER_RULES, seed);
      expect(segment.ringVelocity).toBe(-fast.ringSpeed);
      expect(segment.approach).toBeGreaterThanOrEqual(minLead);
    }
  });

  describe('ring motion', () => {
    const ringRules = (
      turns: GameRules['ring']['turns'],
      direction: Direction = COUNTERCLOCKWISE
    ): GameRules => ({ ...DIVER_RULES, ring: { turns, direction } });

    it('keeps the Diver bezel still on ordinary targets', () => {
      const { segment } = plan();
      expect(segment.special).toBe(false);
      expect(segment.ringVelocity).toBe(0);
    });

    it('turns the Diver bezel counter-clockwise on special targets', () => {
      for (const direction of [CLOCKWISE, COUNTERCLOCKWISE]) {
        const { segment } = plan({ direction }, special);
        expect(segment.special).toBe(true);
        expect(segment.ringVelocity).toBe(-special.ringSpeed);
      }
    });

    it('never turns a static ring', () => {
      expect(plan({}, special, ringRules('never')).segment.ringVelocity).toBe(
        0
      );
    });

    it('always turns a rotating dial', () => {
      const rules = ringRules('always', CLOCKWISE);
      expect(plan({}, calm, rules).segment.ringVelocity).toBe(calm.ringSpeed);
    });
  });

  it('is deterministic and draws exactly twice', () => {
    const first = plan({}, calm, DIVER_RULES, 99);
    expect(plan({}, calm, DIVER_RULES, 99)).toEqual(first);

    let state: RngState = createRng(99);
    state = nextFloat(state)[1];
    state = nextFloat(state)[1];
    expect(first.rng).toBe(state);
  });

  it('varies the targets between seeds', () => {
    const marks = new Set(
      SEEDS.map(seed => plan({}, calm, DIVER_RULES, seed).segment.target.mark)
    );
    expect(marks.size).toBeGreaterThan(20);
  });

  it('rejects a gap range with no minute mark in it', () => {
    const rules: GameRules = {
      ...DIVER_RULES,
      difficulty: {
        ...DIVER_RULES.difficulty,
        gap: { minDegrees: 100, maxDegrees: 104, minLeadMs: 0 },
      },
    };
    expect(() => plan({}, calm, rules)).toThrow(RangeError);
  });

  it('rejects a ring that outruns the hand', () => {
    const runaway = { ...special, ringSpeed: 500 };
    expect(() => plan({ direction: COUNTERCLOCKWISE }, runaway)).toThrow(
      RangeError
    );
  });
});
