import { COUNTERCLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import { CHRONO_TWIST } from './chronograph.js';
import { GMT_TWIST } from './gmt.js';
import { MOON_TWIST } from './moonphase.js';
import { SWAY_TWIST } from './tourbillon.js';
import type { GameRules } from './types.js';

/**
 * Endless: every watch's rule on one dial. A special target picks one: the
 * chapter ring turns (either way), a chronograph pair, a GMT gate, a hidden
 * target or the watch rocking on the wrist. Never two at once.
 */
export const GRAND_COMPLICATION_RULES: GameRules = {
  difficulty: {
    ...DEFAULT_DIFFICULTY,
    specialChance: { start: 0.2, limit: 0.5, rate: 0.07 },
  },
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'onSpecial', direction: COUNTERCLOCKWISE },
  twists: [
    { kind: 'turn', reversible: true },
    CHRONO_TWIST,
    GMT_TWIST,
    MOON_TWIST,
    SWAY_TWIST,
  ],
  introduceAt: 1,
};
