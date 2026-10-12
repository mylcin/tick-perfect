import {
  closingSpeed,
  countdownAt,
  gateSpan,
  gmtAngleAt,
  handAngleAt,
  isHeldAt,
  isSwayingAt,
  MS_PER_SECOND,
  normalizeAngle,
  progressAt,
  ringAngleAt,
  swayAt,
  targetCenterAt,
  targetVisibilityAt,
  type CountdownState,
  type Direction,
  type GameState,
  type GmtGate,
  type HitLeg,
  type HitQuality,
  type Segment,
} from '../game';

// What the scene needs from the game each frame. The scene asks for a pose
// with the current time instead of receiving props, so the hands move every
// frame without React re-rendering anything.

export interface TargetPose {
  /** Position on its ring, degrees clockwise from 12. */
  readonly mark: number;
  /** Full width in degrees. */
  readonly width: number;
  /** Degrees either side of the centre that score a Perfect. */
  readonly perfectWindow: number;
  /** The only mark, or the start or stop mark of a chronograph pair. */
  readonly role: HitLeg;
  /** 1 in full view, 0 hidden (a Moonphase target on its way in). */
  readonly visibility: number;
  /** The part a GMT gate covers; null on a sweep without one. */
  readonly gate: GatePose | null;
}

/**
 * A GMT gate, drawn where the game judges it: the part of the target the
 * GMT hand covers by the time the seconds hand gets there. The ring holds
 * still on a gate, so the part stays put while the hand comes in, and a
 * tap with the seconds hand on it is blocked.
 */
interface GatePose {
  /**
   * The covered part, in degrees clockwise from the mark (`from` below
   * `to`), within the drawn target.
   */
  readonly from: number;
  readonly to: number;
  /** Where the covered part meets the open one, the gate line. */
  readonly edge: number;
  /** Covered until the seconds hand crosses the line (wait), or after. */
  readonly side: GmtGate['side'];
  /**
   * Milliseconds since the seconds hand crossed the line, which is exactly
   * when the judgement flips; null before.
   */
  readonly crossed: number | null;
}

/** A chronograph pair: both marks, and the stopwatch once it runs. */
export interface ChronoPose {
  readonly startMark: number;
  readonly stopMark: number;
  /** Degrees from the start mark to the stop mark, along `direction`. */
  readonly span: number;
  readonly direction: Direction;
  /** Milliseconds since the start tap; null until then. */
  readonly elapsed: number | null;
}

/** The target that was just hit, flashing where it stood on the bezel. */
export interface HitPose {
  readonly mark: number;
  readonly width: number;
  readonly quality: HitQuality;
  readonly leg: HitLeg;
  /** Milliseconds since the hit. */
  readonly age: number;
}

/** The crystal cracking where the seconds hand stopped. */
export interface CrackPose {
  /** Degrees clockwise from 12. */
  readonly angle: number;
  /** Milliseconds since the miss. */
  readonly age: number;
  /** Picks the crack pattern. */
  readonly seed: number;
}

export interface WatchPose {
  /** Seconds hand, degrees clockwise from 12. */
  readonly seconds: number;
  /** Rotation of the ring (bezel) that carries the target. */
  readonly ring: number;
  readonly target: TargetPose | null;
  /**
   * Outside a round the hands ease to their angles instead of jumping there.
   * During a round they are always drawn exactly where the game has them.
   */
  readonly eased: boolean;
  readonly hit: HitPose | null;
  readonly crack: CrackPose | null;
  readonly chrono: ChronoPose | null;
  /** GMT hand, degrees clockwise from 12; null to let it rest. */
  readonly gmt: number | null;
  /**
   * How far the whole watch is turned while it rocks on the wrist, in
   * degrees; null while it isn't rocking, to let it settle.
   */
  readonly sway: number | null;
  /** The crown pulled out, the seconds hand stopped (a Field's hack). */
  readonly hacked: boolean;
  /** The cloud it is lost in; null on a clear sweep. */
  readonly cloud: CloudPose | null;
  /** Where a Digital's countdown stands; null when it shows the time. */
  readonly countdown: CountdownState | null;
}

/**
 * The cloud over the dial on a Pilot's clouded sweep: from ahead of the
 * marker to just past it. It rolls in as the hand comes on.
 */
export interface CloudPose {
  /** Where it starts, degrees clockwise from 12, and its clockwise span. */
  readonly from: number;
  readonly length: number;
  /** 0 to 1. */
  readonly density: number;
}

/** Degrees of travel before the fade over which the cloud rolls in. */
const CLOUD_ROLL = 40;
/** How far past the hit window the cloud reaches, in degrees. */
const CLOUD_BEYOND = 8;

