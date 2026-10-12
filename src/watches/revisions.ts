import type { WatchId } from './ids.js';

/**
 * Which revision of its rules each watch plays by. A seed deals the same
 * targets only under the same rules, so a challenge link carries the
 * revision it was set on, and a link set on other rules says its targets
 * will differ. Bump a watch's revision with any change to its plans: the
 * moment its golden master (src/game/golden.test.ts) changes. Kept apart
 * from the specs, like the ids, so links can be read without them. The
 * GMT's gate widened its targets (2 for it and the Grand Complication);
 * then every hand was slowed (one more for each).
 */
export const RULES_REVISION: Readonly<Record<WatchId, number>> = {
  diver: 2,
  chronograph: 2,
  gmt: 3,
  moonphase: 2,
  tourbillon: 2,
  grandComplication: 3,
  field: 1,
  pilot: 1,
  digital: 1,
};
