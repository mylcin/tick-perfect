import { reverse } from './angle.js';
import type { Difficulty, GapConfig } from './difficulty.js';
import { nextChance, targetRolls, type RngState } from './rng.js';
import type { GameRules, RingRule, TwistRule } from './rules/types.js';
import {
  placeTarget,
  type PlannedSegment,
  type SegmentStart,
} from './spawn.js';
import type { Segment } from './timing.js';
import { planChrono } from './twists/chrono.js';
import { planCloud } from './twists/cloud.js';
import { planCountdown } from './twists/countdown.js';
import { gmtGate, parkedGmt } from './twists/gmt.js';
import { planHack } from './twists/hack.js';
import { planMoon } from './twists/moon.js';
import { planSway } from './twists/sway.js';
import type { GmtHand, SegmentTwist } from './twists/types.js';

/** Rolls drawn for every target: which twist, then three for the twist. */
const TARGET_ROLLS = 4;

interface TargetStart extends SegmentStart {
  /** Where the GMT hand was when the last target was hit. */
  readonly gmtAngle?: number;
}

/** Which target of which round is being planned. */
interface TargetKey {
  readonly seed: number;
  /** Targets completed so far; a chronograph pair counts once. */
  readonly target: number;
}

function ringVelocityFor(
  ring: RingRule,
  twist: TwistRule | undefined,
  speed: number,
  roll: number
): number {
  if (ring.turns === 'never') return 0;
  if (ring.turns === 'always') return ring.direction * speed;
  if (twist?.kind !== 'turn') return 0;
  const direction =
    twist.reversible && roll >= 0.5 ? reverse(ring.direction) : ring.direction;
  return direction * speed;
}

function gapFor(rules: GameRules, twist: TwistRule | undefined): GapConfig {
  const base = rules.difficulty.gap;
  const override =
    twist?.kind === 'chrono' ||
    twist?.kind === 'moon' ||
    twist?.kind === 'sway' ||
    twist?.kind === 'hack' ||
    twist?.kind === 'cloud' ||
    twist?.kind === 'countdown'
      ? twist.gap
      : undefined;
  return override ? { ...base, ...override } : base;
}

function twistFor(
  twist: TwistRule | undefined,
  segment: Segment,
  step: number,
  first: number,
  second: number,
  third: number
): { twist?: SegmentTwist; gmt?: GmtHand } | null {
  switch (twist?.kind) {
    case undefined:
      return null;
    case 'turn':
      return {};
    case 'chrono': {
      const pair = planChrono(segment, step, twist, first);
      return pair && { twist: pair };
    }
    case 'moon': {
      const hide = planMoon(segment, step, twist, first);
      return hide && { twist: hide };
    }
    case 'gmt': {
      const { gate, hand } = gmtGate(segment, twist, first, second);
      return { twist: gate, gmt: hand };
    }
    case 'sway':
      return { twist: planSway(segment, step, twist, first, second, third) };
    case 'hack': {
      const hack = planHack(segment, step, twist, first, second);
      return hack && { twist: hack };
    }
    case 'cloud': {
      const cover = planCloud(segment, step, twist, first);
      return cover && { twist: cover };
    }
    case 'countdown': {
      const timer = planCountdown(segment, step, twist, first);
      return timer && { twist: timer };
    }
  }
}

/**
 * Plans the next target for any watch: the base plan (a special draw, then
 * the marks ahead, both from the round's RNG) plus what the watch's twist
 * adds. The twist's own choices come from `targetRolls`, so the round's
 * draws stay exactly as the base game makes them, and a seed always gives
 * the same targets with the same twists.
 */
export function planTarget(
  start: TargetStart,
  difficulty: Difficulty,
  rules: GameRules,
  rng: RngState,
  key: TargetKey
): PlannedSegment {
  const [drawn, afterSpecial] = nextChance(rng, difficulty.specialChance);
  const [pick = 0, first = 0, second = 0, third = 0] = targetRolls(
    key.seed,
    key.target,
    TARGET_ROLLS
  );
  const { twists } = rules;
  const special = drawn || key.target === rules.introduceAt;
  const rule = special
    ? twists[Math.min(Math.floor(pick * twists.length), twists.length - 1)]
    : undefined;

  const placed = placeTarget(start, difficulty, rules, afterSpecial, {
    special: rule !== undefined,
    ringVelocity: ringVelocityFor(
      rules.ring,
      rule,
      difficulty.ringSpeed,
      first
    ),
    gap: gapFor(rules, rule),
    // A gate widens its target; what its gated flank gains is covered.
    windowScale: rule?.kind === 'gmt' ? (rule.windowScale ?? 1) : 1,
  });
  const base = placed.segment;
  const added = twistFor(rule, base, placed.step, first, second, third);

  const gmtRule = twists.find(twist => twist.kind === 'gmt');
  let gmt = added?.gmt;
  if (gmtRule && !gmt) {
    const pair = added?.twist?.kind === 'chrono' ? added.twist : null;
    const twisted = added?.twist ? { ...base, twist: added.twist } : base;
    gmt = parkedGmt(
      twisted,
      gmtRule,
      start.gmtAngle ?? gmtRule.hand.restAngle,
      [
        { mark: base.target.mark, progress: 0 },
        ...(pair?.leg === 'start'
          ? [{ mark: pair.stopMark, progress: pair.span }]
          : []),
      ]
    );
  }

  const segment: Segment = {
    ...base,
    special: added !== null,
    ...(added?.twist && { twist: added.twist }),
    ...(gmt && { gmt }),
  };
  return { segment, rng: placed.rng };
}
