import { CLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { CloudTwistRule, GameRules } from './types.js';

export const CLOUD_TWIST: CloudTwistRule = {
  kind: 'cloud',
  // Far enough ahead to be seen running, then clouded.
  gap: { minDegrees: 120 },
  readMs: 300,
  cloudMs: { min: 300, max: 550 },
  minCloudMs: 180,
  fadeDegrees: 12,
};

/**
 * A pilot's watch is read at a glance, whatever the weather. Now and then
 * cloud drifts over this one's dial ahead of the marker, and the seconds
 * hand flies on through it, misted. The timing stays the same.
 */
export const PILOT_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.15, limit: 0.4, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'never', direction: CLOCKWISE },
  twists: [CLOUD_TWIST],
  introduceAt: 2,
};
