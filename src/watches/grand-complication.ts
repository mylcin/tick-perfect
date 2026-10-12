import { GRAND_COMPLICATION_RULES } from '../game/index.js';
import { PLATINUM, SATIN_WHITE_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * Endless is played here. After the grand complications of Geneva: a
 * platinum case with stepped lugs, a salmon dial with day and month
 * windows under 12, the moon and date at 6, running seconds at 9 and the
 * 30-minute counter at 3, the score in a small aperture at 4:30, a
 * tachymeter, leaf hands and a hollow travel-time hand.
 */
export const GRAND_COMPLICATION: WatchSpec = {
  id: 'grandComplication',
  name: 'Grand Complication',
  rules: GRAND_COMPLICATION_RULES,
  targetTrack: 'chapter',
  case: {
    style: 'grand',
    radius: 1.3,
    height: 0.4,
    metal: PLATINUM,
    accentMetal: PLATINUM,
    crown: 'flat',
    crownGuards: false,
    pushers: 'round',
  },
  bezel: { type: 'stepped', inner: 1.08, outer: 1.23, height: 0.13 },
  dial: {
    style: 'perpetual',
    color: '#de8f72',
    finish: 'opaline',
    printColor: '#3b2a22',
    label: 'PERPETUAL CALENDAR',
    registerColor: '#d58569',
    registerPrint: '#3b2a22',
  },
  date: { at: 'fourThirty', cyclops: false },
  hands: {
    hour: 'leaf',
    minute: 'leaf',
    seconds: 'needle',
    metal: SATIN_WHITE_GOLD,
    secondsColor: '#2a3f7a',
    lume: false,
  },
  lume: { color: '#d8f2ff', day: 0, night: 0.8 },
  strap: { type: 'alligator', color: '#4a2c1c' },
  complications: {
    chronograph: { counter: 'three' },
    smallSeconds: { slot: 'nine' },
    gmt: { style: 'hollow', color: '#f4f4f6' },
    moon: { slot: 'six', sky: '#162a5c', moon: '#f0d48a' },
    calendar: true,
  },
  accents: {
    target: '#7d1611',
    print: '#3b2a22',
    dateWheel: '#fbf8f3',
    dateText: '#3b2a22',
  },
};
