import { CLOCKWISE, COUNTERCLOCKWISE } from '../angle.js';
import type { DifficultyConfig, Ramp } from '../difficulty.js';
import type { MultiplierTier, ScoringConfig } from '../scoring.js';
import type { TimingConfig } from '../timing.js';
import type { GameRules, RingRule, TwistRule } from './types.js';

// Rule sets can arrive from outside the code: an admin tuning a watch, or a
// server sending the rules a round is played by. Before the engine sees
// one, every field is checked for its type and a sane range, and anything
// unknown is refused, so a typo can't slip through as a silent default.

type RulesCheck =
  | { readonly ok: true; readonly rules: GameRules }
  | { readonly ok: false; readonly errors: readonly string[] };

type Json = Record<string, unknown>;

class Checker {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string, keys: readonly string[]): Json | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(path, 'must be an object');
      return null;
    }
    for (const key of Object.keys(value)) {
      if (!keys.includes(key))
        this.fail(`${path}.${key}`, 'is not a known field');
    }
    return value as Json;
  }

  number(
    value: unknown,
    path: string,
    min: number,
    max: number,
    { integer = false } = {}
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(path, 'must be a number');
      return min;
    }
    if (integer && !Number.isInteger(value)) this.fail(path, 'must be whole');
    if (value < min || value > max) {
      this.fail(path, `must be between ${String(min)} and ${String(max)}`);
    }
    return value;
  }

  oneOf<T extends string | number>(
    value: unknown,
    path: string,
    options: readonly [T, ...T[]]
  ): T {
    if (!options.includes(value as T)) {
      this.fail(path, `must be one of ${options.join(', ')}`);
      return options[0];
    }
    return value as T;
  }

  range(
    value: unknown,
    path: string,
    min: number,
    max: number
  ): { min: number; max: number } {
    const range = this.object(value, path, ['min', 'max']);
    const low = this.number(range?.['min'], `${path}.min`, min, max);
    const high = this.number(range?.['max'], `${path}.max`, min, max);
    if (low > high) this.fail(path, 'min must not be above max');
    return { min: low, max: high };
  }
}

function ramp(
  c: Checker,
  value: unknown,
  path: string,
  min: number,
  max: number
): Ramp {
  const r = c.object(value, path, ['start', 'limit', 'rate']);
  return {
    start: c.number(r?.['start'], `${path}.start`, min, max),
    limit: c.number(r?.['limit'], `${path}.limit`, min, max),
    rate: c.number(r?.['rate'], `${path}.rate`, 0.001, 1),
  };
}

function difficulty(c: Checker, value: unknown): DifficultyConfig {
  const d = c.object(value, 'difficulty', [
    'handSpeed',
    'hitWindowMs',
    'perfectWindowMs',
    'specialChance',
    'ringSpeed',
    'gap',
  ]);
  const gap = c.object(d?.['gap'], 'difficulty.gap', [
    'minDegrees',
    'maxDegrees',
    'minLeadMs',
  ]);
  const config: DifficultyConfig = {
    handSpeed: ramp(c, d?.['handSpeed'], 'difficulty.handSpeed', 30, 720),
    hitWindowMs: ramp(c, d?.['hitWindowMs'], 'difficulty.hitWindowMs', 10, 400),
    perfectWindowMs: ramp(
      c,
      d?.['perfectWindowMs'],
      'difficulty.perfectWindowMs',
      1,
      200
    ),
    specialChance: ramp(
      c,
      d?.['specialChance'],
      'difficulty.specialChance',
      0,
      1
    ),
    ringSpeed: ramp(c, d?.['ringSpeed'], 'difficulty.ringSpeed', 0, 180),
    gap: {
      minDegrees: c.number(
        gap?.['minDegrees'],
        'difficulty.gap.minDegrees',
        6,
        300
      ),
      maxDegrees: c.number(
        gap?.['maxDegrees'],
        'difficulty.gap.maxDegrees',
        12,
        354
      ),
      minLeadMs: c.number(
        gap?.['minLeadMs'],
        'difficulty.gap.minLeadMs',
        0,
        3000
      ),
    },
  };
  if (config.gap.minDegrees >= config.gap.maxDegrees) {
    c.fail('difficulty.gap', 'minDegrees must be below maxDegrees');
  }
  return config;
}

