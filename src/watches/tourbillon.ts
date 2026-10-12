import { TOURBILLON_RULES } from '../game/index.js';
import { CARBON, POLISHED_TITANIUM } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the modern racing tourbillons: a curved tonneau of forged carbon
 * with a screwed bezel plate, no dial but the movement itself under a
 * chapter ring, skeleton hands and a red seconds hand.
 */
export const TOURBILLON: WatchSpec = {
  id: 'tourbillon',
  name: 'Tourbillon',
  rules: TOURBILLON_RULES,
  targetTrack: 'chapter',
  case: {
    style: 'tonneau',
    radius: 1.34,
    length: 1.64,
    height: 0.4,
    metal: CARBON,
    composite: { kind: 'forged' },
    accentMetal: POLISHED_TITANIUM,
    crown: 'barrel',
    crownGuards: false,
    pushers: 'none',
  },
  bezel: {
    type: 'screwPlate',
    inner: 1.07,
    outer: 1.3,
    height: 0.18,
    screws: 8,
  },
  dial: {
    style: 'skeleton',
    color: '#16181c',
    finish: 'matte',
    printColor: '#f1f1f1',
    label: 'TOURBILLON',
    // Grey titanium bridges over a dark plate, the train in gilt brass.
    movement: {
      plate: '#22252a',
      bridges: { color: '#9da3aa', roughness: 0.3, brushing: 0.7 },
      gears: { color: '#d9b26a', roughness: 0.22, brushing: 0.3 },
    },
  },
  date: { at: 'three', cyclops: false },
  hands: {
    hour: 'skeleton',
    minute: 'skeleton',
    seconds: 'skeleton',
    metal: POLISHED_TITANIUM,
    secondsColor: '#e2452f',
    lume: true,
  },
  lume: { color: '#d6ff7a', day: 0.1, night: 2.2 },
  strap: { type: 'rubber', color: '#121315' },
  complications: { tourbillon: { slot: 'six', bridge: '#c9ced4' } },
  accents: {
    target: '#c6ff3d',
    print: '#e2452f',
    dateWheel: '#f3f1ec',
    dateText: '#111317',
  },
};
