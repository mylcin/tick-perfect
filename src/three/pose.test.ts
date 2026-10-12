import { describe, expect, it } from 'vitest';

import {
  angularDistance,
  centerTime,
  DIGITAL_RULES,
  closingSpeed,
  DIVER_RULES,
  FIELD_RULES,
  GMT_RULES,
  handAngleAt,
  INITIAL_STATE,
  PILOT_RULES,
  isBlockedAt,
  ringAngleAt,
  rotate,
  signedDelta,
  swayAt,
  targetCenterAt,
  TOURBILLON_RULES,
  update,
  windowCloseTime,
  type GameState,
  type Segment,
} from '../game';
import { poseFromGame } from './pose';

const T0 = 5000;
const IDLE = { idleSeconds: 0 };

function started(): GameState {
  return update(
    INITIAL_STATE,
    { type: 'start', time: T0, seed: 1 },
    DIVER_RULES
  ).state;
}

describe('poseFromGame', () => {
  it('rests the hands, easing them, outside a round', () => {
    expect(poseFromGame(INITIAL_STATE, T0, { idleSeconds: 123 })).toEqual({
      seconds: 123,
      ring: 0,
      target: null,
      eased: true,
      hit: null,
      crack: null,
      chrono: null,
      gmt: null,
      sway: null,
      hacked: false,
      cloud: null,
      countdown: null,
    });
  });

  it('follows the hand and the target during a round', () => {
    const state = started();
    if (state.phase !== 'playing') throw new Error('not playing');
    const { segment } = state.round;
    const pose = poseFromGame(state, T0 + 250, IDLE);
    expect(pose.eased).toBe(false);
    expect(pose.seconds).toBeCloseTo(handAngleAt(segment, T0 + 250), 9);
    expect(pose.target).toEqual({
      mark: segment.target.mark,
      width: segment.target.width,
      perfectWindow: segment.target.perfectWindow,
      role: 'single',
      visibility: 1,
      gate: null,
    });
  });

  it('turns the bezel so the drawn target sits where it is scored', () => {
    const state = started();
    if (state.phase !== 'playing') throw new Error('not playing');
    const segment = {
      ...state.round.segment,
      ringAngle: 40,
      ringVelocity: -30,
    };
    const turning: GameState = {
      ...state,
      round: { ...state.round, segment },
    };
    const time = T0 + 400;
    const pose = poseFromGame(turning, time, IDLE);
    if (!pose.target) throw new Error('no target');

    expect(pose.ring).toBeCloseTo(ringAngleAt(segment, time), 9);
    expect(
      angularDistance(
        rotate(pose.ring, pose.target.mark),
        targetCenterAt(segment, time)
      )
    ).toBeLessThan(1e-9);
  });

  it('freezes at the pause', () => {
    const paused = update(
      started(),
      { type: 'pause', time: T0 + 100 },
      DIVER_RULES
    ).state;
    expect(poseFromGame(paused, T0 + 9000, IDLE)).toEqual(
      poseFromGame(paused, T0 + 100, IDLE)
    );
  });

  it('freezes at the miss', () => {
    const playing = started();
    if (playing.phase !== 'playing') throw new Error('not playing');
    const close = windowCloseTime(playing.round.segment);
    const over = update(
      playing,
      { type: 'tick', time: close + DIVER_RULES.timing.inputGraceMs },
      DIVER_RULES
    ).state;
    expect(over.phase).toBe('gameOver');
    expect(poseFromGame(over, close + 5000, IDLE).seconds).toBeCloseTo(
      handAngleAt(playing.round.segment, close),
      9
    );
    expect(centerTime(playing.round.segment)).toBeLessThan(close);
  });

  it('freezes where the hand was when the game noticed it had passed', () => {
    const playing = started();
    if (playing.phase !== 'playing') throw new Error('not playing');
    const noticed = windowCloseTime(playing.round.segment) + 70;
    const over = update(
      playing,
      { type: 'tick', time: noticed },
      DIVER_RULES
    ).state;
    const pose = poseFromGame(over, noticed + 5000, {
      idleSeconds: 0,
      endedAt: noticed,
    });
    expect(pose.seconds).toBeCloseTo(
      handAngleAt(playing.round.segment, noticed),
      9
    );
  });

  it('never freezes before the miss itself', () => {
    const playing = started();
    if (playing.phase !== 'playing') throw new Error('not playing');
    const tapAt = T0 + 60;
    const over = update(
      playing,
      { type: 'tap', time: tapAt },
      DIVER_RULES
    ).state;
    expect(over.phase).toBe('gameOver');
    const pose = poseFromGame(over, tapAt + 900, {
      idleSeconds: 0,
      endedAt: tapAt - 30,
    });
    expect(pose.seconds).toBeCloseTo(
      handAngleAt(playing.round.segment, tapAt),
      9
    );
  });

  describe('on a GMT gate', () => {
    /** The moment the hand is `progress` degrees past the target centre. */
    const timeAt = (segment: Segment, progress: number) =>
      centerTime(segment) + (progress / closingSpeed(segment)) * 1000;

    /** A round on `segment`, a gate the hand comes in to anticlockwise. */
    function gated(side: 'wait' | 'beat'): {
      state: GameState;
      segment: Segment;
    } {
      const state = started();
      if (state.phase !== 'playing') throw new Error('not playing');
      // The GMT hand covers the target from 53° before its centre to 7°
      // before it (wait), or from 7° to 53° past it (beat).
      const segment: Segment = {
        startTime: T0,
        handAngle: 100,
        direction: -1,
        speed: 110,
        ringAngle: 0,
        ringVelocity: 0,
        target: { mark: 30, width: 20, hitWindow: 12, perfectWindow: 3 },
        approach: 70,
        special: true,
        twist: { kind: 'gmt', side, clear: 7 },
        gmt: {
          angle: 30,
          rate: 0.5,
          cross: side === 'wait' ? -30 : 30,
          reach: 11.5,
        },
      };
      return {
        state: { ...state, round: { ...state.round, segment } },
        segment,
      };
    }

    it('draws the covered flank on the target, against the hand’s travel', () => {
      const { state } = gated('wait');
      // 12° to 7° before the centre, coming in anticlockwise: 7° to 12°
      // clockwise of the mark, cut at the drawn edge (10°).
      expect(poseFromGame(state, T0, IDLE).target?.gate).toEqual({
        from: 7,
        to: 10,
        edge: 7,
        side: 'wait',
        crossed: null,
      });
      const beat = gated('beat');
      expect(poseFromGame(beat.state, T0, IDLE).target?.gate).toMatchObject({
        from: -10,
        to: -7,
        edge: -7,
      });
    });

    it.each(['wait', 'beat'] as const)(
      'counts from the moment a %s gate’s judgement flips',
      side => {
        const { state, segment } = gated(side);
        const line = side === 'wait' ? -7 : 7;
        const before = timeAt(segment, line - 0.5);
        const after = timeAt(segment, line + 2);
        expect(
          poseFromGame(state, before, IDLE).target?.gate?.crossed
        ).toBeNull();
        expect(isBlockedAt(segment, before)).toBe(side === 'wait');
        expect(
          poseFromGame(state, after, IDLE).target?.gate?.crossed
        ).toBeCloseTo((2 / 110) * 1000, 6);
        expect(isBlockedAt(segment, after)).toBe(side === 'beat');
      }
    );

    it('covers the seconds hand on the target exactly while a tap is blocked', () => {
      // The GMT's third sweep, which is always a gate.
      let state = update(
        INITIAL_STATE,
        { type: 'start', time: T0, seed: 1 },
        GMT_RULES
      ).state;
      for (let tap = 0; tap < 2; tap++) {
        if (state.phase !== 'playing') throw new Error('not playing');
        const time = centerTime(state.round.segment);
        state = update(state, { type: 'tap', time }, GMT_RULES).state;
      }
      if (state.phase !== 'playing') throw new Error('not playing');
      const { segment } = state.round;
      const { hitWindow, width } = segment.target;
      const wrong: number[] = [];
      for (let p = -hitWindow; p <= hitWindow; p += 0.1) {
        const time = timeAt(segment, p);
        const pose = poseFromGame(state, time, IDLE);
        const gate = pose.target?.gate;
        if (!gate) throw new Error('no gate');
        const offset = signedDelta(targetCenterAt(segment, time), pose.seconds);
        if (Math.abs(offset) > width / 2) continue;
        const covered = offset >= gate.from && offset <= gate.to;
        if (covered !== isBlockedAt(segment, time)) wrong.push(p);
      }
      expect(wrong).toEqual([]);
    });
  });

  describe('on a swaying sweep', () => {
    /** The Tourbillon's third sweep, which always sways. */
    function swaying(): { state: GameState; segment: Segment } {
      let state = update(
        INITIAL_STATE,
        { type: 'start', time: T0, seed: 1 },
        TOURBILLON_RULES
      ).state;
      for (let tap = 0; tap < 2; tap++) {
        if (state.phase !== 'playing') throw new Error('not playing');
        const time = centerTime(state.round.segment);
        state = update(state, { type: 'tap', time }, TOURBILLON_RULES).state;
      }
      if (state.phase !== 'playing') throw new Error('not playing');
      const { segment } = state.round;
      if (segment.twist?.kind !== 'sway') throw new Error('no sway');
      return { state, segment };
    }

    it('turns the watch as the game has it while it rocks', () => {
      const { state, segment } = swaying();
      const time = centerTime(segment);
      const pose = poseFromGame(state, time, IDLE);
      expect(pose.sway).toBe(swayAt(segment, time));
      expect(pose.sway).not.toBe(0);
    });

    it('lets it settle before the sway and on other sweeps', () => {
      const { state, segment } = swaying();
      expect(poseFromGame(state, segment.startTime, IDLE).sway).toBeNull();
      expect(poseFromGame(started(), T0 + 250, IDLE).sway).toBeNull();
    });

    it('freezes the sway at the pause', () => {
      const { state, segment } = swaying();
      const pausedAt = centerTime(segment) - 40;
      const paused = update(
        state,
        { type: 'pause', time: pausedAt },
        TOURBILLON_RULES
      ).state;
      expect(poseFromGame(paused, pausedAt + 9000, IDLE).sway).toBe(
        swayAt(segment, pausedAt)
      );
    });
  });

  it('clouds a Pilot’s dial ahead of the marker, and clears it at the miss', () => {
    let state = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      PILOT_RULES
    ).state;
    for (let tap = 0; tap < 2; tap++) {
      if (state.phase !== 'playing') throw new Error('not playing');
      const time = centerTime(state.round.segment);
      state = update(state, { type: 'tap', time }, PILOT_RULES).state;
    }
    if (state.phase !== 'playing') throw new Error('not playing');
    const { segment } = state.round;
    if (segment.twist?.kind !== 'cloud') throw new Error('no cloud');
    const { from, fade } = segment.twist;
    const atCentre = poseFromGame(state, centerTime(segment), IDLE);
    expect(atCentre.cloud?.density).toBe(1);
    // From where it thickens to just past the target.
    const cloud = atCentre.cloud;
    if (!cloud) throw new Error('no cloud pose');
    expect(cloud.length).toBeCloseTo(
      segment.target.hitWindow + 8 - (from - fade),
      9
    );
    const centre = targetCenterAt(segment, centerTime(segment));
    const thick = rotate(centre, segment.direction * from);
    expect(signedDelta(cloud.from, thick) * segment.direction).toBeGreaterThan(
      0
    );
    // The hand is still drawn where the game has it.
    expect(atCentre.seconds).toBeCloseTo(
      handAngleAt(segment, centerTime(segment)),
      9
    );
    // Far back along the sweep, it has not rolled in yet.
    expect(poseFromGame(state, segment.startTime, IDLE).cloud?.density).toBe(0);
    const missed = update(
      state,
      { type: 'tap', time: centerTime(segment) - 400 },
      PILOT_RULES
    ).state;
    expect(poseFromGame(missed, centerTime(segment), IDLE).cloud).toBeNull();
    expect(poseFromGame(started(), T0 + 250, IDLE).cloud).toBeNull();
  });

  it('counts a Digital down to the centre, and clears it at the miss', () => {
    let state = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      DIGITAL_RULES
    ).state;
    for (let tap = 0; tap < 2; tap++) {
      if (state.phase !== 'playing') throw new Error('not playing');
      const time = centerTime(state.round.segment);
      state = update(state, { type: 'tap', time }, DIGITAL_RULES).state;
    }
    if (state.phase !== 'playing') throw new Error('not playing');
    const { segment } = state.round;
    if (segment.twist?.kind !== 'countdown') throw new Error('no countdown');
    const centre = centerTime(segment);
    const { beatMs } = segment.twist;
    const counting = poseFromGame(state, centre - beatMs * 2 + 5, IDLE);
    expect(counting.countdown?.count).toBe(2);
    expect(counting.countdown?.sinceBeat).toBeCloseTo(5, 6);
    expect(poseFromGame(state, centre, IDLE).countdown?.count).toBe(0);
    expect(poseFromGame(state, centre, IDLE).target?.visibility).toBe(1);
    const missed = update(
      state,
      { type: 'tap', time: centre - beatMs * 2 },
      DIGITAL_RULES
    ).state;
    expect(poseFromGame(missed, centre, IDLE).countdown).toBeNull();
    expect(poseFromGame(started(), T0 + 250, IDLE).countdown).toBeNull();
  });

  it('pulls the crown while a Field’s hand stands, and only then', () => {
    let state = update(
      INITIAL_STATE,
      { type: 'start', time: T0, seed: 1 },
      FIELD_RULES
    ).state;
    for (let tap = 0; tap < 2; tap++) {
      if (state.phase !== 'playing') throw new Error('not playing');
      const time = centerTime(state.round.segment);
      state = update(state, { type: 'tap', time }, FIELD_RULES).state;
    }
    if (state.phase !== 'playing') throw new Error('not playing');
    const { segment } = state.round;
    if (segment.twist?.kind !== 'hack') throw new Error('no hack');
    const stop =
      segment.startTime +
      ((segment.approach + segment.twist.at) / closingSpeed(segment)) * 1000;
    const standing = stop + segment.twist.holdMs / 2;
    expect(poseFromGame(state, standing, IDLE).hacked).toBe(true);
    expect(poseFromGame(state, stop - 20, IDLE).hacked).toBe(false);
    expect(poseFromGame(state, centerTime(segment), IDLE).hacked).toBe(false);
    expect(poseFromGame(started(), T0 + 250, IDLE).hacked).toBe(false);
  });
});
