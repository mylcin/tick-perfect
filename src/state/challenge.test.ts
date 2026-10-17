import { describe, expect, it } from 'vitest';

import { WATCH_ORDER } from '../watches/ids';
import { RULES_REVISION } from '../watches/revisions';
import {
  challengeRules,
  encodeChallenge,
  parseChallenge,
  takeChallenge,
  type Challenge,
} from './challenge';

describe('encodeChallenge and parseChallenge', () => {
  it('writes the watch, the seed in base 36, the score and the revision', () => {
    const challenge = {
      watch: 'chronograph',
      seed: 1_000_000,
      score: 23,
    } as const;
    expect(encodeChallenge({ ...challenge, revision: 2 })).toBe(
      'chronograph.lfls.23.2'
    );
    // Links on the first rules read on pages from before revisions too.
    expect(encodeChallenge({ ...challenge, revision: 1 })).toBe(
      'chronograph.lfls.23'
    );
  });

  it('reads back every challenge it writes', () => {
    for (const watch of WATCH_ORDER) {
      for (const seed of [0, 1, 35, 36, 3_686_168_731, 0xffffffff]) {
        for (const score of [0, 7, 9999]) {
          for (const revision of [1, 2, 999]) {
            const challenge: Challenge = { watch, seed, score, revision };
            expect(parseChallenge(encodeChallenge(challenge))).toEqual(
              challenge
            );
          }
        }
      }
    }
  });

  it('reads a link from before revisions as set on the first', () => {
    expect(parseChallenge('diver.z.23')).toEqual({
      watch: 'diver',
      seed: 35,
      score: 23,
      revision: 1,
    });
    expect(parseChallenge('diver.z.23.2')?.revision).toBe(2);
  });

  it.each([
    null,
    '',
    'diver',
    'diver.1a',
    'diver.1a.3.4.5',
    // Unknown or misspelt watches.
    'cuckoo.1a.3',
    'Diver.1a.3',
    // Seeds: not base 36, padded, or past a uint32.
    'diver.-1.3',
    'diver.1A.3',
    'diver.01a.3',
    'diver..3',
    'diver.1z141z4.3',
    'diver.zzzzzzzz.3',
    'diver.1 .3',
    // Scores: negative, padded, too big or not a number. (A fractional one
    // reads as a score and a revision.)
    'diver.1a.-1',
    'diver.1a.03',
    'diver.1a.10000',
    'diver.1a.x',
    'diver.1a.',
    'diver.1a.1e3',
    // Revisions: none, zero, padded, negative, too big or not a number.
    'diver.1a.3.',
    'diver.1a.3.0',
    'diver.1a.3.01',
    'diver.1a.3.-1',
    'diver.1a.3.1000',
    'diver.1a.3.x',
  ])('ignores %j', code => {
    expect(parseChallenge(code)).toBeNull();
  });

  it('takes the highest seed, score and revision there are', () => {
    expect(parseChallenge('gmt.1z141z3.9999.999')).toEqual({
      watch: 'gmt',
      seed: 0xffffffff,
      score: 9999,
      revision: 999,
    });
  });
});

describe('challengeRules', () => {
  const challenge: Challenge = {
    watch: 'gmt',
    seed: 1,
    score: 4,
    revision: 2,
  };

  it('compares the link’s rules with the watch’s own', () => {
    expect(challengeRules(challenge, 2)).toBe('same');
    expect(challengeRules(challenge, 3)).toBe('earlier');
    expect(challengeRules(challenge, 1)).toBe('later');
  });

  it('plays a link of this version’s rules as set on them', () => {
    for (const watch of WATCH_ORDER) {
      const revision = RULES_REVISION[watch];
      expect(challengeRules({ ...challenge, watch, revision })).toBe('same');
    }
  });
});

describe('takeChallenge', () => {
  it('reads the challenge and leaves the rest of the query', () => {
    expect(takeChallenge('?c=diver.z.23.1')).toEqual({
      challenge: { watch: 'diver', seed: 35, score: 23, revision: 1 },
      invalid: false,
      rest: '',
    });
    expect(takeChallenge('?ref=chat&c=gmt.1.4&x=1')).toEqual({
      challenge: { watch: 'gmt', seed: 1, score: 4, revision: 1 },
      invalid: false,
      rest: '?ref=chat&x=1',
    });
  });

  it('drops an unusable challenge all the same, and says so', () => {
    expect(takeChallenge('?c=nonsense&ref=chat')).toEqual({
      challenge: null,
      invalid: true,
      rest: '?ref=chat',
    });
    // Cut short by a chat app, or left empty.
    expect(takeChallenge('?c=gmt.zzz').invalid).toBe(true);
    expect(takeChallenge('?c=').invalid).toBe(true);
  });

  it('leaves a query without a challenge alone', () => {
    const none = { challenge: null, invalid: false, rest: null };
    expect(takeChallenge('')).toEqual(none);
    expect(takeChallenge('?ref=chat')).toEqual(none);
  });
});
