import { CHRONOGRAPH_RULES } from '../game/index.js';
import { BRUSHED_STEEL, POLISHED_STEEL } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the sixties aviator-diver chronographs: a black dial with two white
 * registers (running seconds at 9, the 30-minute counter at 3) and the date
 * at 6, a timing bezel that turns either way, pump pushers and a
 * needle-thin chronograph hand with a red arrow tip.
 */
export const CHRONOGRAPH: WatchSpec = {
  id: 'chronograph',
  name: 'Chronograph',
  rules: CHRONOGRAPH_RULES,
  targetTrack: 'bezel',
  case: {
    style: 'tool',
    radius: 1.27,
    height: 0.36,
    metal: BRUSHED_STEEL,
    accentMetal: POLISHED_STEEL,
    crown: 'tool',
    crownGuards: false,
    pushers: 'pump',
  },
  bezel: {
    type: 'minutes60',
    inner: 1.08,
    outer: 1.31,
    height: 0.155,
    insert: { inner: 1.1, outer: 1.27 },
    insertColor: '#0c0d0f',
    printColor: '#f1f0ea',
    grip: 60,
  },
  dial: {
    style: 'panda',
    color: '#0b0b0c',
    finish: 'matte',
    printColor: '#ecebe4',
    label: 'CHRONOGRAPH',
    sublabel: '100 M',
    registerColor: '#e9e7de',
    registerPrint: '#141414',
  },
  date: { at: 'six', cyclops: false },
  hands: {
    hour: 'baton',
    minute: 'baton',
    seconds: 'arrow',
    metal: POLISHED_STEEL,
    secondsColor: '#f3f1ea',
    secondsTip: '#e2452f',
    lume: true,
  },
  lume: { color: '#e9f6ef', day: 0.07, night: 2.1 },
  strap: { type: 'leather', color: '#5a3a24' },
  complications: {
    chronograph: { counter: 'three' },
    smallSeconds: { slot: 'nine' },
  },
  accents: {
    target: '#f2a33a',
    print: '#e2452f',
    dateWheel: '#f6f4ef',
    dateText: '#111317',
  },
};
