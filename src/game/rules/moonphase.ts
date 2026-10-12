import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { GameRules, MoonTwistRule } from './types.js';

export const MOON_TWIST: MoonTwistRule = {
  kind: 'moon',
  // Far enough ahead to be seen, then forgotten.
  gap: { minDegrees: 180, maxDegrees: 300 },
  readMs: 300,
  hiddenMs: { min: 250, max: 450 },
  minHiddenMs: 150,
  fadeDegrees: 10,
};

/**
 * Some targets fade out on the way in; the player taps where they
 * remember it. A little slower and wider at the top than the other watches.
 */
export const MOONPHASE_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    handSpeed: { start: 100, limit: 250, rate: 0.025 },
    hitWindowMs: { start: 120, limit: 27, rate: 0.06 },
    specialChance: { start: 0.15, limit: 0.4, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [MOON_TWIST],
  introduceAt: 2,
};
