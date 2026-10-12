import { describe, expect, it } from 'vitest';

import {
  angularDistance,
  FULL_TURN,
  MINUTE_MARK,
  normalizeAngle,
  rotate,
} from './angle.js';
import { difficultyAt } from './difficulty.js';
import { planTarget } from './plan.js';
import { createRng } from './rng.js';
import { CHRONO_TWIST, CHRONOGRAPH_RULES } from './rules/chronograph.js';
import { COUNTDOWN_TWIST, DIGITAL_RULES } from './rules/digital.js';
import { DIVER_RULES } from './rules/diver.js';
import { FIELD_RULES, HACK_TWIST } from './rules/field.js';
import { GMT_RULES, GMT_TWIST } from './rules/gmt.js';
import { GRAND_COMPLICATION_RULES } from './rules/grand-complication.js';
import { MOON_TWIST, MOONPHASE_RULES } from './rules/moonphase.js';
import { CLOUD_TWIST, PILOT_RULES } from './rules/pilot.js';
import { SWAY_TWIST, TOURBILLON_RULES } from './rules/tourbillon.js';
import type { GameRules, GmtTwistRule } from './rules/types.js';
import { targetWindows } from './spawn.js';
import {
  INITIAL_STATE,
  update,
  type GameEvent,
  type GameState,
  type PlayingState,
} from './state.js';
import {
  centerTime,
  closingSpeed,
  handAngleAt,
  isHeldAt,
  judgeTap,
  MS_PER_SECOND,
  progressAt,
  targetCenterAt,
  windowCloseTime,
  type Segment,
} from './timing.js';
import { planChrono } from './twists/chrono.js';
import { planCloud } from './twists/cloud.js';
import { countdownAt, planCountdown } from './twists/countdown.js';
import { gateSpan, gmtAngleAt, gmtGate, isBlockedAt } from './twists/gmt.js';
import { planHack } from './twists/hack.js';
import { planMoon, targetVisibilityAt } from './twists/moon.js';
import { isSwayingAt, planSway, swayAt } from './twists/sway.js';

const ALL_RULES: Readonly<Record<string, GameRules>> = {
  diver: DIVER_RULES,
  chronograph: CHRONOGRAPH_RULES,
  gmt: GMT_RULES,
  moonphase: MOONPHASE_RULES,
  tourbillon: TOURBILLON_RULES,
  grandComplication: GRAND_COMPLICATION_RULES,
  field: FIELD_RULES,
  pilot: PILOT_RULES,
  digital: DIGITAL_RULES,
};

const T0 = 5000;

/** The moment the hand is `progress` degrees past the target centre. */
function timeAtProgress(segment: Segment, progress: number): number {
  return centerTime(segment) + (progress / closingSpeed(segment)) * 1000;
}

/** Every progress in the hit window that isn't under the GMT hand. */
function clearProgress(segment: Segment, step = 0.05): number[] {
  const { hitWindow } = segment.target;
  const margin = hitWindow * 0.03;
  const clear: number[] = [];
  for (let p = -hitWindow + margin; p <= hitWindow - margin; p += step) {
    if (!isBlockedAt(segment, timeAtProgress(segment, p))) clear.push(p);
  }
  return clear;
}

type Aim = (segment: Segment, index: number) => number;

/** Aims at the centre. */
const centre: Aim = () => 0;

/** Aims at a spread of clear spots in the window, picked by `salt`. */
function spread(salt: number): Aim {
  return (segment, index) => {
    const clear = clearProgress(segment, 0.25);
    return clear[(index * 7 + salt * 13) % clear.length] ?? 0;
  };
}

interface Played {
  readonly segments: Segment[];
  readonly events: GameEvent[];
  readonly state: GameState;
}

/** Plays up to `taps` taps, aiming each at the progress `aim` picks. */
function play(rules: GameRules, seed: number, taps: number, aim: Aim): Played {
  let state: GameState = update(
    INITIAL_STATE,
    { type: 'start', time: T0, seed },
    rules
  ).state;
  const segments: Segment[] = [];
  const events: GameEvent[] = [];
  for (let tap = 0; tap < taps && state.phase === 'playing'; tap++) {
    const { segment } = state.round;
    segments.push(segment);
    const result = update(
      state,
      { type: 'tap', time: timeAtProgress(segment, aim(segment, tap)) },
      rules
    );
    events.push(...result.events);
    state = result.state;
  }
  return { segments, events, state };
}

const MULBERRY_INCREMENT = 0x6d2b79f5;

describe.each(Object.entries(ALL_RULES))('%s rules', (_, rules) => {
  const SEEDS = Array.from({ length: 60 }, (__, seed) => seed * 7919 + 3);

  it('plans 200 taps from every seed without running out of room', () => {
    for (const seed of SEEDS) {
      const { state } = play(rules, seed, 200, centre);
      expect(state.phase).toBe('playing');
    }
  });

  it('always counts a tap at the target centre as a Perfect', () => {
    for (const seed of SEEDS) {
      const { events } = play(rules, seed, 120, centre);
      const hits = events.filter(event => event.type === 'hit');
      expect(hits).toHaveLength(120);
      expect(hits.every(hit => hit.quality === 'perfect')).toBe(true);
    }
  });

  it('draws twice from the round’s generator per target, twists or not', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { state } = play(rules, seed, 80, spread(seed));
      const { round } = state as PlayingState;
      // Each draw moves mulberry32 on by the same constant.
      const draws = 2 * (round.hits + 1);
      expect(round.rng).toBe(
        (seed + Math.imul(draws, MULBERRY_INCREMENT)) >>> 0
      );
    }
  });

  it('gives every player the same targets, however they tap', () => {
    const shape = (segment: Segment) => ({
      special: segment.special,
      width: segment.target.width,
      speed: segment.speed,
      ringSpeed: Math.abs(segment.ringVelocity),
      twist: segment.twist ?? null,
      gate: segment.gmt && {
        rate: segment.gmt.rate,
        cross: segment.gmt.rate > 0 ? segment.gmt.cross : 0,
        reach: segment.gmt.reach,
      },
    });
    for (const seed of SEEDS.slice(0, 20)) {
      const a = play(rules, seed, 60, spread(1)).segments;
      const b = play(rules, seed, 60, spread(2)).segments;
      expect(a.length).toBe(60);
      // Chronograph marks sit on the ring wherever the hand stops, so only
      // their spacing is the same for everyone.
      const relative = (segment: Segment) => {
        const value = shape(segment);
        if (value.twist?.kind === 'chrono' && value.twist.leg === 'start') {
          return { ...value, twist: { span: value.twist.span } };
        }
        if (value.twist?.kind === 'chrono') return { ...value, twist: 'stop' };
        return value;
      };
      expect(a.map(relative)).toEqual(b.map(relative));
    }
  });
});

