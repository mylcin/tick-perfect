import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { GameRules, HackTwistRule } from './types.js';

export const HACK_TWIST: HackTwistRule = {
  kind: 'hack',
  // Room to see the hand run, stop and run on.
  gap: { minLeadMs: 700 },
  holdMs: { min: 300, max: 800 },
  leadMs: { min: 80, max: 260 },
  runMs: 250,
};

/**
 * A field watch hacks: pull its crown and the seconds hand stops, so a
 * platoon can set every watch to the same second. Now and then this one's
 * hand stops dead short of the marker and stands, then runs on at the same
 * speed. A tap while it stands is early.
 */
export const FIELD_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.15, limit: 0.45, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [HACK_TWIST],
  introduceAt: 2,
};
