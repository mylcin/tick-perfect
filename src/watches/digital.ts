import { DIGITAL_RULES } from '../game/index.js';
import { POLISHED_STEEL, SATIN_WHITE_GOLD } from './metals.js';
import type { WatchSpec } from './spec.js';

/**
 * After the eight-sided analog-digital of the shock-resistant line: a
 * slim case and guard moulded in black resin, four steel buttons, a black
 * dial of slim batons and thick lumed hands round two liquid crystal
 * windows, the score's at 3 and the time's at 6, on a resin strap.
 */
export const DIGITAL: WatchSpec = {
  id: 'digital',
  name: 'Digital',
  rules: DIGITAL_RULES,
  targetTrack: 'chapter',
  case: {
    style: 'oyster',
    radius: 1.4,
    height: 0.4,
    metal: { color: '#1c1d1f', roughness: 0.66, brushing: 0 },
    composite: { kind: 'resin' },
    accentMetal: POLISHED_STEEL,
    crown: 'none',
    crownGuards: false,
    pushers: 'buttons',
  },
  bezel: {
    type: 'octagon',
    inner: 1.08,
    outer: 1.42,
    height: 0.19,
    insert: { inner: 1.13, outer: 1.37 },
    insertColor: '#1c1d1f',
    printColor: '#c9ccc4',
    grip: 0,
  },
  dial: {
    style: 'anadigi',
    color: '#151617',
    finish: 'matte',
    printColor: '#e8e9ea',
    registerColor: '#a5ac98',
    registerPrint: '#1b1e18',
    label: 'DIGITAL',
    sublabel: 'WATER RESIST 200M',
  },
  date: { at: 'display', cyclops: false },
  hands: {
    hour: 'baton',
    minute: 'baton',
    seconds: 'needle',
    metal: SATIN_WHITE_GOLD,
    secondsColor: '#f1f1ee',
    lume: true,
  },
  // The windows' LED backlight shares the lume's colour.
  lume: { color: '#c5ecff', day: 0.06, night: 2.1 },
  strap: { type: 'rubber', color: '#1c1d1f' },
  complications: {},
  accents: {
    target: '#f2a33a',
    print: '#d23a2e',
    dateWheel: '#a5ac98',
    dateText: '#1b1e18',
  },
};