/** The GMT twist as rule sets stored before gates widened have it. */
function unwidenedGmt(): GmtTwistRule {
  const { kind, hand, guardDegrees, minBlockDegrees } = GMT_TWIST;
  return { kind, hand, guardDegrees, minBlockDegrees };
}

describe('chronograph pairs', () => {
  const pairs = () => {
    const found: Segment[] = [];
    for (let seed = 0; seed < 80; seed++) {
      for (const segment of play(CHRONOGRAPH_RULES, seed, 60, spread(seed))
        .segments) {
        if (segment.twist?.kind === 'chrono') found.push(segment);
      }
    }
    return found;
  };

  it('introduces a pair as the third target', () => {
    const { segments } = play(CHRONOGRAPH_RULES, 99, 3, centre);
    expect(segments[2]?.twist).toMatchObject({ kind: 'chrono', leg: 'start' });
  });

  it('puts the stop mark further along the travel, on a minute mark', () => {
    const all = pairs();
    expect(all.length).toBeGreaterThan(200);
    for (const segment of all) {
      const { twist, target, direction } = segment;
      if (twist?.kind !== 'chrono' || twist.leg !== 'start') continue;
      expect(twist.stopMark % MINUTE_MARK).toBeCloseTo(0, 9);
      expect(
        angularDistance(
          normalizeAngle(target.mark + direction * twist.span),
          twist.stopMark
        )
      ).toBeLessThan(1e-9);
      expect(twist.span).toBeLessThanOrEqual(CHRONO_TWIST.maxSpanDegrees);
      // The stop mark is never between the hand and the start mark.
      expect(
        segment.approach + twist.span + target.hitWindow
      ).toBeLessThanOrEqual(FULL_TURN - MINUTE_MARK);
      // A late start tap leaves the reaction lead before the stop window.
      const lead =
        ((twist.span - 2 * target.hitWindow) / closingSpeed(segment)) *
        MS_PER_SECOND;
      expect(lead).toBeGreaterThanOrEqual(CHRONO_TWIST.minLeadMs - 1e-6);
    }
  });

  it('keeps the hand going to the stop mark, then reverses it', () => {
    let state: GameState = play(CHRONOGRAPH_RULES, 99, 2, centre).state;
    const start = (state as PlayingState).round.segment;
    expect(start.twist).toMatchObject({ leg: 'start' });
    const hits = (state as PlayingState).round.hits;

    const startTap = update(
      state,
      { type: 'tap', time: timeAtProgress(start, 1.5) },
      CHRONOGRAPH_RULES
    );
    state = startTap.state;
    const stop = (state as PlayingState).round.segment;
    expect(startTap.events[0]).toMatchObject({ type: 'hit', leg: 'start' });
    expect((state as PlayingState).round.hits).toBe(hits);
    expect(stop.direction).toBe(start.direction);
    expect(stop.speed).toBe(start.speed);
    expect(stop.twist).toEqual({
      kind: 'chrono',
      leg: 'stop',
      startMark: start.target.mark,
    });
    // The stop mark's centre is where the start segment said it would be.
    const pair = start.twist;
    if (pair?.kind !== 'chrono' || pair.leg !== 'start') throw new Error();
    expect(
      angularDistance(
        targetCenterAt(stop, centerTime(stop)),
        rotate(start.ringAngle, pair.stopMark)
      )
    ).toBeLessThan(1e-9);

    const stopTap = update(
      state,
      { type: 'tap', time: centerTime(stop) },
      CHRONOGRAPH_RULES
    );
    const [stopHit] = stopTap.events;
    expect(stopHit).toMatchObject({ type: 'hit', leg: 'stop' });
    const after = (stopTap.state as PlayingState).round;
    expect(after.hits).toBe(hits + 1);
    expect(after.segment.direction).toBe(-start.direction);
    // Both taps score.
    const points = stopHit?.type === 'hit' ? stopHit.points : 0;
    expect(points).toBeGreaterThan(0);
    expect(after.score).toBe((state as PlayingState).round.score + points);
  });

  it('counts a tap between the marks as early for the stop mark', () => {
    const state = play(CHRONOGRAPH_RULES, 99, 3, centre).state;
    const stop = (state as PlayingState).round.segment;
    expect(stop.twist).toMatchObject({ leg: 'stop' });
    const { events } = update(
      state,
      { type: 'tap', time: stop.startTime + 120 },
      CHRONOGRAPH_RULES
    );
    expect(events[0]).toMatchObject({ type: 'miss', reason: 'early' });
  });

  it('ends the round if the hand passes the stop mark', () => {
    const state = play(CHRONOGRAPH_RULES, 99, 3, centre).state;
    const stop = (state as PlayingState).round.segment;
    const { events } = update(
      state,
      { type: 'tick', time: timeAtProgress(stop, 60) },
      CHRONOGRAPH_RULES
    );
    expect(events[0]).toMatchObject({ type: 'miss', reason: 'passed' });
  });
});

