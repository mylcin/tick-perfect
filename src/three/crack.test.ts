import { describe, expect, it } from 'vitest';

import { crackLines, IMPACT_RADIUS } from './crack';
import { LAYOUT } from './layout';

describe('crackLines', () => {
  it('draws the same crack for the same seed', () => {
    expect(crackLines(42)).toEqual(crackLines(42));
  });

  it('draws a different crack for another seed', () => {
    expect(crackLines(42)).not.toEqual(crackLines(43));
  });

  it('keeps every fracture inside the crystal', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const line of crackLines(seed)) {
        for (const [x, y] of line.points) {
          expect(Math.hypot(x, y)).toBeLessThanOrEqual(
            LAYOUT.crystalRadius + 1e-9
          );
        }
      }
    }
  });

  it('spreads from the impact point', () => {
    const lines = crackLines(7);
    const main = lines.filter(line => line.weight === 1);
    expect(main.length).toBeGreaterThanOrEqual(7);
    for (const line of main) {
      expect(line.points[0]).toEqual([0, IMPACT_RADIUS]);
      expect(line.points.length).toBeGreaterThan(1);
    }
  });
});
