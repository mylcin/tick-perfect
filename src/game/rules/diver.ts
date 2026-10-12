import { COUNTERCLOCKWISE } from '../angle.js';
import { DEFAULT_DIFFICULTY } from '../difficulty.js';
import { DEFAULT_SCORING } from '../scoring.js';
import { DEFAULT_TIMING } from '../timing.js';
import type { GameRules } from './types.js';

/**
 * The base game. On special targets the bezel turns while the hand
 * approaches, carrying the target with it. Like a real dive bezel it only
 * turns counter-clockwise.
 */
export const DIVER_RULES: GameRules = {
  difficulty: DEFAULT_DIFFICULTY,
  scoring: DEFAULT_SCORING,
  timing: DEFAULT_TIMING,
  ring: { turns: 'onSpecial', direction: COUNTERCLOCKWISE },
  twists: [{ kind: 'turn', reversible: false }],
};