describe('GMT gates', () => {
  const segments = () => {
    const found: Segment[] = [];
    for (let seed = 0; seed < 60; seed++) {
      found.push(...play(GMT_RULES, seed, 60, spread(seed)).segments);
    }
    return found;
  };

  it('has a GMT hand on every target, moving only on gates', () => {
    const all = segments();
    expect(all.every(segment => segment.gmt !== undefined)).toBe(true);
    const gates = all.filter(segment => segment.twist?.kind === 'gmt');
    expect(gates.length).toBeGreaterThan(300);
    expect(gates.every(segment => (segment.gmt?.rate ?? 0) > 0)).toBe(true);
    const parked = all.filter(segment => segment.twist === undefined);
    expect(parked.every(segment => segment.gmt?.rate === 0)).toBe(true);
  });

  it('never covers the Perfect zone or the guard beyond it', () => {
    // One expect per sweep, not per point: thousands of expects made this
    // test slow enough to time out under coverage.
    for (const segment of segments()) {
      const safe = segment.target.perfectWindow + GMT_TWIST.guardDegrees;
      let covered: number | null = null;
      for (let p = -safe; p <= safe && covered === null; p += 0.05) {
        if (isBlockedAt(segment, timeAtProgress(segment, p))) covered = p;
      }
      expect(covered).toBeNull();
    }
  });

  it('covers one flank of the window on a gate, and nothing otherwise', () => {
    for (const segment of segments()) {
      const { hitWindow } = segment.target;
      const blocked: number[] = [];
      for (let p = -hitWindow; p <= hitWindow; p += 0.05) {
        if (isBlockedAt(segment, timeAtProgress(segment, p))) blocked.push(p);
      }
      if (segment.twist?.kind !== 'gmt') {
        expect(blocked).toEqual([]);
        continue;
      }
      const covered = (blocked.at(-1) ?? 0) - (blocked[0] ?? 0) + 0.05;
      expect(covered).toBeGreaterThanOrEqual(GMT_TWIST.minBlockDegrees - 0.1);
      // Waiting gates cover the early flank, beaten ones the late flank.
      const early = blocked.every(p => p < 0);
      const late = blocked.every(p => p > 0);
      expect(segment.twist.side === 'wait' ? early : late).toBe(true);
    }
  });

  it('reports exactly the part of the window the hand covers', () => {
    for (const segment of segments()) {
      const span = gateSpan(segment);
      if (segment.twist?.kind !== 'gmt') {
        expect(span).toBeNull();
        continue;
      }
      const { hitWindow } = segment.target;
      let disagrees: number | null = null;
      for (
        let p = -hitWindow;
        p <= hitWindow && disagrees === null;
        p += 0.05
      ) {
        const covered = span !== null && p >= span.from && p <= span.to;
        if (isBlockedAt(segment, timeAtProgress(segment, p)) !== covered) {
          disagrees = p;
        }
      }
      expect(disagrees).toBeNull();
    }
  });

  it('covers enough of the drawn target to see', () => {
    const { windowScale } = GMT_TWIST;
    for (const segment of segments()) {
      const span = gateSpan(segment);
      if (!span) continue;
      // The covered part of the window that lies on the drawn target, which
      // stops short of the window by the edge tolerance.
      const half = segment.target.width / 2;
      const drawn = Math.min(half, span.to) - Math.max(-half, span.from);
      const unwidened = segment.target.hitWindow / windowScale;
      expect(drawn).toBeGreaterThanOrEqual(
        (windowScale - 1) * unwidened - 1e-9
      );
    }
  });

  it('keeps the open part of the gated flank as it was before it widened', () => {
    const at = (hits: number, scale: number): Segment => {
      const difficulty = difficultyAt(GMT_RULES.difficulty, hits);
      const closing = difficulty.handSpeed;
      return {
        startTime: 0,
        handAngle: 0,
        direction: 1,
        speed: closing,
        ringAngle: 0,
        ringVelocity: 0,
        target: {
          mark: 120,
          ...targetWindows(closing, difficulty, GMT_RULES.timing, scale),
        },
        approach: 120,
        special: true,
      };
    };
    const unwidened = unwidenedGmt();
    for (const hits of [0, 10, 30, 60]) {
      for (const depth of [0, 0.4, 1]) {
        const wide = gmtGate(
          at(hits, GMT_TWIST.windowScale),
          GMT_TWIST,
          0,
          depth
        );
        const plain = gmtGate(at(hits, 1), unwidened, 0, depth);
        expect(wide.gate.clear).toBeCloseTo(plain.gate.clear, 9);
      }
    }
  });

  it('widens a gate’s hit window, never its Perfect window', () => {
    const unwidenedTwist = unwidenedGmt();
    const unwidened: GameRules = {
      ...GMT_RULES,
      twists: [unwidenedTwist],
    };
    const start = {
      time: T0,
      handAngle: 0,
      direction: 1,
      ringAngle: 0,
    } as const;
    const planned = (
      rules: GameRules,
      seed: number,
      target: number,
      hits: number
    ) =>
      planTarget(
        start,
        { ...difficultyAt(rules.difficulty, hits), specialChance: 0 },
        rules,
        createRng(seed),
        { seed, target }
      ).segment;
    // The introduction is always a gate; nothing else is, without a draw.
    const gated = GMT_RULES.introduceAt ?? 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const wide = planned(GMT_RULES, seed, gated, 20);
      const plain = planned(unwidened, seed, gated, 20);
      expect(wide.twist?.kind).toBe('gmt');
      expect(wide.target.hitWindow).toBeCloseTo(
        GMT_TWIST.windowScale * plain.target.hitWindow,
        9
      );
      expect(wide.target.perfectWindow).toBe(plain.target.perfectWindow);
      expect(wide.approach).toBe(plain.approach);
      expect(planned(GMT_RULES, seed, 0, 20).target).toEqual(
        planned(unwidened, seed, 0, 20).target
      );
    }
  });

  it('judges a tap under the GMT hand as blocked', () => {
    const state = play(GMT_RULES, 4, 2, centre).state;
    const gate = (state as PlayingState).round.segment;
    expect(gate.twist?.kind).toBe('gmt');
    const { hitWindow } = gate.target;
    const flank =
      gate.twist?.kind === 'gmt' && gate.twist.side === 'wait'
        ? -hitWindow + 0.5
        : hitWindow - 0.5;
    const time = timeAtProgress(gate, flank);
    expect(isBlockedAt(gate, time)).toBe(true);
    const { events } = update(state, { type: 'tap', time }, GMT_RULES);
    expect(events[0]).toMatchObject({ type: 'miss', reason: 'blocked' });
  });

  it('keeps an early tap early, even under the GMT hand', () => {
    const state = play(GMT_RULES, 4, 2, centre).state;
    const gate = (state as PlayingState).round.segment;
    const time = timeAtProgress(gate, -gate.target.hitWindow - 1);
    const { events } = update(state, { type: 'tap', time }, GMT_RULES);
    expect(events[0]).toMatchObject({ type: 'miss', reason: 'early' });
  });

  it('moves a parked hand off a target it would touch', () => {
    for (const segment of segments()) {
      if (segment.twist !== undefined) continue;
      const angle = gmtAngleAt(segment, segment.startTime) ?? 0;
      const centreAt = targetCenterAt(segment, centerTime(segment));
      expect(angularDistance(angle, centreAt)).toBeGreaterThan(
        segment.gmt?.reach ?? 0
      );
    }
  });

  it('measures the cover across 12 o’clock', () => {
    const segment: Segment = {
      startTime: 0,
      handAngle: 300,
      direction: 1,
      speed: 110,
      ringAngle: 0,
      ringVelocity: 0,
      target: { mark: 354, width: 20, hitWindow: 12, perfectWindow: 3 },
      approach: 54,
      special: true,
      twist: { kind: 'gmt', side: 'wait', clear: 7 },
      gmt: { angle: 354, rate: 0.5, cross: -30, reach: 11.5 },
    };
    // Twelve degrees before the centre the hand points at 3°, across 0°.
    const time = timeAtProgress(segment, -12);
    expect(gmtAngleAt(segment, time)).toBeCloseTo(3, 9);
    expect(isBlockedAt(segment, time)).toBe(true);
    expect(isBlockedAt(segment, timeAtProgress(segment, 14))).toBe(false);
  });
});

