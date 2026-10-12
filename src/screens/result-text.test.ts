import { describe, expect, it } from 'vitest';

import { en } from '../i18n/en';
import type { DailyOutcome } from '../state/daily';
import { beatStatus } from '../state/modes';
import { dailyResultText } from './result-text';

const counted: DailyOutcome = {
  counted: true,
  best: 23,
  isNewBest: false,
  reserve: 1,
  wound: true,
};

describe('dailyResultText', () => {
  it('names the Daily and the day’s best', () => {
    expect(dailyResultText(en, 2, 17, counted, null)).toBe(
      'Daily #2 over. Score 17. Today’s best 23.'
    );
    expect(dailyResultText(en, 2, 17, counted, beatStatus(17, 20))).toBe(
      'Daily #2 over. Score 17. Today’s best 23. 4 points to beat 20.'
    );
  });

  it('claims no day’s best for a round that was not counted', () => {
    const ignored = { ...counted, counted: false, best: null, wound: false };
    expect(dailyResultText(en, 2, 17, ignored, null)).toBe(
      'Game over. Score 17.'
    );
  });
});
