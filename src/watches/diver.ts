import { DIVER_RULES } from '../game/index.js';
import { BRUSHED_STEEL, POLISHED_STEEL, WHITE_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the archetypal diver: a black ceramic 60-minute bezel, a gloss
 * black dial of big lume dots with a triangle at 12, Mercedes hands, a
 * cyclops over the date and a three-link bracelet.
 */
export const DIVER: WatchSpec = {
  id: 'diver',
  name: 'Diver',
  rules: DIVER_RULES,
  targetTrack: 'bezel',
  case: {
    style: 'oyster',
    radius: 1.36,
    height: 0.38,
    metal: BRUSHED_STEEL,
    accentMetal: POLISHED_STEEL,
    crown: 'screwDown',
    crownGuards: true,
    pushers: 'none',
  },
  bezel: {
    type: 'diveTimer',
    inner: 1.08,
    outer: 1.4,
    height: 0.175,
    insert: { inner: 1.1, outer: 1.31 },
    insertColor: '#0a0b0d',
    printColor: '#dde0e4',
    grip: 120,
  },
  dial: {
    style: 'maxi',
    color: '#07080a',
    finish: 'gloss',
    printColor: '#eceef0',
    label: 'DIVER',
    sublabel: '300m = 1000ft',
  },
  date: { at: 'three', cyclops: true },
  hands: {
    hour: 'mercedes',
    minute: 'sword',
    seconds: 'lollipop',
    metal: WHITE_GOLD,
    secondsColor: '#eceef1',
    lume: true,
  },
  lume: { color: '#bff0dc', day: 0.08, night: 2.4 },
  strap: { type: 'oyster' },
  complications: {},
  accents: {
    target: '#f2a33a',
    print: '#eceef0',
    dateWheel: '#f6f4ef',
    dateText: '#111317',
  },
};