describe('Moonphase hiding', () => {
  const hidden = () => {
    const found: Segment[] = [];
    for (let seed = 0; seed < 60; seed++) {
      for (const segment of play(MOONPHASE_RULES, seed, 60, spread(seed))
        .segments) {
        if (segment.twist?.kind === 'moon') found.push(segment);
      }
    }
    return found;
  };

  it('shows the target in full for a while before it fades', () => {
    const all = hidden();
    expect(all.length).toBeGreaterThan(300);
    for (const segment of all) {
      const readUntil = segment.startTime + MOON_TWIST.readMs;
      expect(targetVisibilityAt(segment, readUntil)).toBe(1);
    }
  });

  it('is gone well before its hit window opens', () => {
    for (const segment of hidden()) {
      const { hitWindow } = segment.target;
      const gone = timeAtProgress(
        segment,
        segment.twist?.kind === 'moon' ? segment.twist.hideFrom : 0
      );
      const opens = timeAtProgress(segment, -hitWindow);
      expect(opens - gone).toBeGreaterThanOrEqual(
        MOON_TWIST.minHiddenMs - 1e-6
      );
      expect(targetVisibilityAt(segment, gone)).toBeCloseTo(0, 9);
      expect(targetVisibilityAt(segment, centerTime(segment))).toBe(0);
    }
  });

  it('fades out steadily and never comes back', () => {
    const [segment] = hidden();
    if (!segment) throw new Error('no hidden target');
    let last = 1;
    for (let p = -segment.approach; p < segment.target.hitWindow; p += 0.5) {
      const visibility = targetVisibilityAt(
        segment,
        timeAtProgress(segment, p)
      );
      expect(visibility).toBeLessThanOrEqual(last);
      last = visibility;
    }
  });

  it('still judges the hidden target by where it was', () => {
    const state = play(MOONPHASE_RULES, 5, 2, centre).state;
    const segment = (state as PlayingState).round.segment;
    expect(segment.twist?.kind).toBe('moon');
    const { events } = update(
      state,
      { type: 'tap', time: centerTime(segment) },
      MOONPHASE_RULES
    );
    expect(events[0]).toMatchObject({ type: 'hit', quality: 'perfect' });
  });

  it('leaves plain targets in view', () => {
    const { segments } = play(MOONPHASE_RULES, 5, 2, centre);
    const [first] = segments;
    if (!first) throw new Error();
    expect(targetVisibilityAt(first, centerTime(first))).toBe(1);
  });
});

