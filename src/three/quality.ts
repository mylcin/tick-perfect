import type { SyncStorage } from '../utils/safe-storage';

// Rendering quality steps, from cheapest to richest. drei's
// PerformanceMonitor moves between them; the game plays the same on all.

export interface QualityTier {
  readonly name: 'low' | 'balanced' | 'medium' | 'high';
  /** Highest device pixel ratio rendered. */
  readonly maxDpr: number;
  /** MSAA samples for the effect composer (cheap on mobile tile GPUs). */
  readonly multisampling: number;
  readonly bloom: boolean;
}

export const QUALITY_TIERS: readonly QualityTier[] = [
  { name: 'low', maxDpr: 1, multisampling: 2, bloom: false },
  // A smaller step down than medium to low, which loses much of the
  // sharpness and all of the glow at once.
  { name: 'balanced', maxDpr: 1.25, multisampling: 2, bloom: true },
  { name: 'medium', maxDpr: 1.5, multisampling: 4, bloom: true },
  { name: 'high', maxDpr: 2, multisampling: 4, bloom: true },
];

export const START_TIER = QUALITY_TIERS.length - 1;

/** The pixel ratio to render at: the device's, capped by the tier (≤ 2). */
export function pixelRatio(tier: QualityTier, devicePixelRatio: number) {
  return Math.min(Math.max(devicePixelRatio, 1), tier.maxDpr);
}

export function lowerTier(index: number): number {
  return Math.max(0, index - 1);
}

export function raiseTier(index: number): number {
  return Math.min(QUALITY_TIERS.length - 1, index + 1);
}

export function tierAt(index: number): QualityTier {
  const tier = QUALITY_TIERS[index];
  if (!tier) throw new RangeError(`No quality tier ${String(index)}`);
  return tier;
}

/**
 * The frame rates between which the tier holds, for a screen refreshing at
 * `refreshRate` (as measured): below the first for most of a few seconds
 * steps down, at the second steps up. drei's default holds anything above
 * 40 fps on a 60 Hz screen, where the seconds hand visibly stutters.
 */
export function tierBounds(refreshRate: number): [number, number] {
  return refreshRate > 100
    ? [refreshRate * 0.75, refreshRate * 0.95]
    : [52, 60];
}

/** Real tier changes allowed before the tier stays put. */
export const MAX_TIER_CHANGES = 4;

export interface TierState {
  readonly index: number;
  /** Tier changes so far. */
  readonly changes: number;
}

export const START_TIER_STATE: TierState = { index: START_TIER, changes: 0 };

/**
 * Where a device keeps the tier it settled on last visit. Apart from the
 * save: it describes the device, not the player, so it never syncs or
 * merges, and losing it costs only a few seconds of stepping down.
 */
export const QUALITY_KEY = 'tick-perfect.quality';

/**
 * Where a visit starts: on the tier this device settled on last time, so a
 * slow one doesn't stutter through the richest tiers again (on the richest
 * the first time). Either way the tier steps up as the frame rate allows.
 */
export function rememberedTierState(storage: SyncStorage): TierState {
  const name = storage.getItem(QUALITY_KEY);
  const index = QUALITY_TIERS.findIndex(tier => tier.name === name);
  return index === -1 ? START_TIER_STATE : { index, changes: 0 };
}

/** Keeps the tier a device moved to for its next visit, by name. */
export function rememberTier(storage: SyncStorage, index: number): void {
  storage.setItem(QUALITY_KEY, tierAt(index).name);
}

/**
 * The tier to draw: the one the frame rate led to or, with battery saver
 * on, the cheapest (no bloom), whatever the device could manage.
 */
export function drawnTier(state: TierState, batterySaver: boolean) {
  return tierAt(batterySaver ? 0 : state.index);
}

/**
 * One step down (performance dropped) or up (it recovered). Steps past
 * either end change nothing and don't count, and after MAX_TIER_CHANGES
 * real changes the tier stays put, so a device hovering between two tiers
 * settles instead of flickering.
 */
export function stepTier(
  state: TierState,
  direction: 'down' | 'up'
): TierState {
  if (state.changes >= MAX_TIER_CHANGES) return state;
  const index =
    direction === 'down' ? lowerTier(state.index) : raiseTier(state.index);
  return index === state.index ? state : { index, changes: state.changes + 1 };
}
