import { describe, expect, it } from 'vitest';

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
import {
  medianOf as median,
  shareAtLeast as share,
  simulatedScores,
} from './simulate.js';

// The difficulty curve, checked against simulated players (simulate.ts):
// each aims at the target centre and misses it by a normally distributed
// error, σ, from 45 ms (a first-timer) to 12 ms (a rhythm game expert). The
// bands below are what the tuning promises: a first round that most people
// pass, scores that keep rising with skill, and a top that only steady
// timing reaches. They are wide, so tuning within them is free; a change
// that breaks one changes how the game feels.
//
// The certificates (15, 40 and 75, in src/state/certificates.ts) are set
// from the same curve.

const ROUNDS = 400;

/** Scores of a simulated player's rounds, lowest first. */
const scores = (rules: GameRules, sigma: number) =>
  simulatedScores(rules, sigma, ROUNDS);

describe('the difficulty curve', () => {
  const diver = new Map(
    [12, 18, 25, 35, 45].map(sigma => [sigma, scores(DIVER_RULES, sigma)])
  );
  const at = (sigma: number) => diver.get(sigma) ?? [];

  it('lets most first-timers earn the first certificate in a try or two', () => {
    expect(share(at(45), 15)).toBeGreaterThan(0.5);
    expect(share(at(35), 15)).toBeGreaterThan(0.85);
  });

  it('rewards steadier timing with ever higher scores', () => {
    const medians = [45, 35, 25, 18, 12].map(sigma => median(at(sigma)));
    medians.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThan((medians[index] ?? 0) * 1.4);
    });
  });

  it('puts the middle certificate within reach of a good player', () => {
    expect(share(at(25), 40)).toBeGreaterThan(0.6);
    expect(share(at(35), 40)).toBeLessThan(0.4);
  });

  it('keeps the top certificate for steady timing', () => {
    expect(share(at(18), 75)).toBeGreaterThan(0.5);
    expect(share(at(25), 75)).toBeGreaterThan(0.02);
    expect(share(at(25), 75)).toBeLessThan(0.3);
  });

  it('leaves room above it for the best', () => {
    expect(median(at(12))).toBeGreaterThan(150);
  });

  it.each([
    ['Chronograph', CHRONOGRAPH_RULES],
    ['GMT', GMT_RULES],
    ['Moonphase', MOONPHASE_RULES],
    ['Tourbillon', TOURBILLON_RULES],
    ['Grand Complication', GRAND_COMPLICATION_RULES],
    ['Field', FIELD_RULES],
    ['Pilot', PILOT_RULES],
    ['Digital', DIGITAL_RULES],
  ])('keeps the %s within reach of the Diver', (_, rules) => {
    const steady = scores(rules, 25);
    const casual = scores(rules, 35);
    expect(share(casual, 15)).toBeGreaterThan(0.7);
    expect(median(steady)).toBeGreaterThan(median(at(25)) * 0.7);
    expect(median(steady)).toBeLessThan(median(at(25)) * 1.4);
  });
});