describe('Tourbillon sway', () => {
  let found: Segment[] | null = null;
  /** Every sway of 200 seeded rounds, played once. */
  const sways = () => {
    found ??= Array.from({ length: 200 }, (_, seed) =>
      play(TOURBILLON_RULES, seed, 40, spread(seed)).segments.filter(
        segment => segment.twist?.kind === 'sway'
      )
    ).flat();
    return found;
  };
  const swayOf = (segment: Segment) => {
    if (segment.twist?.kind !== 'sway') throw new Error('no sway');
    return segment.twist;
  };
  /** The moment the sway is `share` of the way through. */
  const timeAtShare = (segment: Segment, share: number) => {
    const { from, length } = swayOf(segment);
    return timeAtProgress(segment, from + share * length);
  };

  it('introduces a sway as the third target, and never turns the ring', () => {
    const { segments } = play(TOURBILLON_RULES, 99, 3, centre);
    expect(segments[2]?.twist?.kind).toBe('sway');
    const all = sways();
    expect(all.length).toBeGreaterThan(1000);
    expect(all.every(segment => segment.ringVelocity === 0)).toBe(true);
  });

  it('is still, and 0, outside the sway', () => {
    for (const segment of sways().slice(0, 300)) {
      const { from, length } = swayOf(segment);
      for (const progress of [from - 20, from - 0.01, from + length + 0.01]) {
        const time = timeAtProgress(segment, progress);
        expect(swayAt(segment, time)).toBe(0);
        expect(isSwayingAt(segment, time)).toBe(false);
      }
      // Right at its ends it is at rest too.
      for (const share of [0, 1]) {
        expect(swayAt(segment, timeAtShare(segment, share))).toBeCloseTo(0, 9);
      }
      expect(isSwayingAt(segment, timeAtShare(segment, 0.5))).toBe(true);
    }
    const [plain] = play(TOURBILLON_RULES, 99, 1, centre).segments;
    if (!plain) throw new Error();
    expect(swayAt(plain, centerTime(plain))).toBe(0);
  });

  it('rocks smoothly within its tilt, from rest back to rest', () => {
    for (const segment of sways()) {
      const { tilt, swings } = swayOf(segment);
      expect(Math.abs(tilt)).toBeGreaterThanOrEqual(SWAY_TWIST.tilt.min);
      expect(Math.abs(tilt)).toBeLessThanOrEqual(SWAY_TWIST.tilt.max);
      expect(swings).toBe(SWAY_TWIST.swings);
      const STEPS = 200;
      // No step changes it more than its steepest slope allows: it never
      // jumps.
      const limit = (Math.abs(tilt) * Math.PI * (1 + 2 * swings)) / STEPS;
      let last = 0;
      let largest = 0;
      let steepest = 0;
      for (let step = 1; step <= STEPS; step++) {
        const value = swayAt(segment, timeAtShare(segment, step / STEPS));
        largest = Math.max(largest, Math.abs(value));
        steepest = Math.max(steepest, Math.abs(value - last));
        last = value;
      }
      expect(largest).toBeLessThanOrEqual(Math.abs(tilt) + 1e-9);
      expect(steepest).toBeLessThanOrEqual(limit + 1e-9);
      // Flat at both ends: barely moving a hair inside them.
      for (const share of [1e-4, 1 - 1e-4]) {
        const value = swayAt(segment, timeAtShare(segment, share));
        expect(Math.abs(value)).toBeLessThan(Math.abs(tilt) * 1e-5);
      }
      // It turns the way of its tilt first, and the full tilt (the other way)
      // mid-sway.
      expect(Math.sign(swayAt(segment, timeAtShare(segment, 0.1)))).toBe(
        Math.sign(tilt)
      );
      expect(Math.abs(swayAt(segment, timeAtShare(segment, 0.5)))).toBeCloseTo(
        Math.abs(tilt),
        9
      );
    }
  });

  it('turns both ways first, as the rolls fall', () => {
    const firsts = new Set(
      sways().map(segment => Math.sign(swayOf(segment).tilt))
    );
    expect(firsts).toEqual(new Set([1, -1]));
  });

  it('is rocking as the hand reaches the centre', () => {
    for (const segment of sways()) {
      const { from, length } = swayOf(segment);
      expect(from).toBeLessThan(0);
      expect(from + length).toBeGreaterThan(0);
      const share = -from / length;
      expect(share).toBeGreaterThanOrEqual(SWAY_TWIST.centre.min - 1e-9);
      expect(share).toBeLessThanOrEqual(SWAY_TWIST.centre.max + 1e-9);
      expect(isSwayingAt(segment, centerTime(segment))).toBe(true);
    }
  });

  it('starts a little after the sweep, never before it', () => {
    for (const segment of sways()) {
      const { from } = swayOf(segment);
      const lead =
        ((from + segment.approach) / closingSpeed(segment)) * MS_PER_SECOND;
      expect(lead).toBeGreaterThanOrEqual(SWAY_TWIST.leadMs - 1e-6);
      expect(swayAt(segment, segment.startTime)).toBe(0);
    }
  });

  it('lasts as long as the rule says, unless the sweep is too short', () => {
    const durations = sways().map(
      segment =>
        (swayOf(segment).length / closingSpeed(segment)) * MS_PER_SECOND
    );
    for (const duration of durations) {
      expect(duration).toBeLessThanOrEqual(SWAY_TWIST.durationMs.max + 1e-6);
    }
    const full = durations.filter(
      duration => duration >= SWAY_TWIST.durationMs.min - 1e-6
    );
    expect(full.length).toBeGreaterThan(durations.length / 2);
    // Even a shortened sway is slow enough to read as a rock, not a shake.
    expect(Math.min(...durations)).toBeGreaterThan(700);
  });

  it('shortens a sway that would start too soon', () => {
    const near: Segment = {
      startTime: 0,
      handAngle: 0,
      direction: 1,
      speed: 200,
      ringAngle: 0,
      ringVelocity: 0,
      target: { mark: 60, width: 20, hitWindow: 12, perfectWindow: 3 },
      approach: 60,
      special: true,
    };
    // 60° at 200°/s: 300 ms, 150 of them before it may start.
    const sway = planSway(near, 10, SWAY_TWIST, 1, 0.75, 0);
    expect(sway.from).toBeCloseTo(-30, 9);
    expect(sway.length).toBeCloseTo(30 / SWAY_TWIST.centre.min, 9);
    expect(sway.tilt).toBeCloseTo(
      (SWAY_TWIST.tilt.min + SWAY_TWIST.tilt.max) / 2,
      9
    );
    expect(planSway(near, 10, SWAY_TWIST, 1, 0.25, 0).tilt).toBeCloseTo(
      -sway.tilt,
      9
    );
  });

  it('moves with the sweep through a pause', () => {
    const state = play(TOURBILLON_RULES, 99, 2, centre).state;
    const segment = (state as PlayingState).round.segment;
    const pauseAt = timeAtShare(segment, 0.3);
    const paused = update(
      state,
      { type: 'pause', time: pauseAt },
      TOURBILLON_RULES
    ).state;
    const resumed = update(
      paused,
      { type: 'resume', time: pauseAt + 4321 },
      TOURBILLON_RULES
    ).state;
    const shifted = (resumed as PlayingState).round.segment;
    expect(shifted.twist).toEqual(segment.twist);
    for (const share of [0.1, 0.3, 0.6, 0.9]) {
      const time = timeAtShare(segment, share);
      expect(swayAt(shifted, time + 4321)).toBeCloseTo(
        swayAt(segment, time),
        9
      );
    }
  });

  it('never changes how a tap is judged', () => {
    for (const segment of sways().slice(0, 400)) {
      const still: Segment = {
        startTime: segment.startTime,
        handAngle: segment.handAngle,
        direction: segment.direction,
        speed: segment.speed,
        ringAngle: segment.ringAngle,
        ringVelocity: segment.ringVelocity,
        target: segment.target,
        approach: segment.approach,
        special: false,
      };
      const { hitWindow } = segment.target;
      for (let p = -hitWindow - 3; p <= hitWindow + 3; p += 0.25) {
        const time = timeAtProgress(segment, p);
        expect(judgeTap(segment, time)).toEqual(judgeTap(still, time));
      }
      expect(judgeTap(segment, centerTime(segment))).toMatchObject({
        kind: 'hit',
        quality: 'perfect',
      });
    }
  });
});

