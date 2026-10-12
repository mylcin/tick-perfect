import { describe, expect, it } from 'vitest';

import { inputTime, MAX_INPUT_AGE_MS } from './input-time';

describe('inputTime', () => {
  const NOW = 50_000;

  it('trusts a timestamp from earlier in the frame', () => {
    expect(inputTime(NOW - 12.5, NOW)).toBe(NOW - 12.5);
    expect(inputTime(NOW, NOW)).toBe(NOW);
  });

  it('trusts a timestamp delayed by a long frame', () => {
    expect(inputTime(NOW - MAX_INPUT_AGE_MS, NOW)).toBe(NOW - MAX_INPUT_AGE_MS);
  });

  it.each([
    ['epoch time', 1_790_000_000_000],
    ['zero', 0],
    ['negative', -5],
    ['the future', NOW + 20],
    ['too old', NOW - MAX_INPUT_AGE_MS - 1],
    ['NaN', Number.NaN],
  ])('falls back to now for %s', (_, timeStamp) => {
    expect(inputTime(timeStamp, NOW)).toBe(NOW);
  });
});
