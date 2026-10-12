import { CHRONOGRAPH } from './chronograph.js';
import { DIGITAL } from './digital.js';
import { DIVER } from './diver.js';
import { FIELD } from './field.js';
import { GMT } from './gmt.js';
import { GRAND_COMPLICATION } from './grand-complication.js';
import type { WatchId } from './ids.js';
import { MOONPHASE } from './moonphase.js';
import { PILOT } from './pilot.js';
import type { WatchSpec } from './spec.js';
import { TOURBILLON } from './tourbillon.js';

export * from './ids.js';
export * from './revisions.js';
export type * from './spec.js';
export * from './variants.js';
export {
  CHRONOGRAPH,
  DIGITAL,
  DIVER,
  FIELD,
  GMT,
  GRAND_COMPLICATION,
  MOONPHASE,
  PILOT,
  TOURBILLON,
};

/** Every watch, by id. */
export const WATCHES: Readonly<Record<WatchId, WatchSpec>> = {
  diver: DIVER,
  chronograph: CHRONOGRAPH,
  gmt: GMT,
  moonphase: MOONPHASE,
  tourbillon: TOURBILLON,
  grandComplication: GRAND_COMPLICATION,
  field: FIELD,
  pilot: PILOT,
  digital: DIGITAL,
};