describe('Field hacking', () => {
  let found: Segment[] | null = null;
  /** Every hack of 200 seeded rounds, played once. */
  const hacks = () => {
    found ??= Array.from({ length: 200 }, (_, seed) =>
      play(FIELD_RULES, seed, 40, spread(seed)).segments.filter(
        segment => segment.twist?.kind === 'hack'
      )
    ).flat();
    return found;
  };
  const hackOf = (segment: Segment) => {
    if (segment.twist?.kind !== 'hack') throw new Error('no hack');
    return segment.twist;
  };
  /** The same sweep, never stopping. */
  const running = (segment: Segment): Segment => ({
    startTime: segment.startTime,
    handAngle: segment.handAngle,
    direction: segment.direction,
    speed: segment.speed,
    ringAngle: segment.ringAngle,
    ringVelocity: segment.ringVelocity,
    target: segment.target,
    approach: segment.approach,
    special: false,
  });
  /** When the hand stops. */
  const stopTime = (segment: Segment) =>
    segment.startTime +
    ((segment.approach + hackOf(segment).at) / closingSpeed(segment)) *
      MS_PER_SECOND;

  it('introduces a hack as the third target, and never turns the ring', () => {
    const { segments } = play(FIELD_RULES, 99, 3, centre);
    expect(segments[2]?.twist?.kind).toBe('hack');
    const all = hacks();
    expect(all.length).toBeGreaterThan(1000);
    expect(all.every(segment => segment.ringVelocity === 0)).toBe(true);
  });

  it('stops short of the window, after running a little', () => {
    for (const segment of hacks()) {
      const { at, holdMs } = hackOf(segment);
      const closing = closingSpeed(segment);
      const ms = (degrees: number) => (degrees / closing) * MS_PER_SECOND;
      const short = ms(-at - segment.target.hitWindow);
      expect(short).toBeGreaterThanOrEqual(HACK_TWIST.leadMs.min - 1e-6);
      expect(short).toBeLessThanOrEqual(HACK_TWIST.leadMs.max + 1e-6);
      expect(ms(segment.approach + at)).toBeGreaterThanOrEqual(
        HACK_TWIST.runMs - 1e-6
      );
      expect(holdMs).toBeGreaterThanOrEqual(HACK_TWIST.holdMs.min);
      expect(holdMs).toBeLessThanOrEqual(HACK_TWIST.holdMs.max);
    }
  });

  it('stands still for its hold, then runs on at the same speed', () => {
    for (const segment of hacks().slice(0, 300)) {
      const { holdMs } = hackOf(segment);
      const stop = stopTime(segment);
      const angle = handAngleAt(segment, stop);
      for (const share of [0.01, 0.25, 0.5, 0.99]) {
        const time = stop + share * holdMs;
        expect(handAngleAt(segment, time)).toBeCloseTo(angle, 6);
        expect(isHeldAt(segment, time)).toBe(true);
      }
      expect(isHeldAt(segment, stop - 1)).toBe(false);
      expect(isHeldAt(segment, stop + holdMs + 1)).toBe(false);
      // Before the stop and after the hold, it is where a running hand is,
      // late by the hold.
      const plain = running(segment);
      expect(handAngleAt(segment, stop - 50)).toBeCloseTo(
        handAngleAt(plain, stop - 50),
        6
      );
      expect(handAngleAt(segment, stop + holdMs + 50)).toBeCloseTo(
        handAngleAt(plain, stop + 50),
        6
      );
    }
  });

  it('puts the centre and the window’s close back by the hold', () => {
    for (const segment of hacks().slice(0, 300)) {
      const { holdMs } = hackOf(segment);
      const plain = running(segment);
      expect(centerTime(segment) - centerTime(plain)).toBeCloseTo(holdMs, 6);
      expect(windowCloseTime(segment) - windowCloseTime(plain)).toBeCloseTo(
        holdMs,
        6
      );
      expect(judgeTap(segment, centerTime(segment))).toMatchObject({
        kind: 'hit',
        quality: 'perfect',
      });
    }
  });

  it('judges a tap while the hand stands as early', () => {
    for (const segment of hacks().slice(0, 300)) {
      const middle = stopTime(segment) + hackOf(segment).holdMs / 2;
      expect(judgeTap(segment, middle)).toMatchObject({
        kind: 'miss',
        reason: 'early',
      });
      // At the centre it is a Perfect, as a hand that never stopped is.
      const hacked = judgeTap(segment, centerTime(segment));
      expect(hacked).toMatchObject({ kind: 'hit', quality: 'perfect' });
      if (hacked.kind === 'hit') expect(hacked.offset).toBeCloseTo(0, 9);
    }
    const state = play(FIELD_RULES, 99, 2, centre).state as PlayingState;
    const { segment } = state.round;
    const tapped = update(
      state,
      { type: 'tap', time: stopTime(segment) + 10 },
      FIELD_RULES
    );
    expect(tapped.state.phase).toBe('gameOver');
    expect(tapped.events).toContainEqual(
      expect.objectContaining({ type: 'miss', reason: 'early' })
    );
  });

  it('stands through a pause as before', () => {
    const state = play(FIELD_RULES, 99, 2, centre).state as PlayingState;
    const { segment } = state.round;
    const pauseAt = stopTime(segment) + 100;
    const paused = update(
      state,
      { type: 'pause', time: pauseAt },
      FIELD_RULES
    ).state;
    const resumed = update(
      paused,
      { type: 'resume', time: pauseAt + 4321 },
      FIELD_RULES
    ).state as PlayingState;
    const shifted = resumed.round.segment;
    expect(shifted.twist).toEqual(segment.twist);
    for (const offset of [-100, 0, 200, 900]) {
      const time = pauseAt + offset;
      expect(handAngleAt(shifted, time + 4321)).toBeCloseTo(
        handAngleAt(segment, time),
        9
      );
      expect(isHeldAt(shifted, time + 4321)).toBe(isHeldAt(segment, time));
    }
  });

  it('runs straight through a sweep too short to stop in', () => {
    const near: Segment = {
      startTime: 0,
      handAngle: 0,
      direction: 1,
      speed: 200,
      ringAngle: 0,
      ringVelocity: 0,
      target: { mark: 18, width: 20, hitWindow: 12, perfectWindow: 3 },
      approach: 18,
      special: true,
    };
    // 3 marks: 18° at 200°/s, all but nothing of it needed to run first.
    expect(planHack(near, 3, HACK_TWIST, 0.5, 0.5)).toBeNull();
    const far = { ...near, approach: 120 };
    expect(planHack(far, 20, HACK_TWIST, 0, 1)).toEqual({
      kind: 'hack',
      at: -(12 + (200 * HACK_TWIST.leadMs.max) / 1000),
      holdMs: HACK_TWIST.holdMs.min,
    });
  });
});

