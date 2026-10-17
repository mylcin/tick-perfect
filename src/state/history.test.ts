import { describe, expect, it } from 'vitest';

import {
  addLine,
  latestRounds,
  lineFor,
  MAX_LINES,
  mergeHistory,
  MODE_CODES,
  restoreLine,
  restoreLines,
  summarize,
  type RoundLine,
} from './history';

const line = (
  at: number,
  score: number,
  hits = score,
  perfects = 0,
  rate = 0,
  spread = 0
): RoundLine => [
  at,
  MODE_CODES.collection,
  score,
  hits,
  perfects,
  rate,
  spread,
];

describe('lineFor', () => {
  it('sums a round up from its hits', () => {
    expect(
      lineFor(
        5000,
        MODE_CODES.daily,
        7,
        [10, -4, 3, 7],
        ['good', 'perfect', 'perfect', 'good']
      )
    ).toEqual([5000, MODE_CODES.daily, 7, 4, 2, 4, 5.2]);
  });

  it('writes no timing for a round without hits', () => {
    expect(lineFor(5000, MODE_CODES.challenge, 0, [], [])).toEqual([
      5000,
      MODE_CODES.challenge,
      0,
      0,
      0,
      0,
      0,
    ]);
  });
});

describe('addLine and mergeHistory', () => {
  it('keeps each watch’s latest lines, oldest first', () => {
    let history = {};
    for (let at = 1; at <= MAX_LINES + 5; at += 1) {
      history = addLine(history, 'diver', line(at, at));
    }
    const lines = (history as Record<string, RoundLine[]>)['diver'] ?? [];
    expect(lines).toHaveLength(MAX_LINES);
    expect(lines[0]?.[0]).toBe(6);
    expect(lines.at(-1)?.[0]).toBe(MAX_LINES + 5);
  });

  it('takes in another tab’s rounds once each, in order', () => {
    const shared = line(2, 9);
    const merged = mergeHistory(
      { diver: [line(1, 4), shared] },
      { diver: [shared, line(3, 12)], gmt: [line(5, 1)] }
    );
    expect(merged).toEqual({
      diver: [line(1, 4), shared, line(3, 12)],
      gmt: [line(5, 1)],
    });
  });
});

describe('restoreLines', () => {
  it.each([
    null,
    [1, 0, 3, 3, 0, 0],
    [0, 0, 3, 3, 0, 0, 0],
    [1, 3, 3, 3, 0, 0, 0],
    [1, 0, -1, 3, 0, 0, 0],
    [1, 0, 3, 3, 4, 0, 0],
    [1, 0, 3, 3, 0, 1001, 0],
    [1, 0, 3, 3, 0, 0, -1],
    [1, 0, 3, 3, 0, Number.NaN, 0],
    [1, 0, 3.5, 3, 0, 0, 0],
  ])('drops the unusable line %j', saved => {
    expect(restoreLine(saved)).toBeNull();
  });

  it('keeps the valid lines in order, each moment once, capped', () => {
    const many = Array.from({ length: MAX_LINES * 3 }, (_, index) =>
      line(MAX_LINES * 3 - index, 1)
    );
    const restored = restoreLines([...many, 'junk', many[0]]);
    expect(restored).toHaveLength(MAX_LINES);
    expect(restored.map(([at]) => at)).toEqual(
      [...restored.map(([at]) => at)].sort((a, b) => a - b)
    );
    expect(restoreLines({ not: 'a list' })).toEqual([]);
  });
});

describe('summarize', () => {
  it('has nothing to say about no rounds', () => {
    expect(summarize([])).toBeNull();
  });

  it('adds rounds up as if their hits were one round', () => {
    // Two rounds whose hits are [-10, 10] and [20, 20, 20, 20].
    const summary = summarize([
      line(1, 2, 2, 1, 0, 10),
      line(2, 6, 4, 3, 20, 0),
    ]);
    const hits = [-10, 10, 20, 20, 20, 20];
    const mean = hits.reduce((a, b) => a + b) / hits.length;
    const spread = Math.sqrt(
      hits.reduce((total, ms) => total + (ms - mean) ** 2, 0) / hits.length
    );
    expect(summary).toMatchObject({
      rounds: 2,
      averageScore: 4,
      bestScore: 6,
      hits: 6,
      perfectShare: 4 / 6,
    });
    expect(summary?.rate).toBeCloseTo(mean, 9);
    expect(summary?.spread).toBeCloseTo(spread, 9);
  });

  it('leaves the timing out when no round had a hit', () => {
    expect(summarize([line(1, 0, 0)])).toMatchObject({
      rounds: 1,
      perfectShare: null,
      rate: null,
      spread: null,
    });
  });
});

describe('latestRounds', () => {
  const lines = Array.from({ length: 25 }, (_, index) => line(index + 1, 1));

  it('compares the latest rounds with as many before them', () => {
    const { latest, before } = latestRounds(lines, 10);
    expect(latest.map(([at]) => at)).toEqual([
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    ]);
    expect(before?.map(([at]) => at)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('has nothing to compare until there are enough rounds', () => {
    const { latest, before } = latestRounds(lines, 25);
    expect(latest).toHaveLength(25);
    expect(before).toBeNull();
  });
});
