import { describe, expect, it, vi } from 'vitest';

import {
  centerTime,
  CHRONOGRAPH_RULES,
  closingSpeed,
  DIVER_RULES,
  MS_PER_SECOND,
  handAngleAt,
  replayRound,
  windowCloseTime,
  type PlayingState,
} from '../game';
import { createGameController, type GameController } from './game-controller';

const T0 = 1000;

function playing(controller: GameController): PlayingState {
  const { state } = controller.snapshot();
  if (state.phase !== 'playing') throw new Error(`phase is ${state.phase}`);
  return state;
}

function started(options?: Parameters<typeof createGameController>[1]) {
  const controller = createGameController(DIVER_RULES, options);
  controller.dispatch({ type: 'start', time: T0, seed: 7 });
  return controller;
}

/** Taps the current target dead centre and returns the tap time. */
function hitCentre(controller: GameController): number {
  const time = centerTime(playing(controller).round.segment);
  controller.dispatch({ type: 'tap', time });
  return time;
}

describe('createGameController', () => {
  it('starts idle with the hands resting at 12', () => {
    const controller = createGameController(DIVER_RULES);
    expect(controller.snapshot().state.phase).toBe('idle');
    expect(controller.pose(T0)).toMatchObject({
      seconds: 0,
      target: null,
      eased: true,
      hit: null,
      crack: null,
    });
  });

  it('notifies listeners only when the state changes', () => {
    const controller = createGameController(DIVER_RULES);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.dispatch({ type: 'tick', time: T0 });
    controller.dispatch({ type: 'tap', time: T0 });
    expect(listener).not.toHaveBeenCalled();

    controller.dispatch({ type: 'start', time: T0, seed: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toEqual([
      { type: 'started', time: T0 },
    ]);

    const before = controller.snapshot();
    controller.dispatch({ type: 'tick', time: T0 + 1 });
    expect(controller.snapshot()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    controller.dispatch({ type: 'exit' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tracks the score for the date window', () => {
    const controller = started();
    const seen: number[] = [];
    controller.score.subscribe(score => seen.push(score));
    hitCentre(controller);
    hitCentre(controller);
    expect(controller.score.get()).toBe(playing(controller).round.score);
    expect(seen).toEqual([2, 4]);

    controller.dispatch({ type: 'exit' });
    expect(controller.score.get()).toBe(0);
  });

  it('remembers the last hit where its target stood', () => {
    const controller = started();
    const { target } = playing(controller).round.segment;
    const time = hitCentre(controller);
    const first = controller.snapshot().lastHit;
    expect(first).toEqual({
      id: 1,
      time,
      mark: target.mark,
      width: target.width,
      quality: 'perfect',
      leg: 'single',
      points: 2,
    });
    expect(controller.pose(time + 100).hit).toEqual({
      mark: target.mark,
      width: target.width,
      quality: 'perfect',
      leg: 'single',
      age: 100,
    });

    hitCentre(controller);
    expect(controller.snapshot().lastHit?.id).toBe(2);
  });

  it('forgets the last hit when a new round starts', () => {
    const controller = started();
    hitCentre(controller);
    controller.dispatch({ type: 'exit' });
    expect(controller.snapshot().lastHit).toBeNull();
    controller.dispatch({ type: 'start', time: T0 + 5000, seed: 2 });
    expect(controller.pose(T0 + 5000).hit).toBeNull();
  });

  it('cracks the crystal where the hand stopped on a miss', () => {
    const controller = started();
    const { segment } = playing(controller).round;
    const tapAt = T0 + 40 + DIVER_RULES.timing.tapDebounceMs;
    controller.dispatch({ type: 'tap', time: tapAt });
    expect(controller.snapshot().state.phase).toBe('gameOver');

    const crack = controller.pose(tapAt + 250).crack;
    expect(crack?.age).toBe(250);
    expect(crack?.angle).toBeCloseTo(handAngleAt(segment, tapAt), 9);
    expect(crack?.seed).toBe(7);
  });

  it('freezes a passed hand where the game noticed, not where it left', () => {
    const controller = started();
    const { segment } = playing(controller).round;
    const noticed = windowCloseTime(segment) + 75;
    controller.dispatch({ type: 'tick', time: noticed });
    expect(controller.snapshot().endedAt).toBe(noticed);
    expect(controller.pose(noticed + 2000).seconds).toBeCloseTo(
      handAngleAt(segment, noticed),
      9
    );
  });

  it('freezes where the hand was last drawn when judged a moment late', () => {
    const controller = started();
    const { segment } = playing(controller).round;
    const judged = windowCloseTime(segment) + 70;
    const drawn = judged + 33;
    controller.dispatch({ type: 'tick', time: judged }, drawn);
    expect(controller.snapshot().endedAt).toBe(drawn);
    expect(controller.pose(drawn + 500).seconds).toBeCloseTo(
      handAngleAt(segment, drawn),
      9
    );
  });

  it('never cracks for the attract-mode bot', () => {
    const controller = started({ cracks: false });
    controller.dispatch({ type: 'tap', time: T0 + 100 });
    expect(controller.snapshot().state.phase).toBe('gameOver');
    expect(controller.pose(T0 + 300).crack).toBeNull();
  });

  it('collects how every hit of the round landed', () => {
    const controller = started();
    hitCentre(controller);
    // Inside the window, outside its Perfect core: a plain hit.
    const { segment } = playing(controller).round;
    const { perfectWindow, hitWindow } = segment.target;
    const offset = (perfectWindow + hitWindow) / 2;
    controller.dispatch({
      type: 'tap',
      time:
        centerTime(segment) + (offset / closingSpeed(segment)) * MS_PER_SECOND,
    });
    hitCentre(controller);
    expect(controller.snapshot().qualities).toEqual([
      'perfect',
      'good',
      'perfect',
    ]);

    // The miss adds nothing; leaving clears them.
    controller.dispatch({ type: 'tap', time: T0 + 1e6 });
    expect(controller.snapshot().qualities).toHaveLength(3);
    controller.dispatch({ type: 'exit' });
    expect(controller.snapshot().qualities).toEqual([]);
  });

  it('lists every hit’s timing error, signed, until the round is left', () => {
    const controller = started();
    hitCentre(controller);
    // 20 ms late, then 30 ms early: both inside the window.
    for (const ms of [20, -30]) {
      const { segment } = playing(controller).round;
      controller.dispatch({ type: 'tap', time: centerTime(segment) + ms });
    }
    const [centre, late, early] = controller.snapshot().errors;
    expect(centre).toBeCloseTo(0, 6);
    expect(late).toBeCloseTo(20, 6);
    expect(early).toBeCloseTo(-30, 6);

    // The miss adds nothing; leaving clears them.
    controller.dispatch({ type: 'tap', time: T0 + 1e6 });
    expect(controller.snapshot().errors).toHaveLength(3);
    controller.dispatch({ type: 'exit' });
    expect(controller.snapshot().errors).toEqual([]);
  });

  it('counts both taps of a chronograph pair', () => {
    const controller = createGameController(CHRONOGRAPH_RULES);
    controller.dispatch({ type: 'start', time: T0, seed: 3 });
    let taps = 0;
    while (playing(controller).round.segment.twist?.kind !== 'chrono') {
      hitCentre(controller);
      taps += 1;
    }
    hitCentre(controller);
    hitCentre(controller);
    taps += 2;
    const { round } = playing(controller);
    expect(round.hits).toBe(taps - 1);
    expect(controller.snapshot().qualities).toHaveLength(taps);
    expect(controller.snapshot().errors).toHaveLength(taps);
  });

  it('starts every new round with a clean slate', () => {
    const controller = started();
    hitCentre(controller);
    controller.dispatch({ type: 'tap', time: T0 + 1e6 });
    controller.dispatch({ type: 'start', time: T0 + 2e6, seed: 8 });
    expect(controller.snapshot()).toMatchObject({
      lastHit: null,
      qualities: [],
      errors: [],
      endedAt: null,
    });
    expect(controller.pose(T0 + 2e6).crack).toBeNull();
  });
});

describe('the round log', () => {
  it('replays to the round the controller played', () => {
    const controller = createGameController(DIVER_RULES);
    expect(controller.log()).toBeNull();
    controller.dispatch({ type: 'start', time: 1000, seed: 77 });
    for (let tap = 0; tap < 6; tap++) {
      const { state } = controller.snapshot();
      if (state.phase !== 'playing') break;
      const time = centerTime(state.round.segment) + (tap % 3) * 4;
      if (tap === 2) {
        controller.dispatch({ type: 'pause', time: time - 300 });
        controller.dispatch({ type: 'resume', time: time + 5000 });
        continue;
      }
      controller.dispatch({ type: 'tap', time });
    }
    // An early tap ends it.
    const { state } = controller.snapshot();
    if (state.phase === 'playing') {
      controller.dispatch({
        type: 'tap',
        time: state.round.segment.startTime + 80,
      });
    }
    const over = controller.snapshot().state;
    const log = controller.log();
    if (!log || over.phase !== 'gameOver') throw new Error('no round');
    expect(log.actions.map(([kind]) => kind)).toContain('pause');
    expect(replayRound(DIVER_RULES, log)).toMatchObject({
      score: over.round.score,
      hits: over.round.hits,
    });
  });

  it('leaves out what changed nothing', () => {
    const controller = createGameController(DIVER_RULES);
    controller.dispatch({ type: 'start', time: 1000, seed: 3 });
    // Within the start press's bounce: the same press again.
    controller.dispatch({ type: 'tap', time: 1010 });
    expect(controller.log()?.actions).toEqual([]);
  });
});
