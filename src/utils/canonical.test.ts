import { describe, expect, it } from 'vitest';

import { canonicalJson, sameData } from './canonical';

describe('canonicalJson', () => {
  it('sorts keys at every depth and drops undefined fields', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe(
      '{"a":[{"c":3,"d":2}],"b":1}'
    );
  });
});

describe('sameData', () => {
  it('compares by content, not key order', () => {
    expect(sameData({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
  });
});
