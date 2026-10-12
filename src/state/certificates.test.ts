import { describe, expect, it } from 'vitest';

import { certificateFor, nextCertificate, UNLOCK_SCORE } from './certificates';

describe('certificates', () => {
  it.each([
    [0, null],
    [14, null],
    [15, 'adjusted'],
    [39, 'adjusted'],
    [40, 'chronometer'],
    [74, 'chronometer'],
    [75, 'observatory'],
    [500, 'observatory'],
  ] as const)('a best of %d earns %s', (best, tier) => {
    expect(certificateFor(best)).toBe(tier);
  });

  it('names the next one to aim for', () => {
    expect(nextCertificate(0)).toEqual({ tier: 'adjusted', score: 15 });
    expect(nextCertificate(15)).toEqual({ tier: 'chronometer', score: 40 });
    expect(nextCertificate(75)).toBeNull();
  });

  it('unlocks the next watch with Adjusted', () => {
    expect(UNLOCK_SCORE).toBe(15);
  });
});
