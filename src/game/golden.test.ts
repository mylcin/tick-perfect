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
import { INITIAL_STATE, update, type GameState } from './state.js';
import { centerTime } from './timing.js';

// Golden masters: the full plans of 400 seeded rounds per watch, hashed.
// Daily runs and replays depend on a seed always producing the same targets
// (and the same twists), so refactoring the engine must leave every one of
// these values untouched.

const SEEDS = 400;
const HITS = 60;

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Plays a round, tapping a little off-centre in a seeded pattern. With
 * `twists`, the plan also records what each twist adds.
 */
function plan(rules: GameRules, seed: number, twists: boolean): string {
  let state: GameState = update(
    INITIAL_STATE,
    { type: 'start', time: 1000, seed },
    rules
  ).state;
  const steps: unknown[] = [];
  for (let hit = 0; hit < HITS && state.phase === 'playing'; hit++) {
    const { segment, rng, score } = state.round;
    steps.push([
      segment.startTime,
      segment.handAngle,
      segment.direction,
      segment.speed,
      segment.ringAngle,
      segment.ringVelocity,
      segment.target,
      segment.approach,
      segment.special,
      rng,
      score,
      ...(twists ? [segment.twist ?? null, segment.gmt ?? null] : []),
    ]);
    const offsetMs = ((hit * 37 + seed * 11) % 13) - 6;
    state = update(
      state,
      { type: 'tap', time: centerTime(segment) + offsetMs },
      rules
    ).state;
  }
  steps.push(state.phase);
  return JSON.stringify(steps);
}

const hashOf = (rules: GameRules, twists: boolean) =>
  fnv1a(
    Array.from({ length: SEEDS }, (_, seed) => plan(rules, seed, twists)).join(
      '\n'
    )
  );

/**
 * What a changed hash asks for. A refactor that changes a plan is a bug;
 * retuning a watch on purpose deals other targets from every seed, so its
 * old challenge links must say so.
 */
const changed = (watch: string) =>
  `The ${watch}'s plans changed. If that isn't a bug, bump its revision in ` +
  'RULES_REVISION (src/watches/revisions.ts), so challenge links set on ' +
  'the old rules say their targets differ, then pin the new hash.';

describe('golden masters', () => {
  it('plans every seeded Diver round exactly as before', () => {
    const plans = Array.from({ length: SEEDS }, (_, seed) =>
      plan(DIVER_RULES, seed, false)
    );
    expect(plans.every(round => round.endsWith('"playing"]'))).toBe(true);
    expect(hashOf(DIVER_RULES, false), changed('Diver')).toBe('6f029f4f');
  });

  it.each([
    ['Chronograph', CHRONOGRAPH_RULES, 'f836e20e'],
    ['GMT', GMT_RULES, '6c92e5bc'],
    ['Moonphase', MOONPHASE_RULES, '4b3016d0'],
    ['Tourbillon', TOURBILLON_RULES, 'c83f99e3'],
    ['Grand Complication', GRAND_COMPLICATION_RULES, 'f9cd83cc'],
    ['Field', FIELD_RULES, '1efe2fde'],
    ['Pilot', PILOT_RULES, '929e3672'],
    ['Digital', DIGITAL_RULES, '4e602c78'],
  ] as const)(
    'plans every seeded %s round exactly as before',
    (watch, rules, hash) => {
      expect(hashOf(rules, true), changed(watch)).toBe(hash);
    }
  );
});