describe('Pilot clouds', () => {
  let found: Segment[] | null = null;
  /** Every clouded sweep of 200 seeded rounds, played once. */
  const clouds = () => {
    found ??= Array.from({ length: 200 }, (_, seed) =>
      play(PILOT_RULES, seed, 40, spread(seed)).segments.filter(
        segment => segment.twist?.kind === 'cloud'
      )
    ).flat();
    return found;
  };
  const coverOf = (segment: Segment) => {
    if (segment.twist?.kind !== 'cloud') throw new Error('no cloud');
    return segment.twist;
  };
  const ms = (segment: Segment, degrees: number) =>
    (degrees / closingSpeed(segment)) * MS_PER_SECOND;

  it('introduces a cloud as the third target, and never turns the ring', () => {
    const { segments } = play(PILOT_RULES, 99, 3, centre);
    expect(segments[2]?.twist?.kind).toBe('cloud');
    const all = clouds();
    expect(all.length).toBeGreaterThan(1000);
    expect(all.every(segment => segment.ringVelocity === 0)).toBe(true);
  });

  it('lets the hand run in clear air first, then clouds the way in', () => {
    for (const segment of clouds()) {
      const { from, fade } = coverOf(segment);
      expect(ms(segment, segment.approach + from - fade)).toBeGreaterThan(
        CLOUD_TWIST.readMs - 1e-6
      );
      const clouded = ms(segment, -from);
      expect(clouded).toBeGreaterThanOrEqual(CLOUD_TWIST.minCloudMs - 1e-6);
      expect(clouded).toBeLessThanOrEqual(CLOUD_TWIST.cloudMs.max + 1e-6);
    }
  });

  it('never changes how a tap is judged', () => {
    for (const segment of clouds().slice(0, 400)) {
      const clear: Segment = {
        startTime: segment.startTime,
        handAngle: segment.handAngle,
        direction: segment.direction,
        speed: segment.speed,
        ringAngle: segment.ringAngle,
        ringVelocity: segment.ringVelocity,
        target: segment.target,
        approach: segment.approach,
        special: false,
      };
      const { hitWindow } = segment.target;
      for (let p = -hitWindow - 3; p <= hitWindow + 3; p += 0.25) {
        const time = timeAtProgress(segment, p);
        expect(judgeTap(segment, time)).toEqual(judgeTap(clear, time));
      }
    }
  });

  it('brings no cloud on a sweep too short for it', () => {
    const near: Segment = {
      startTime: 0,
      handAngle: 0,
      direction: 1,
      speed: 200,
      ringAngle: 0,
      ringVelocity: 0,
      target: { mark: 18, width: 20, hitWindow: 12, perfectWindow: 3 },
      approach: 18,
      special: true,
    };
    expect(planCloud(near, 3, CLOUD_TWIST, 0.5)).toBeNull();
    const far = { ...near, approach: 240 };
    expect(planCloud(far, 40, CLOUD_TWIST, 1)).toEqual({
      kind: 'cloud',
      from: -(200 * CLOUD_TWIST.cloudMs.max) / 1000,
      fade: CLOUD_TWIST.fadeDegrees,
    });
  });
});

