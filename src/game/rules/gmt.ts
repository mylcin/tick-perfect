import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { GameRules, GmtTwistRule } from './types.js';

export const GMT_TWIST = {
  kind: 'gmt',
  hand: { rate: 0.22, width: 3, restAngle: 300, clearance: 6 },
  guardDegrees: 1,
  minBlockDegrees: 2,
  windowScale: 1.5,
} satisfies GmtTwistRule;

/**
 * A GMT hand shares the dial. Now and then it sweeps across the target as
 * the seconds hand arrives; tapping while it touches the target is a miss.
 */
export const GMT_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.15, limit: 0.45, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [GMT_TWIST],
  introduceAt: 2,
};
