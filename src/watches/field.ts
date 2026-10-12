import { FIELD_RULES } from '../game/index.js';
import { BRUSHED_STEEL, POLISHED_STEEL, SATIN_WHITE_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the soldier's field watch: a plain brushed case, a matte black dial
 * of big numerals with the 24-hour time inside them, sword hands, hacking
 * seconds and a canvas strap.
 */
export const FIELD: WatchSpec = {
  id: 'field',
  name: 'Field',
  rules: FIELD_RULES,
  targetTrack: 'chapter',
  case: {
    style: 'tool',
    radius: 1.3,
    height: 0.36,
    metal: BRUSHED_STEEL,
    accentMetal: POLISHED_STEEL,
    crown: 'tool',
    crownGuards: false,
    pushers: 'none',
  },
  bezel: { type: 'stepped', inner: 1.07, outer: 1.26, height: 0.11 },
  dial: {
    style: 'field',
    color: '#141516',
    finish: 'matte',
    printColor: '#ece4d0',
    label: 'FIELD',
    sublabel: 'HACKING SECONDS',
  },
  date: { at: 'three', cyclops: false },
  hands: {
    hour: 'sword',
    minute: 'sword',
    seconds: 'needle',
    metal: SATIN_WHITE_GOLD,
    secondsColor: '#ece4d0',
    lume: true,
  },
  lume: { color: '#e8dbb2', day: 0.08, night: 2.2 },
  strap: { type: 'canvas', color: '#545337' },
  complications: {},
  accents: {
    target: '#f2a33a',
    print: '#cdb27a',
    dateWheel: '#f3efe4',
    dateText: '#111317',
  },
};