function scoring(c: Checker, value: unknown): ScoringConfig {
  const s = c.object(value, 'scoring', [
    'goodPoints',
    'perfectPoints',
    'multipliers',
  ]);
  const list = s?.['multipliers'];
  const tiers: MultiplierTier[] = [];
  if (!Array.isArray(list) || list.length === 0 || list.length > 6) {
    c.fail('scoring.multipliers', 'must list 1 to 6 tiers');
  } else {
    list.forEach((item: unknown, index) => {
      const path = `scoring.multipliers.${String(index)}`;
      const tier = c.object(item, path, ['streak', 'factor']);
      const next = {
        streak: c.number(tier?.['streak'], `${path}.streak`, 1, 100, {
          integer: true,
        }),
        factor: c.number(tier?.['factor'], `${path}.factor`, 1, 20),
      };
      const before = tiers.at(-1);
      if (
        before &&
        (next.streak <= before.streak || next.factor <= before.factor)
      ) {
        c.fail(path, 'must need a longer streak for a larger factor');
      }
      tiers.push(next);
    });
  }
  return {
    goodPoints: c.number(s?.['goodPoints'], 'scoring.goodPoints', 0, 100, {
      integer: true,
    }),
    perfectPoints: c.number(
      s?.['perfectPoints'],
      'scoring.perfectPoints',
      0,
      100,
      {
        integer: true,
      }
    ),
    multipliers: (tiers.length > 0 ? tiers : [{ streak: 1, factor: 1 }]) as [
      MultiplierTier,
      ...MultiplierTier[],
    ],
  };
}

function timing(c: Checker, value: unknown): TimingConfig {
  const t = c.object(value, 'timing', [
    'hitToleranceDegrees',
    'inputGraceMs',
    'tapDebounceMs',
  ]);
  return {
    hitToleranceDegrees: c.number(
      t?.['hitToleranceDegrees'],
      'timing.hitToleranceDegrees',
      0,
      10
    ),
    inputGraceMs: c.number(t?.['inputGraceMs'], 'timing.inputGraceMs', 0, 500),
    tapDebounceMs: c.number(
      t?.['tapDebounceMs'],
      'timing.tapDebounceMs',
      0,
      200
    ),
  };
}

function ring(c: Checker, value: unknown): RingRule {
  const r = c.object(value, 'ring', ['turns', 'direction']);
  return {
    turns: c.oneOf(r?.['turns'], 'ring.turns', [
      'never',
      'onSpecial',
      'always',
    ] as const),
    direction: c.oneOf(r?.['direction'], 'ring.direction', [
      CLOCKWISE,
      COUNTERCLOCKWISE,
    ] as const),
  };
}

function gapOverride(c: Checker, value: unknown, path: string) {
  if (value === undefined) return {};
  const g = c.object(value, path, ['minDegrees', 'maxDegrees', 'minLeadMs']);
  return {
    gap: {
      ...(g?.['minDegrees'] !== undefined && {
        minDegrees: c.number(g['minDegrees'], `${path}.minDegrees`, 6, 300),
      }),
      ...(g?.['maxDegrees'] !== undefined && {
        maxDegrees: c.number(g['maxDegrees'], `${path}.maxDegrees`, 12, 354),
      }),
      ...(g?.['minLeadMs'] !== undefined && {
        minLeadMs: c.number(g['minLeadMs'], `${path}.minLeadMs`, 0, 3000),
      }),
    },
  };
}

