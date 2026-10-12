import { GMT_RULES } from '../game/index.js';
import { BRUSHED_STEEL, POLISHED_STEEL, WHITE_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the pilots' two-time-zone classic: a red and blue 24-hour bezel, a
 * red arrow-tipped GMT hand, Mercedes hands, a cyclops and a five-link
 * bracelet.
 */
export const GMT: WatchSpec = {
  id: 'gmt',
  name: 'GMT',
  rules: GMT_RULES,
  targetTrack: 'bezel',
  case: {
    style: 'oyster',
    radius: 1.36,
    height: 0.36,
    metal: BRUSHED_STEEL,
    accentMetal: POLISHED_STEEL,
    crown: 'screwDown',
    crownGuards: true,
    pushers: 'none',
  },
  bezel: {
    type: 'gmt24',
    inner: 1.08,
    outer: 1.4,
    height: 0.17,
    insert: { inner: 1.1, outer: 1.31 },
    dayColor: '#1c3d8f',
    nightColor: '#b52430',
    printColor: '#e9ecef',
    grip: 120,
  },
  dial: {
    style: 'maxi',
    color: '#07080a',
    finish: 'gloss',
    printColor: '#eceef0',
    label: 'GMT',
    sublabel: 'TWO TIME ZONES',
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
  lume: { color: '#bff0dc', day: 0.08, night: 2.3 },
  strap: { type: 'jubilee' },
  complications: { gmt: { style: 'arrow', color: '#c8303a' } },
  accents: {
    target: '#f2a33a',
    print: '#c8303a',
    dateWheel: '#f6f4ef',
    dateText: '#111317',
  },
};