describe('Digital countdowns', () => {
  let found: Segment[] | null = null;
  /** Every counted-down sweep of 200 seeded rounds, played once. */
  const timers = () => {
    found ??= Array.from({ length: 200 }, (_, seed) =>
      play(DIGITAL_RULES, seed, 40, spread(seed)).segments.filter(
        segment => segment.twist?.kind === 'countdown'
      )
    ).flat();
    return found;
  };
  const timerOf = (segment: Segment) => {
    if (segment.twist?.kind !== 'countdown') throw new Error('no countdown');
    return segment.twist;
  };

  it('introduces a countdown as the third target, and never turns the ring', () => {
    const { segments } = play(DIGITAL_RULES, 99, 3, centre);
    expect(segments[2]?.twist?.kind).toBe('countdown');
    const all = timers();
    expect(all.length).toBeGreaterThan(1000);
    expect(all.every(segment => segment.ringVelocity === 0)).toBe(true);
  });

  it('beats at the rule’s pace, after the sweep has run a little', () => {
    for (const segment of timers()) {
      const { beats, beatMs } = timerOf(segment);
      expect(beats).toBe(COUNTDOWN_TWIST.beats);
      expect(beatMs).toBeGreaterThanOrEqual(COUNTDOWN_TWIST.beatMs.min);
      expect(beatMs).toBeLessThanOrEqual(COUNTDOWN_TWIST.beatMs.max);
      const firstBeat = centerTime(segment) - beats * beatMs;
      expect(firstBeat - segment.startTime).toBeGreaterThanOrEqual(
        COUNTDOWN_TWIST.readMs - 1
      );
    }
  });

  it('counts 3, 2, 1 to the centre, and 0 on it and after', () => {
    for (const segment of timers().slice(0, 300)) {
      const { beatMs } = timerOf(segment);
      const centreAt = centerTime(segment);
      const at = (beatsToGo: number, after = 0) =>
        countdownAt(segment, centreAt - beatsToGo * beatMs + after);
      expect(at(3, -1)).toBeNull();
      expect(at(3, 1)?.count).toBe(3);
      expect(at(3, 1)?.sinceBeat).toBeCloseTo(1, 6);
      expect(at(2, 1)?.count).toBe(2);
      expect(at(1, 10)?.count).toBe(1);
      expect(at(1, 10)?.sinceBeat).toBeCloseTo(10, 6);
      expect(at(0)).toEqual({ count: 0, sinceBeat: 0 });
      expect(at(0, 40)?.count).toBe(0);
      expect(at(0, 40)?.sinceBeat).toBeCloseTo(40, 6);
      // The marker stays in sight all the way.
      expect(targetVisibilityAt(segment, centreAt)).toBe(1);
    }
    const [plain] = play(DIGITAL_RULES, 99, 1, centre).segments;
    if (!plain) throw new Error();
    expect(countdownAt(plain, centerTime(plain))).toBeNull();
  });

  it('never changes how a tap is judged', () => {
    for (const segment of timers().slice(0, 400)) {
      const plain: Segment = {
        startTime: segment.startTime,
        handAngle: segment.handAngle,
        direction: segment.direction,
        speed: segment.speed,
        ringAngle: segment.ringAngle,
        ringVelocity: segment.ringVelocity,
        target: segment.target,
        approach: segment.approach,
        special: false,
      };
      const { hitWindow } = segment.target;
      for (let p = -hitWindow - 3; p <= hitWindow + 3; p += 0.5) {
        const time = timeAtProgress(segment, p);
        expect(judgeTap(segment, time)).toEqual(judgeTap(plain, time));
      }
    }
  });

  it('keeps to the drawn pace, slows for nothing, and skips a sweep too short', () => {
    const near: Segment = {
      startTime: 0,
      handAngle: 0,
      direction: 1,
      speed: 200,
      ringAngle: 0,
      ringVelocity: 0,
      target: { mark: 18, width: 20, hitWindow: 12, perfectWindow: 3 },
      approach: 18,
      special: true,
    };
    expect(planCountdown(near, 3, COUNTDOWN_TWIST, 0.5)).toBeNull();
    const far = { ...near, approach: 300 };
    expect(planCountdown(far, 50, COUNTDOWN_TWIST, 1)).toEqual({
      kind: 'countdown',
      beats: 3,
      beatMs: COUNTDOWN_TWIST.beatMs.max,
    });
    // 30 marks at 200°/s: 900 ms, 750 after the first stretch, so 250 a beat.
    expect(planCountdown(far, 30, COUNTDOWN_TWIST, 1)).toEqual({
      kind: 'countdown',
      beats: 3,
      beatMs: 250,
    });
  });
});

describe('Endless on the Grand Complication', () => {
  const all = () => {
    const found: Segment[] = [];
    for (let seed = 0; seed < 60; seed++) {
      found.push(
        ...play(GRAND_COMPLICATION_RULES, seed, 60, spread(seed)).segments
      );
    }
    return found;
  };

  it('mixes every twist, one at a time', () => {
    const segments = all();
    const kinds = new Set(
      segments.map(
        segment =>
          segment.twist?.kind ?? (segment.ringVelocity !== 0 ? 'turn' : 'plain')
      )
    );
    expect([...kinds].sort()).toEqual([
      'chrono',
      'gmt',
      'moon',
      'plain',
      'sway',
      'turn',
    ]);
    // Only a turn moves the bezel, and it can turn either way.
    for (const segment of segments) {
      if (segment.twist) expect(segment.ringVelocity).toBe(0);
    }
    const directions = new Set(
      segments
        .filter(segment => segment.ringVelocity !== 0)
        .map(segment => Math.sign(segment.ringVelocity))
    );
    expect(directions).toEqual(new Set([1, -1]));
  });

  it('never lets a parked GMT hand touch a target, not even on its way', () => {
    for (const segment of all()) {
      if (segment.twist?.kind === 'gmt') continue;
      const { hitWindow } = segment.target;
      // From the start of the sweep, while a turning bezel carries it.
      for (let p = -segment.approach; p <= hitWindow; p += 1.5) {
        expect(isBlockedAt(segment, timeAtProgress(segment, p))).toBe(false);
      }
    }
  });

  it('introduces a twist as the second target', () => {
    const [, second] = play(GRAND_COMPLICATION_RULES, 1, 2, centre).segments;
    expect(second?.special).toBe(true);
  });
});

describe('hit events', () => {
  it('report the timing error in milliseconds', () => {
    const state = play(DIVER_RULES, 1, 0, centre).state;
    const segment = (state as PlayingState).round.segment;
    const { events } = update(
      state,
      { type: 'tap', time: centerTime(segment) - 12 },
      DIVER_RULES
    );
    expect(events[0]).toMatchObject({ type: 'hit', leg: 'single' });
    const [hit] = events;
    if (hit?.type !== 'hit') throw new Error();
    expect(hit.ms).toBeCloseTo(-12, 9);
    expect(progressAt(segment, centerTime(segment) - 12)).toBeCloseTo(
      hit.offset,
      9
    );
  });
});

describe('twist edge cases', () => {
  const segment: Segment = {
    startTime: 0,
    handAngle: 0,
    direction: 1,
    speed: 300,
    ringAngle: 0,
    ringVelocity: 0,
    target: { mark: 180, width: 10, hitWindow: 7, perfectWindow: 2 },
    approach: 180,
    special: true,
  };

  it('leaves a target plain when no chronograph span fits', () => {
    // Forty marks ahead at 300°/s, the stop mark would lap the hand.
    expect(planChrono(segment, 40, CHRONO_TWIST, 0.5)).toBeNull();
  });

  it('leaves a target in view when it would hide too late to matter', () => {
    const near = { ...segment, approach: 60 };
    expect(planMoon(near, 10, MOON_TWIST, 0.5)).toBeNull();
  });

  it('hides a target at once when it has no fade', () => {
    const hiding: Segment = {
      ...segment,
      twist: { kind: 'moon', hideFrom: -50, fade: 0 },
    };
    expect(targetVisibilityAt(hiding, timeAtProgress(hiding, -51))).toBe(1);
    expect(targetVisibilityAt(hiding, timeAtProgress(hiding, -49))).toBe(0);
  });

  it('has no GMT hand on watches without one', () => {
    expect(gmtAngleAt(segment, 100)).toBeNull();
    expect(isBlockedAt(segment, centerTime(segment))).toBe(false);
  });
});
