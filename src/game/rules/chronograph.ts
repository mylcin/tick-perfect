import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { ChronoTwistRule, GameRules } from './types.js';

export const CHRONO_TWIST: ChronoTwistRule = {
  kind: 'chrono',
  // Pairs start close enough that their stop mark fits on the same lap.
  gap: { maxDegrees: 180 },
  minLeadMs: 300,
  maxSpanDegrees: 144,
};

/**
 * Some targets are a pair: tap once at the start mark, again at the stop
 * mark further on. The hand keeps going between them; the bezel stays put.
 */
export const CHRONOGRAPH_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.12, limit: 0.4, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [CHRONO_TWIST],
  introduceAt: 2,
};
