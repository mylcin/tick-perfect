// What a twist adds to one sweep of the seconds hand. Positions are minute
// marks on the target ring, and moments are progress: degrees past the
// target centre, as `progressAt` measures them. Never timestamps, so a
// pause (which shifts the sweep in time) changes nothing.

/** The start mark of a chronograph pair; the stop mark lies `span` on. */
export interface ChronoStart {
  readonly kind: 'chrono';
  readonly leg: 'start';
  /** The stop mark, on the target ring. */
  readonly stopMark: number;
  /** Degrees from the start mark's centre to the stop mark's, along travel. */
  readonly span: number;
}

/** The stop mark of a pair, after its start mark was hit. */
export interface ChronoStop {
  readonly kind: 'chrono';
  readonly leg: 'stop';
  /** Where the pair started, on the target ring. */
  readonly startMark: number;
}

/** A GMT hand gate: the player waits for the hand to leave, or beats it. */
export interface GmtGate {
  readonly kind: 'gmt';
  readonly side: 'wait' | 'beat';
  /**
   * Progress either side of the centre that stays open: the Perfect zone,
   * the guard beyond it and some of the window. The covered flank runs on
   * from here to the edge of the hit window.
   */
  readonly clear: number;
}

/** A target that fades out on the way in. */
export interface MoonHide {
  readonly kind: 'moon';
  /** Progress at which the target is fully hidden (negative: before it). */
  readonly hideFrom: number;
  /** Degrees of progress over which it fades out before `hideFrom`. */
  readonly fade: number;
}

/**
 * The whole watch rocks on the wrist while the hand comes in, from progress
 * `from` until `length` degrees of progress later: a short turn the way of
 * `tilt`'s sign, the full `tilt` back the other way mid-sway, then a short
 * turn again as it settles (`swings` halves in all).
 */
export interface Sway {
  readonly kind: 'sway';
  /** Progress at which it starts (negative: before the target centre). */
  readonly from: number;
  /** Degrees of progress it lasts. */
  readonly length: number;
  /** Largest turn in degrees, never exceeded; its sign is the way it turns
   * first. */
  readonly tilt: number;
  /** Swings left and right, in halves. */
  readonly swings: number;
}

/**
 * The seconds hand stops at progress `at` (negative: before the target
 * centre) and stands for `holdMs` before it runs on. Unlike every other
 * twist, this one changes the motion: the timing waits with the hand.
 */
export interface Hack {
  readonly kind: 'hack';
  readonly at: number;
  /** How long it stands: a duration, so a pause still changes nothing. */
  readonly holdMs: number;
}

/**
 * The display counts down to the target in beats, a beep and a flash on
 * each, as a digital's timer does over its last seconds: the last beat
 * falls on the target centre.
 */
export interface Countdown {
  readonly kind: 'countdown';
  /** Beats before the one at the centre. */
  readonly beats: number;
  /** Time between beats, in ms. */
  readonly beatMs: number;
}

/** Cloud over the dial, from ahead of the marker to past it. */
export interface CloudCover {
  readonly kind: 'cloud';
  /** Progress from which the cloud is at its thickest (negative: before). */
  readonly from: number;
  /** Degrees of progress over which it thickens before `from`. */
  readonly fade: number;
}

export type SegmentTwist =
  | ChronoStart
  | ChronoStop
  | GmtGate
  | MoonHide
  | Sway
  | Hack
  | CloudCover
  | Countdown;

/**
 * Where the GMT hand is during a sweep. It turns clockwise at `rate`
 * degrees per degree of progress and points at `angle` (degrees clockwise
 * from 12, on the dial) at progress `cross`. A parked hand has rate 0.
 */
export interface GmtHand {
  readonly angle: number;
  readonly rate: number;
  readonly cross: number;
  /**
   * Half the arc it covers on a target: half the target plus half the
   * hand. Closer than this to the target centre, it touches the target.
   */
  readonly reach: number;
}
