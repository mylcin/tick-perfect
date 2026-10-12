import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { GameRules, SwayTwistRule } from './types.js';

export const SWAY_TWIST: SwayTwistRule = {
  kind: 'sway',
  // Far enough ahead for the watch to rock while the hand comes in, even
  // at full speed.
  gap: { minLeadMs: 750, maxDegrees: 300 },
  tilt: { min: 10, max: 20 },
  durationMs: { min: 900, max: 1500 },
  centre: { min: 0.55, max: 0.8 },
  leadMs: 150,
  swings: 1.5,
};

/**
 * A tourbillon turns its escapement so a watch keeps time however the
 * wrist holds it. Now and then this one rocks on the wrist, left and right,
 * as the hand comes in; the timing doesn't change, so the player keeps
 * their eye on the hand.
 */
export const TOURBILLON_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.18, limit: 0.45, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [SWAY_TWIST],
  introduceAt: 2,
};
