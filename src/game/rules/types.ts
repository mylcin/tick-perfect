import type { Direction } from '../angle.js';
import type { DifficultyConfig, GapConfig } from '../difficulty.js';
import type { ScoringConfig } from '../scoring.js';
import type { TimingConfig } from '../timing.js';

/**
 * The ring that carries the target: a static minute track, a diver's bezel or
 * a turning chapter ring. Targets always sit on one of its minute marks.
 */
export interface RingRule {
  /**
   * When the ring turns while the hand approaches a target: never, on
   * targets with the `turn` twist, or all the time.
   */
  readonly turns: 'never' | 'onSpecial' | 'always';
  readonly direction: Direction;
}

/** The ring turns while the hand approaches (the Diver's bezel). */
export interface TurnTwistRule {
  readonly kind: 'turn';
  /** Either way round, picked per target; otherwise the ring's direction. */
  readonly reversible: boolean;
}

/**
 * Two taps on one sweep: a start mark, then a stop mark further on. The hand
 * keeps its direction and speed between them (the Chronograph).
 */
export interface ChronoTwistRule {
  readonly kind: 'chrono';
  /** Replaces parts of the spawn gap on pair targets. */
  readonly gap?: Partial<GapConfig>;
  /** Least time between a late start tap and the stop mark's window. */
  readonly minLeadMs: number;
  /** Farthest the stop mark may sit past the start mark, in degrees. */
  readonly maxSpanDegrees: number;
}

/** The second hand on a GMT dial. */
export interface GmtHandRule {
  /** Degrees it turns per degree the seconds hand closes in on a target. */
  readonly rate: number;
  /** Its arrow's width in degrees; it touches the target edge to edge. */
  readonly width: number;
  /** Where it waits before the first target. */
  readonly restAngle: number;
  /**
   * Least gap, in degrees, between a parked hand and a target it has no
   * business with; closer than that it moves out of the way.
   */
  readonly clearance: number;
}

/**
 * A GMT hand sweeps across the target as the seconds hand arrives. Tapping
 * while it touches the target is a miss, so the player waits for it to leave
 * or beats it before it lands. It never covers the Perfect zone.
 */
export interface GmtTwistRule {
  readonly kind: 'gmt';
  readonly hand: GmtHandRule;
  /** Degrees beyond the Perfect zone that are never covered. */
  readonly guardDegrees: number;
  /** Least part of the hit window that is covered, in degrees. */
  readonly minBlockDegrees: number;
  /**
   * A gated target's hit window, as a multiple of the difficulty's; 1 when
   * absent, as in rule sets stored before gates were widened, which must
   * replay (and compare) exactly as they were. The Perfect window and the
   * open part of the gated flank keep their size, and what the gated flank
   * gains is covered, so the covered part is wide enough to see. The other
   * flank widens too: a gate is a little more forgiving on its open side.
   */
  readonly windowScale?: number;
}

/**
 * The target fades out on the way in and stays hidden until it is hit, so
 * the player must remember where it was (the Moonphase).
 */
export interface MoonTwistRule {
  readonly kind: 'moon';
  readonly gap?: Partial<GapConfig>;
  /** Least time the target is shown in full before it starts to fade. */
  readonly readMs: number;
  /** How long before its hit window it is gone: a range, picked per target. */
  readonly hiddenMs: { readonly min: number; readonly max: number };
  /** Below this, a target hides too late to matter and simply stays. */
  readonly minHiddenMs: number;
  /** Degrees of travel over which it fades out. */
  readonly fadeDegrees: number;
}

/**
 * Now and then the whole watch rocks on the wrist, left and right, while the
 * hand comes in (the Tourbillon, whose cage exists to even out exactly
 * that). Only the view moves: the timing is judged as if it held still.
 */
export interface SwayTwistRule {
  readonly kind: 'sway';
  /** Replaces parts of the spawn gap on swaying targets. */
  readonly gap?: Partial<GapConfig>;
  /** Peak turn of the watch, in degrees: a range, picked per target. */
  readonly tilt: { readonly min: number; readonly max: number };
  /** How long the sway lasts, in ms: a range, picked per target. */
  readonly durationMs: { readonly min: number; readonly max: number };
  /**
   * Where the target centre falls in the sway, as a share of it: a range,
   * picked per target, so the watch is still rocking as the hand arrives.
   */
  readonly centre: { readonly min: number; readonly max: number };
  /** Least time after the sweep starts before the watch begins to rock. */
  readonly leadMs: number;
  /** Swings left and right, in halves: 1.5 is left, right, left. */
  readonly swings: number;
}

/**
 * Now and then the seconds hand stops dead on its way in, as a field
 * watch's does while its crown is pulled to set it to the second
 * (hacking), then sets off again at the same speed (the Field). A tap while
 * it stands is early.
 */
export interface HackTwistRule {
  readonly kind: 'hack';
  /** Replaces parts of the spawn gap on hacked targets. */
  readonly gap?: Partial<GapConfig>;
  /** How long it stands, in ms: a range, picked per target. */
  readonly holdMs: { readonly min: number; readonly max: number };
  /**
   * How far short of the hit window it stops, in ms of travel: a range,
   * picked per target.
   */
  readonly leadMs: { readonly min: number; readonly max: number };
  /** Least travel before it stops, in ms, so it is seen running first. */
  readonly runMs: number;
}

/**
 * Now and then cloud drifts over the dial ahead of the marker and the
 * seconds hand flies on through it, misted but never lost (the Pilot).
 * Only the view changes: the tap is judged as it always is.
 */
export interface CloudTwistRule {
  readonly kind: 'cloud';
  /** Replaces parts of the spawn gap on clouded targets. */
  readonly gap?: Partial<GapConfig>;
  /** Least time the hand runs in clear air before the cloud. */
  readonly readMs: number;
  /**
   * How long before the target centre the hand is in the cloud: a range,
   * picked per target.
   */
  readonly cloudMs: { readonly min: number; readonly max: number };
  /** Below this, there is too little cloud to matter and none comes. */
  readonly minCloudMs: number;
  /** Degrees of travel over which the cloud thickens. */
  readonly fadeDegrees: number;
}

/**
 * Now and then the display counts down to the target in beats, 3, 2, 1, a
 * beep and a flash of its light on each, and the player taps on zero, as a
 * digital's timer beeps through its last seconds (the Digital). The marker
 * stays in sight: this one is for fun. The tap is judged as it always is.
 */
export interface CountdownTwistRule {
  readonly kind: 'countdown';
  readonly gap?: Partial<GapConfig>;
  /** Beats before the one at zero, on the target centre. */
  readonly beats: number;
  /** Time between beats, in ms: a range, picked per target. */
  readonly beatMs: { readonly min: number; readonly max: number };
  /** Least time the sweep runs before the first beat. */
  readonly readMs: number;
}

export type TwistRule =
  | TurnTwistRule
  | ChronoTwistRule
  | GmtTwistRule
  | MoonTwistRule
  | SwayTwistRule
  | HackTwistRule
  | CloudTwistRule
  | CountdownTwistRule;

/** Everything that defines how one watch plays. */
export interface GameRules {
  readonly difficulty: DifficultyConfig;
  readonly scoring: ScoringConfig;
  readonly timing: TimingConfig;
  readonly ring: RingRule;
  /**
   * What a special target can do. A special target uses exactly one, picked
   * per target; mixing several is how Endless plays every watch at once.
   */
  readonly twists: readonly TwistRule[];
  /**
   * A target number that is always special, so the twist shows up early in
   * every round. Its special draw is still made.
   */
  readonly introduceAt?: number;
}