function twist(c: Checker, value: unknown, path: string): TwistRule | null {
  const kind = (value as Json | null)?.['kind'];
  switch (kind) {
    case 'turn': {
      const t = c.object(value, path, ['kind', 'reversible']);
      if (typeof t?.['reversible'] !== 'boolean')
        c.fail(`${path}.reversible`, 'must be true or false');
      return { kind, reversible: t?.['reversible'] === true };
    }
    case 'chrono': {
      const t = c.object(value, path, [
        'kind',
        'gap',
        'minLeadMs',
        'maxSpanDegrees',
      ]);
      return {
        kind,
        ...gapOverride(c, t?.['gap'], `${path}.gap`),
        minLeadMs: c.number(t?.['minLeadMs'], `${path}.minLeadMs`, 0, 3000),
        maxSpanDegrees: c.number(
          t?.['maxSpanDegrees'],
          `${path}.maxSpanDegrees`,
          12,
          300
        ),
      };
    }
    case 'gmt': {
      const t = c.object(value, path, [
        'kind',
        'hand',
        'guardDegrees',
        'minBlockDegrees',
        'windowScale',
      ]);
      const hand = c.object(t?.['hand'], `${path}.hand`, [
        'rate',
        'width',
        'restAngle',
        'clearance',
      ]);
      return {
        kind,
        hand: {
          rate: c.number(hand?.['rate'], `${path}.hand.rate`, 0.01, 2),
          width: c.number(hand?.['width'], `${path}.hand.width`, 0.5, 20),
          restAngle: c.number(
            hand?.['restAngle'],
            `${path}.hand.restAngle`,
            0,
            360
          ),
          clearance: c.number(
            hand?.['clearance'],
            `${path}.hand.clearance`,
            0,
            60
          ),
        },
        guardDegrees: c.number(
          t?.['guardDegrees'],
          `${path}.guardDegrees`,
          0,
          10
        ),
        minBlockDegrees: c.number(
          t?.['minBlockDegrees'],
          `${path}.minBlockDegrees`,
          0,
          20
        ),
        // Rule sets stored before gates were widened have none, and keep
        // none: they replay, and compare with the server's copy, exactly
        // as they were.
        ...(t?.['windowScale'] !== undefined && {
          windowScale: c.number(t['windowScale'], `${path}.windowScale`, 1, 3),
        }),
      };
    }
    case 'moon': {
      const t = c.object(value, path, [
        'kind',
        'gap',
        'readMs',
        'hiddenMs',
        'minHiddenMs',
        'fadeDegrees',
      ]);
      return {
        kind,
        ...gapOverride(c, t?.['gap'], `${path}.gap`),
        readMs: c.number(t?.['readMs'], `${path}.readMs`, 0, 3000),
        hiddenMs: c.range(t?.['hiddenMs'], `${path}.hiddenMs`, 0, 3000),
        minHiddenMs: c.number(
          t?.['minHiddenMs'],
          `${path}.minHiddenMs`,
          0,
          3000
        ),
        fadeDegrees: c.number(t?.['fadeDegrees'], `${path}.fadeDegrees`, 0, 90),
      };
    }
    case 'sway': {
      const t = c.object(value, path, [
        'kind',
        'gap',
        'tilt',
        'durationMs',
        'centre',
        'leadMs',
        'swings',
      ]);
      return {
        kind,
        ...gapOverride(c, t?.['gap'], `${path}.gap`),
        tilt: c.range(t?.['tilt'], `${path}.tilt`, 0, 45),
        durationMs: c.range(t?.['durationMs'], `${path}.durationMs`, 100, 5000),
        centre: c.range(t?.['centre'], `${path}.centre`, 0.05, 0.95),
        leadMs: c.number(t?.['leadMs'], `${path}.leadMs`, 0, 3000),
        swings: c.number(t?.['swings'], `${path}.swings`, 0.5, 6),
      };
    }
    case 'hack': {
      const t = c.object(value, path, [
        'kind',
        'gap',
        'holdMs',
        'leadMs',
        'runMs',
      ]);
      return {
        kind,
        ...gapOverride(c, t?.['gap'], `${path}.gap`),
        holdMs: c.range(t?.['holdMs'], `${path}.holdMs`, 50, 3000),
        leadMs: c.range(t?.['leadMs'], `${path}.leadMs`, 0, 3000),
        runMs: c.number(t?.['runMs'], `${path}.runMs`, 0, 3000),
      };
    }
    case 'cloud': {
      const t = c.object(value, path, [
        'kind',
        'gap',
        'readMs',
        'cloudMs',
        'minCloudMs',
        'fadeDegrees',
      ]);
      return {
        kind,
        ...gapOverride(c, t?.['gap'], `${path}.gap`),
        readMs: c.number(t?.['readMs'], `${path}.readMs`, 0, 3000),
        cloudMs: c.range(t?.['cloudMs'], `${path}.cloudMs`, 0, 3000),
        minCloudMs: c.number(t?.['minCloudMs'], `${path}.minCloudMs`, 0, 3000),
        fadeDegrees: c.number(t?.['fadeDegrees'], `${path}.fadeDegrees`, 0, 90),
      };
    }
    case 'countdown': {
      const t = c.object(value, path, [
        'kind',
        'gap',
        'beats',
        'beatMs',
        'readMs',
      ]);
      return {
        kind,
        ...gapOverride(c, t?.['gap'], `${path}.gap`),
        beats: c.number(t?.['beats'], `${path}.beats`, 1, 5, { integer: true }),
        beatMs: c.range(t?.['beatMs'], `${path}.beatMs`, 100, 1500),
        readMs: c.number(t?.['readMs'], `${path}.readMs`, 0, 3000),
      };
    }
    default:
      c.fail(
        `${path}.kind`,
        'must be turn, chrono, gmt, moon, sway, hack, cloud or countdown'
      );
      return null;
  }
}

/**
 * Checks that `value` is a complete, sane rule set, and returns it typed.
 * It doesn't play it: a rule set can pass every range and still be one the
 * engine refuses (a ring faster than the hand), so try it in a simulated
 * round before it goes live.
 */
export function checkRules(value: unknown): RulesCheck {
  const c = new Checker();
  const r = c.object(value, 'rules', [
    'difficulty',
    'scoring',
    'timing',
    'ring',
    'twists',
    'introduceAt',
  ]);
  const twistList = r?.['twists'];
  const twists: TwistRule[] = [];
  if (
    !Array.isArray(twistList) ||
    twistList.length === 0 ||
    twistList.length > 8
  ) {
    c.fail('twists', 'must list 1 to 8 twists');
  } else {
    twistList.forEach((item: unknown, index) => {
      const checked = twist(c, item, `twists.${String(index)}`);
      if (checked) twists.push(checked);
    });
  }
  const rules: GameRules = {
    difficulty: difficulty(c, r?.['difficulty']),
    scoring: scoring(c, r?.['scoring']),
    timing: timing(c, r?.['timing']),
    ring: ring(c, r?.['ring']),
    twists,
    ...(r?.['introduceAt'] !== undefined && {
      introduceAt: c.number(r['introduceAt'], 'introduceAt', 0, 100, {
        integer: true,
      }),
    }),
  };
  return c.errors.length > 0
    ? { ok: false, errors: c.errors }
    : { ok: true, rules };
}
