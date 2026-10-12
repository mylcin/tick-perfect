import { describe, expect, it } from 'vitest';

import {
  STANDARD,
  VARIANTS,
  variantOf,
  WATCH_ORDER,
  WATCHES,
  withVariant,
  type WatchSpec,
} from '.';

const COLOR = /^#[0-9a-f]{6}$/;

/**
 * Where two specs differ, as dotted paths, and whether every difference is
 * one a variant may make: a colour or a finish. A key on one side only is a
 * change of shape, allowed only inside a finish.
 */
function differences(a: unknown, b: unknown, at = ''): string[] {
  if (a === b) return [];
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap(key =>
      key in a && key in b
        ? differences(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key],
            at ? `${at}.${key}` : key
          )
        : [`${at}.${key} (added or removed)`]
    );
  }
  return [at];
}

function valueAt(spec: WatchSpec, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      spec
    );
}

/**
 * What a variant may change whole: how a dial, the case, its accents, the
 * hands or a skeleton movement are finished, and the strap (another, or a
 * bracelet). Never the shape of the case, the dial or a hand.
 */
const FINISHES = [
  'dial.finish',
  'case.composite',
  'case.metal',
  'case.accentMetal',
  'hands.metal',
  'dial.movement',
  'strap',
];

function allowed(base: WatchSpec, worn: WatchSpec, path: string): boolean {
  // A steel case may be made of a composite, and a composite one of steel.
  const field = path.replace(/ \(added or removed\)$/, '');
  if (
    FINISHES.some(finish => field === finish || field.startsWith(`${finish}.`))
  )
    return true;
  const [before, after] = [valueAt(base, path), valueAt(worn, path)];
  return (
    typeof before === 'string' &&
    typeof after === 'string' &&
    COLOR.test(before) &&
    COLOR.test(after)
  );
}

describe.each(WATCH_ORDER)('%s variants', watch => {
  const base = WATCHES[watch];

  it('are the standard, the Chronometer’s and the Observatory’s', () => {
    expect(VARIANTS[watch].map(({ earnedBy }) => earnedBy)).toEqual([
      null,
      'chronometer',
      'observatory',
    ]);
    expect(VARIANTS[watch][0].id).toBe(STANDARD);
    const ids = VARIANTS[watch].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(VARIANTS[watch].map(({ id }) => id))(
    '%s changes colours, finishes and the strap only, never the rules',
    id => {
      const worn = withVariant(base, id);
      expect(worn.rules).toBe(base.rules);
      const changed = differences(base, worn);
      expect(changed.filter(path => !allowed(base, worn, path))).toEqual([]);
      if (id !== STANDARD) expect(changed.length).toBeGreaterThan(0);
    }
  );

  it('gives the same object for the same variant', () => {
    for (const { id } of VARIANTS[watch]) {
      expect(withVariant(base, id)).toBe(withVariant(base, id));
    }
    expect(withVariant(base, STANDARD)).toBe(base);
  });
});

describe('the Tourbillon’s tiers', () => {
  const yellow = withVariant(WATCHES.tourbillon, 'yellow');
  const orange = withVariant(WATCHES.tourbillon, 'orangeBlack');

  it('go from forged carbon, to forged with yellow fibres, to orange plies', () => {
    expect(WATCHES.tourbillon.case.composite).toEqual({ kind: 'forged' });
    // Each tier a pattern of its own, not the last one recoloured.
    expect(yellow.case.composite).toEqual({ kind: 'forged', flake: '#ffd21f' });
    expect(orange.case.composite).toMatchObject({ kind: 'layered' });
    expect(orange.case.metal.color).not.toBe(
      WATCHES.tourbillon.case.metal.color
    );
  });

  it('refinish the movement and the cage with each tier', () => {
    const finishes = [WATCHES.tourbillon, yellow, orange].map(spec => [
      spec.dial.movement,
      spec.complications.tourbillon?.bridge,
    ]);
    expect(new Set(finishes.map(finish => JSON.stringify(finish))).size).toBe(
      3
    );
  });

  it('keep the case, its size and its parts', () => {
    for (const worn of [yellow, orange]) {
      const shape = (spec: WatchSpec) => ({
        ...spec.case,
        composite: null,
        metal: null,
        accentMetal: null,
      });
      expect(shape(worn)).toEqual(shape(WATCHES.tourbillon));
    }
  });
});

describe('withVariant', () => {
  it('wears the standard for a variant the watch does not have', () => {
    expect(withVariant(WATCHES.diver, 'panda')).toBe(WATCHES.diver);
    expect(withVariant(WATCHES.diver, 'worldtimerOcean')).toBe(WATCHES.diver);
    expect(variantOf('diver', 'panda')).toBeUndefined();
  });

  it('applies the variant’s colours', () => {
    const green = withVariant(WATCHES.diver, 'green');
    expect(green.bezel).toMatchObject({ insertColor: '#0f5c36' });
    expect(green.dial).toMatchObject({ color: '#0d5230', finish: 'sunburst' });
    // The real watch keeps its dial printing white.
    expect(green.accents).toEqual(WATCHES.diver.accents);
    const blueBlack = withVariant(WATCHES.gmt, 'blueBlack');
    expect(blueBlack.complications.gmt?.style).toBe('arrow');
    expect(blueBlack.complications.gmt?.color).toBe('#3468d0');
  });
});
