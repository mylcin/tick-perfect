import { PILOT_RULES } from '../game/index.js';
import { BRUSHED_STEEL, POLISHED_STEEL, SATIN_WHITE_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the big observer's watch of the bomber crews: a wide brushed case
 * under a thin bezel, a matte black dial of big numerals with a triangle
 * between two dots at 12, sword hands, an onion crown and a riveted
 * leather strap.
 */
export const PILOT: WatchSpec = {
  id: 'pilot',
  name: 'Pilot',
  rules: PILOT_RULES,
  targetTrack: 'chapter',
  case: {
    style: 'tool',
    radius: 1.3,
    height: 0.42,
    metal: BRUSHED_STEEL,
    accentMetal: POLISHED_STEEL,
    crown: 'onion',
    crownGuards: false,
    pushers: 'none',
  },
  bezel: { type: 'stepped', inner: 1.07, outer: 1.21, height: 0.115 },
  dial: {
    style: 'pilot',
    color: '#111214',
    finish: 'matte',
    printColor: '#f1f1ee',
    label: 'PILOT',
    sublabel: 'ANTIMAGNETIC',
  },
  date: { at: 'three', cyclops: false },
  hands: {
    hour: 'sword',
    minute: 'sword',
    seconds: 'needle',
    metal: SATIN_WHITE_GOLD,
    secondsColor: '#f1f1ee',
    lume: true,
  },
  lume: { color: '#e6f0e2', day: 0.08, night: 2.3 },
  strap: { type: 'riveted', color: '#6a4529' },
  complications: {},
  accents: {
    target: '#f2a33a',
    print: '#c9ccd0',
    dateWheel: '#f3f2ee',
    dateText: '#111317',
  },
};