export type PoseSource = (now: number) => WatchPose;

/** No round: the seconds hand rests at 12 and nothing is marked. */
export const RESTING: WatchPose = {
  seconds: 0,
  ring: 0,
  target: null,
  eased: true,
  hit: null,
  crack: null,
  chrono: null,
  gmt: null,
  sway: null,
  hacked: false,
  cloud: null,
  countdown: null,
};

interface PoseOptions {
  /** Where the seconds hand rests outside a round. */
  readonly idleSeconds: number;
  /**
   * When the game noticed the round was over. A hand that runs past the
   * target ends the round a moment after it left the hit window; freezing
   * at that later moment keeps the hand from jumping back.
   */
  readonly endedAt?: number;
}

/**
 * The pose for a game state at `now`. A paused or finished round shows the
 * moment it stopped.
 */
export function poseFromGame(
  state: GameState,
  now: number,
  { idleSeconds, endedAt }: PoseOptions
): WatchPose {
  if (state.phase === 'idle') {
    return {
      seconds: idleSeconds,
      ring: 0,
      target: null,
      eased: true,
      hit: null,
      crack: null,
      chrono: null,
      gmt: null,
      sway: null,
      hacked: false,
      cloud: null,
      countdown: null,
    };
  }
  const time =
    state.phase === 'paused'
      ? state.pausedAt
      : state.phase === 'gameOver'
        ? Math.max(state.miss.time, endedAt ?? state.miss.time)
        : now;
  const { segment } = state.round;
  const { twist } = segment;
  return {
    seconds: handAngleAt(segment, time),
    ring: ringAngleAt(segment, time),
    target: {
      mark: segment.target.mark,
      width: segment.target.width,
      perfectWindow: segment.target.perfectWindow,
      role: twist?.kind === 'chrono' ? twist.leg : 'single',
      // Once the round is over, a hidden target shows where it was.
      visibility:
        state.phase === 'gameOver' ? 1 : targetVisibilityAt(segment, time),
      gate: gatePose(segment, time),
    },
    eased: false,
    hit: null,
    crack: null,
    chrono: chronoPose(segment, time),
    gmt: gmtAngleAt(segment, time),
    sway: isSwayingAt(segment, time) ? swayAt(segment, time) : null,
    hacked: state.phase !== 'gameOver' && isHeldAt(segment, time),
    cloud: state.phase === 'gameOver' ? null : cloudPose(segment, time),
    countdown: state.phase === 'gameOver' ? null : countdownAt(segment, time),
  };
}

function cloudPose(segment: Segment, time: number): CloudPose | null {
  const { twist, direction } = segment;
  if (twist?.kind !== 'cloud') return null;
  const start = twist.from - twist.fade;
  const end = segment.target.hitWindow + CLOUD_BEYOND;
  const centre = targetCenterAt(segment, time);
  // The hand is `direction × progress` from the centre; clockwise, the
  // band runs from whichever end comes first.
  const first = direction > 0 ? start : -end;
  return {
    from: normalizeAngle(centre + first),
    length: end - start,
    density: Math.min(
      Math.max(
        (progressAt(segment, time) - (start - CLOUD_ROLL)) / CLOUD_ROLL,
        0
      ),
      1
    ),
  };
}

function gatePose(segment: Segment, time: number): GatePose | null {
  const { twist, direction } = segment;
  const span = gateSpan(segment);
  if (twist?.kind !== 'gmt' || !span) return null;
  // The seconds hand is `direction × progress` from the mark; the drawn
  // target stops short of the window by the edge tolerance.
  const half = segment.target.width / 2;
  const onTarget = (progress: number) =>
    Math.min(half, Math.max(-half, direction * progress));
  const ends = [onTarget(span.from), onTarget(span.to)];
  const line = twist.side === 'wait' ? span.to : span.from;
  const past = progressAt(segment, time) - line;
  return {
    from: Math.min(...ends),
    to: Math.max(...ends),
    edge: onTarget(line),
    side: twist.side,
    crossed: past >= 0 ? (past / closingSpeed(segment)) * MS_PER_SECOND : null,
  };
}

function chronoPose(segment: Segment, time: number): ChronoPose | null {
  const { twist, target, direction } = segment;
  if (twist?.kind !== 'chrono') return null;
  if (twist.leg === 'start') {
    return {
      startMark: target.mark,
      stopMark: twist.stopMark,
      span: twist.span,
      direction,
      elapsed: null,
    };
  }
  return {
    startMark: twist.startMark,
    stopMark: target.mark,
    span: normalizeAngle((target.mark - twist.startMark) * direction),
    direction,
    elapsed: time - segment.startTime,
  };
}
