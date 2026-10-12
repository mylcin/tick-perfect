import { describe, expect, it } from 'vitest';

import type { GameEvent } from '../game';
import { cueFor, VIBRATIONS } from './cues';

const hit = (
  quality: 'good' | 'perfect'
): Extract<GameEvent, { type: 'hit' }> => ({
  type: 'hit',
  time: 0,
  quality,
  offset: 0,
  ms: 0,
  leg: 'single',
  points: 1,
  score: 1,
  streak: 0,
});

describe('cueFor', () => {
  it('clinks and buzzes briefly on a plain hit', () => {
    expect(cueFor([hit('good')])).toEqual({
      sound: 'hit',
      vibration: VIBRATIONS.hit,
    });
  });

  it('answers a Perfect more strongly', () => {
    expect(cueFor([hit('perfect')])).toEqual({
      sound: 'perfect',
      vibration: VIBRATIONS.perfect,
    });
    const total = (pattern: number | readonly number[]) =>
      typeof pattern === 'number'
        ? pattern
        : pattern.filter((_, index) => index % 2 === 0).reduce((a, b) => a + b);
    expect(total(VIBRATIONS.perfect)).toBeGreaterThan(total(VIBRATIONS.hit));
  });

  it('celebrates the multiplier switching on', () => {
    expect(
      cueFor([hit('perfect'), { type: 'multiplier', time: 0, factor: 2 }])
    ).toEqual({ sound: 'multiplier', vibration: VIBRATIONS.multiplier });
  });

  it('lets the multiplier go softly under a plain hit', () => {
    expect(
      cueFor([hit('good'), { type: 'multiplier', time: 0, factor: 1 }])
    ).toEqual({
      sound: 'hit',
      accents: ['release'],
      vibration: VIBRATIONS.hit,
    });
  });

  it('presses the pusher as a chronograph pair starts and stops', () => {
    expect(cueFor([{ ...hit('good'), leg: 'start' }])).toEqual({
      sound: 'hit',
      accents: ['pusher'],
      vibration: VIBRATIONS.hit,
    });
    expect(cueFor([{ ...hit('perfect'), leg: 'stop' }])).toEqual({
      sound: 'perfect',
      accents: ['pusher'],
      vibration: VIBRATIONS.perfect,
    });
    // A stop mark that breaks a streak does both.
    expect(
      cueFor([
        { ...hit('good'), leg: 'stop' },
        { type: 'multiplier', time: 0, factor: 1 },
      ])
    ).toEqual({
      sound: 'hit',
      accents: ['pusher', 'release'],
      vibration: VIBRATIONS.hit,
    });
  });

  it('adds a quiet note and a nudge after the buzz as a best is passed', () => {
    expect(cueFor([hit('good')], true)).toEqual({
      sound: 'hit',
      accents: ['pass'],
      vibration: [VIBRATIONS.hit, 60, VIBRATIONS.pass],
    });
    expect(
      cueFor([hit('perfect'), { type: 'multiplier', time: 0, factor: 2 }], true)
    ).toEqual({
      sound: 'multiplier',
      accents: ['pass'],
      vibration: [...VIBRATIONS.multiplier, 60, VIBRATIONS.pass],
    });
    expect(VIBRATIONS.pass).toBeLessThan(VIBRATIONS.hit);
    // A miss passes nothing.
    expect(
      cueFor(
        [{ type: 'miss', time: 0, reason: 'late', offset: 20, score: 3 }],
        true
      )
    ).toEqual({ sound: 'miss', vibration: VIBRATIONS.miss });
  });

  it('cracks on a miss', () => {
    expect(
      cueFor([{ type: 'miss', time: 0, reason: 'late', offset: 20, score: 3 }])
    ).toEqual({ sound: 'miss', vibration: VIBRATIONS.miss });
  });

  it('stays quiet for everything else', () => {
    expect(cueFor([])).toBeNull();
    expect(cueFor([{ type: 'started', time: 0 }])).toBeNull();
    expect(cueFor([{ type: 'paused', time: 0 }])).toBeNull();
    expect(cueFor([{ type: 'exited' }])).toBeNull();
  });
});
