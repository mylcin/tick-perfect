import {
  ANGLE_EPSILON,
  forwardDistance,
  MINUTE_MARK,
  normalizeAngle,
  rotate,
  type Direction,
} from './angle.js';
import { difficultyAt, type Difficulty, type GapConfig } from './difficulty.js';
import { nextChance, nextInt, type RngState } from './rng.js';
import type { GameRules, RingRule } from './rules/types.js';
import {
  MS_PER_SECOND,
  type Segment,
  type Target,
  type TimingConfig,
} from './timing.js';

/** Where the hand and the ring are when a new sweep begins. */
export interface SegmentStart {
  readonly time: number;
  readonly handAngle: number;
  readonly direction: Direction;
  readonly ringAngle: number;
}

export interface PlannedSegment {
  readonly segment: Segment;
  readonly rng: RngState;
}

function ringVelocityFor(ring: RingRule, special: boolean, speed: number) {
  const turns =
    ring.turns === 'always' || (ring.turns === 'onSpecial' && special);
  return turns ? ring.direction * speed : 0;
}

export function snapToMark(angle: number): number {
  return normalizeAngle(Math.round(angle / MINUTE_MARK) * MINUTE_MARK);
}

/** Everything about a new target that is settled before it is placed. */
interface Placement {
  readonly special: boolean;
  /** Ring speed in degrees per second; positive is clockwise. */
  readonly ringVelocity: number;
  readonly gap: GapConfig;
  /** The hit window as a multiple of the difficulty's; 1 when absent. */
  readonly windowScale?: number;
}

/** How wide a target is drawn, and the windows that judge a tap on it. */
type TargetWindows = Pick<Target, 'width' | 'hitWindow' | 'perfectWindow'>;

/**
 * Turns the difficulty's windows, which are times, into degrees on the ring:
 * as many as the hand closes in on the target in that long. The drawn target
 * stops short of the hit window by the edge tolerance. `scale` widens the
 * hit window (a GMT gate's), never the Perfect one.
 */
export function targetWindows(
  closing: number,
  difficulty: Difficulty,
  timing: TimingConfig,
  scale = 1
): TargetWindows {
  const degreesIn = (ms: number) => (closing * ms) / MS_PER_SECOND;
  const hitWindow = degreesIn(difficulty.hitWindowMs * scale);
  const width = 2 * (hitWindow - timing.hitToleranceDegrees);
  if (width <= 0) {
    throw new RangeError(
      `A ±${String(difficulty.hitWindowMs)} ms window at ${String(closing)}°/s is no wider than the edge tolerance`
    );
  }
  return {
    width,
    hitWindow,
    perfectWindow: Math.min(degreesIn(difficulty.perfectWindowMs), width / 2),
  };
}

/** How wide a round's first target is drawn, on a ring that holds still. */
export function firstTargetWidth(rules: GameRules): number {
  const first = difficultyAt(rules.difficulty, 0);
  return targetWindows(first.handSpeed, first, rules.timing).width;
}

interface PlacedSegment extends PlannedSegment {
  /** Whole minute marks between the hand and the target, past the first. */
  readonly step: number;
}

/**
 * Places the next target on a minute mark of its ring, ahead of the hand in
 * its new direction. Draws once from the RNG.
 *
 * The distance is drawn as a number of marks ahead whose range doesn't
 * depend on where exactly the hand stopped. So the n-th target of a seed is
 * the same for every player: same number of marks ahead.
 */
export function placeTarget(
  start: SegmentStart,
  difficulty: Difficulty,
  rules: GameRules,
  rng: RngState,
  { special, ringVelocity, gap, windowScale }: Placement
): PlacedSegment {
  const closing = difficulty.handSpeed - start.direction * ringVelocity;
  if (closing <= 0) {
    throw new RangeError(
      `The ring (${String(ringVelocity)}°/s) must turn slower than the hand (${String(difficulty.handSpeed)}°/s)`
    );
  }

  const minGap = Math.max(
    gap.minDegrees,
    (closing * gap.minLeadMs) / MS_PER_SECOND
  );

  // Forward distances from the hand to the ring's marks are firstMark,
  // firstMark + 6, firstMark + 12, … with firstMark in [0, 6). Choosing
  // `step` marks past the first keeps the distance in [minGap, maxDegrees)
  // wherever firstMark falls.
  const firstMark =
    forwardDistance(start.handAngle, start.ringAngle, start.direction) %
    MINUTE_MARK;
  const minStep = Math.ceil(minGap / MINUTE_MARK - ANGLE_EPSILON);
  const maxStep = Math.floor(gap.maxDegrees / MINUTE_MARK + ANGLE_EPSILON) - 1;
  if (minStep > maxStep) {
    throw new RangeError(
      `No minute mark lies ${String(minGap)}–${String(gap.maxDegrees)}° ahead`
    );
  }
  const [step, next] = nextInt(rng, minStep, maxStep);

  const approach = firstMark + step * MINUTE_MARK;
  const center = rotate(start.handAngle, start.direction * approach);
  const windows = targetWindows(closing, difficulty, rules.timing, windowScale);

  return {
    segment: {
      startTime: start.time,
      handAngle: start.handAngle,
      direction: start.direction,
      speed: difficulty.handSpeed,
      ringAngle: start.ringAngle,
      ringVelocity,
      target: {
        mark: snapToMark(center - start.ringAngle),
        ...windows,
      },
      approach,
      special,
    },
    rng: next,
    step,
  };
}

/**
 * Plans the next sweep the base way: draws whether the target is special,
 * then places it. Special targets turn an `onSpecial` ring. Every call
 * draws twice from the RNG.
 */
export function planSegment(
  start: SegmentStart,
  difficulty: Difficulty,
  rules: GameRules,
  rng: RngState
): PlannedSegment {
  const [special, afterSpecial] = nextChance(rng, difficulty.specialChance);
  const { segment, rng: next } = placeTarget(
    start,
    difficulty,
    rules,
    afterSpecial,
    {
      special,
      ringVelocity: ringVelocityFor(rules.ring, special, difficulty.ringSpeed),
      gap: rules.difficulty.gap,
    }
  );
  return { segment, rng: next };
}
