import { describe, expect, it } from 'vitest';

import type { RoundOutcome } from './game-over-dialog';
import { rewardOf } from './reward';

function collection(
  earned: Partial<Extract<RoundOutcome, { kind: 'collection' }>> = {}
): RoundOutcome {
  return {
    kind: 'collection',
    score: 8,
    best: 10,
    isNewBest: false,
    unlocked: [],
    certificate: null,
    points: 300,
    levelUp: null,
    goal: null,
    variants: [],
    ...earned,
  };
}

describe('rewardOf', () => {
  it('rings in the biggest thing a round earned', () => {
    expect(
      rewardOf(
        collection({
          unlocked: ['chronograph'],
          certificate: 'adjusted',
          isNewBest: true,
        })
      )
    ).toEqual({ sound: 'unlock', vibrate: true });
    expect(
      rewardOf(collection({ certificate: 'chronometer', isNewBest: true }))
    ).toEqual({ sound: 'certify', vibrate: true });
    expect(rewardOf(collection({ variants: ['blue'] }))).toEqual({
      sound: 'certify',
      vibrate: true,
    });
    expect(rewardOf(collection({ levelUp: 3 }))).toEqual({
      sound: 'certify',
      vibrate: true,
    });
    expect(rewardOf(collection({ isNewBest: true }))).toEqual({
      sound: 'best',
      vibrate: false,
    });
  });

  it('rings in an engraving from any round', () => {
    expect(rewardOf(collection(), ['beatError'])).toEqual({
      sound: 'certify',
      vibrate: true,
    });
    expect(
      rewardOf(
        { kind: 'challenge', beat: { beaten: false, toBeat: 5, short: 2 } },
        ['isochronism']
      )
    ).toEqual({ sound: 'certify', vibrate: true });
  });

  it('stays quiet for a round that earned nothing, or counted for none', () => {
    expect(rewardOf(collection())).toBeNull();
    expect(
      rewardOf({
        kind: 'challenge',
        beat: { beaten: true, toBeat: 5, short: 0 },
      })
    ).toBeNull();
  });
});
