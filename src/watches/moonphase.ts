import { MOONPHASE_RULES } from '../game/index.js';
import { POLISHED_YELLOW_GOLD, SATIN_YELLOW_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the round dress watch of Geneva: a thin gold case with a hobnail
 * bezel, a white dial of faceted gold batons and a printed railway, gold
 * dauphine hands, a blued seconds needle and the moon at 6.
 */
export const MOONPHASE: WatchSpec = {
  id: 'moonphase',
  name: 'Moonphase',
  rules: MOONPHASE_RULES,
  targetTrack: 'chapter',
  case: {
    style: 'calatrava',
    radius: 1.17,
    height: 0.24,
    metal: POLISHED_YELLOW_GOLD,
    accentMetal: POLISHED_YELLOW_GOLD,
    crown: 'flat',
    crownGuards: false,
    pushers: 'none',
  },
  bezel: { type: 'hobnail', inner: 1.08, outer: 1.17, height: 0.125 },
  dial: {
    style: 'dress',
    color: '#f6f3ec',
    finish: 'opaline',
    printColor: '#26221e',
    label: 'MOONPHASE',
  },
  date: { at: 'three', cyclops: false },
  hands: {
    hour: 'dauphine',
    minute: 'dauphine',
    seconds: 'needle',
    metal: SATIN_YELLOW_GOLD,
    secondsColor: '#2a4b9b',
    lume: false,
  },
  lume: { color: '#ffe6b8', day: 0, night: 0.9 },
  strap: { type: 'alligator', color: '#121214' },
  complications: {
    moon: { slot: 'six', sky: '#14275a', moon: '#f0d48a' },
  },
  accents: {
    target: '#b3261e',
    print: '#8a6a2c',
    dateWheel: '#fbf9f4',
    dateText: '#26221e',
  },
};
