import { describe, expect, it } from 'vitest';

import { CHRONOGRAPH_RULES } from './chronograph.js';
import { DIGITAL_RULES } from './digital.js';
import { DIVER_RULES } from './diver.js';
import { FIELD_RULES } from './field.js';
import { GMT_RULES, GMT_TWIST } from './gmt.js';
import { GRAND_COMPLICATION_RULES } from './grand-complication.js';
import { MOONPHASE_RULES } from './moonphase.js';
import { PILOT_RULES } from './pilot.js';
import { TOURBILLON_RULES } from './tourbillon.js';
import type { GameRules } from './types.js';
import { checkRules } from './validate.js';

const BUNDLED = {
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

/** The rules as JSON would bring them, so a test can break any field. */
const json = (rules: GameRules): Record<string, unknown> =>
  JSON.parse(JSON.stringify(rules)) as Record<string, unknown>;

/**
 * A copy of the Grand Complication's rules with the field at `path` (dotted,
 * array indices included) set to `value`; `undefined` takes it away.
 */
function changed(...changes: (readonly [string, unknown])[]): unknown {
  const rules = json(GRAND_COMPLICATION_RULES);
  for (const [path, value] of changes) {
    const keys = path.split('.');
    const last = keys.pop() ?? '';
    let node = rules;
    for (const key of keys) node = node[key] as Record<string, unknown>;
    node[last] = value;
  }
  return rules;
}

function errorsOf(value: unknown): readonly string[] {
  const check = checkRules(value);
  return check.ok ? [] : check.errors;
}

describe('checkRules', () => {
  it.each(Object.entries(BUNDLED))('passes the %s’s own rules', (_, rules) => {
    const check = checkRules(json(rules));
    expect(check).toEqual({ ok: true, rules });
  });

  it.each([
    ['not an object', null, 'rules: must be an object'],
    ['an array', [], 'rules: must be an object'],
    [
      'an unknown field',
      changed(['bonus', 1]),
      'rules.bonus: is not a known field',
    ],
    [
      'a missing ramp',
      changed(['difficulty.handSpeed', undefined]),
      'difficulty.handSpeed: must be an object',
    ],
    [
      'a ramp out of range',
      changed(['difficulty.hitWindowMs.limit', 2]),
      'difficulty.hitWindowMs.limit: must be between 10 and 400',
    ],
    [
      'a rate of 0',
      changed(['difficulty.handSpeed.rate', 0]),
      'difficulty.handSpeed.rate: must be between 0.001 and 1',
    ],
    [
      'a word for a number',
      changed(['timing.inputGraceMs', 'soon']),
      'timing.inputGraceMs: must be a number',
    ],
    [
      'a fraction of a point',
      changed(['scoring.goodPoints', 1.5]),
      'scoring.goodPoints: must be whole',
    ],
    [
      'a gap that closes',
      changed(['difficulty.gap.minDegrees', 300]),
      'difficulty.gap: minDegrees must be below maxDegrees',
    ],
    [
      'no multipliers',
      changed(['scoring.multipliers', []]),
      'scoring.multipliers: must list 1 to 6 tiers',
    ],
    [
      'a multiplier that shrinks',
      changed(['scoring.multipliers.2', { streak: 9, factor: 2 }]),
      'scoring.multipliers.2: must need a longer streak for a larger factor',
    ],
    [
      'an unknown ring',
      changed(['ring.turns', 'sometimes']),
      'ring.turns: must be one of never, onSpecial, always',
    ],
    [
      'a sideways ring',
      changed(['ring.direction', 0]),
      'ring.direction: must be one of 1, -1',
    ],
    ['no twists', changed(['twists', []]), 'twists: must list 1 to 8 twists'],
    [
      'an unknown twist',
      changed(['twists.5', { kind: 'jump' }]),
      'twists.5.kind: must be turn, chrono, gmt, moon, sway, hack, cloud or countdown',
    ],
    [
      'a turn without a direction',
      changed(['twists.0.reversible', 'yes']),
      'twists.0.reversible: must be true or false',
    ],
    [
      'a chrono span too long',
      changed(['twists.1.maxSpanDegrees', 400]),
      'twists.1.maxSpanDegrees: must be between 12 and 300',
    ],
    [
      'a gap that is not an object',
      changed(['twists.1.gap', 5]),
      'twists.1.gap: must be an object',
    ],
    [
      'a chrono gap too close',
      changed(['twists.1.gap', { minDegrees: 1 }]),
      'twists.1.gap.minDegrees: must be between 6 and 300',
    ],
    [
      'a GMT hand without a width',
      changed(['twists.2.hand.width', undefined]),
      'twists.2.hand.width: must be a number',
    ],
    [
      'a GMT gate widened past three times',
      changed(['twists.2.windowScale', 3.5]),
      'twists.2.windowScale: must be between 1 and 3',
    ],
    [
      'a GMT gate narrowed',
      changed(['twists.2.windowScale', 0.8]),
      'twists.2.windowScale: must be between 1 and 3',
    ],
    [
      'a moon hidden backwards',
      changed(['twists.3.hiddenMs', { min: 400, max: 100 }]),
      'twists.3.hiddenMs: min must not be above max',
    ],
    [
      'a moon gap lead too long',
      changed(['twists.3.gap.minLeadMs', 9000]),
      'twists.3.gap.minLeadMs: must be between 0 and 3000',
    ],
    [
      'a sway past 45°',
      changed(['twists.4.tilt.max', 60]),
      'twists.4.tilt.max: must be between 0 and 45',
    ],
    [
      'a sway gap too far',
      changed(['twists.4.gap.maxDegrees', 400]),
      'twists.4.gap.maxDegrees: must be between 12 and 354',
    ],
    [
      'an introduction in a fraction',
      changed(['introduceAt', 0.5]),
      'introduceAt: must be whole',
    ],
  ])('refuses %s', (_, value, error) => {
    expect(errorsOf(value)).toContain(error);
  });

  it('accepts a watch that never introduces its twist', () => {
    const rules = json(DIVER_RULES);
    expect(checkRules(rules).ok).toBe(true);
    expect('introduceAt' in rules).toBe(false);
  });

  it('accepts a twist that keeps the watch’s own gap', () => {
    expect(checkRules(changed(['twists.1.gap', undefined])).ok).toBe(true);
  });

  it('keeps a GMT gate stored before gates widened exactly as it was', () => {
    // So the page's checked copy still compares equal to the server's.
    const stored = changed(['twists.2.windowScale', undefined]);
    const check = checkRules(stored);
    expect(check.ok && check.rules).toEqual(stored);
    const { kind, hand, guardDegrees, minBlockDegrees } = GMT_TWIST;
    expect(check.ok && check.rules.twists[2]).toEqual({
      kind,
      hand,
      guardDegrees,
      minBlockDegrees,
    });
  });

  it('lists every problem at once', () => {
    const value = changed(
      ['timing.tapDebounceMs', -1],
      ['ring.turns', 'often']
    );
    expect(errorsOf(value)).toHaveLength(2);
  });
});
