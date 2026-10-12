import { describe, expect, it } from 'vitest';

import { DIGITAL, withVariant } from '../watches';
import { displayKey, isPositive } from './lcd';

describe('the digital windows', () => {
  it('repaint only when what they show changes', () => {
    const time = displayKey({
      score: 12,
      main: { kind: 'time', hours: 9, minutes: 5, seconds: 7 },
    });
    expect(time).toBe('12|09:05:07');
    expect(displayKey({ score: 12, main: { kind: 'count', count: 3 } })).toBe(
      '12|C3'
    );
    expect(
      displayKey({ score: 13, main: { kind: 'count', count: 3 } })
    ).not.toBe(displayKey({ score: 12, main: { kind: 'count', count: 3 } }));
  });

  it('tell a positive crystal from a negative one', () => {
    expect(isPositive(DIGITAL)).toBe(true);
    expect(isPositive(withVariant(DIGITAL, 'gold'))).toBe(false);
  });

  it('make the gold variant of metal, its resin left behind', () => {
    const gold = withVariant(DIGITAL, 'gold');
    expect(DIGITAL.case.composite).toEqual({ kind: 'resin' });
    expect('composite' in gold.case).toBe(false);
    expect(gold.strap).toEqual({ type: 'oyster' });
    expect(withVariant(DIGITAL, 'red').case.composite).toEqual({
      kind: 'resin',
    });
  });
});
