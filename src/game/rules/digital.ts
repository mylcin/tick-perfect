import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { CountdownTwistRule, GameRules } from './types.js';

export const COUNTDOWN_TWIST: CountdownTwistRule = {
  kind: 'countdown',
  // Room for three beats before the marker, even at speed.
  gap: { minDegrees: 210, maxDegrees: 330 },
  beats: 3,
  beatMs: { min: 220, max: 360 },
  readMs: 150,
};

/**
 * A digital beeps its timer through the last seconds. Now and then this
 * one counts down to the marker, 3, 2, 1, a beep and a flash of its light
 * on each beat: tap on zero, the next beat. The marker stays in sight.
 */
export const DIGITAL_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.18, limit: 0.45, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [COUNTDOWN_TWIST],
  introduceAt: 2,
};
