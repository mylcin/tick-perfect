import { describe, expect, it } from 'vitest';

import { CLOCKWISE, DEFAULT_SCORING, type Segment } from '../game';
import { DICTIONARIES } from '../i18n';
import { tipText, twistHintFor } from './hud-hint';

const { en, tr } = DICTIONARIES;

const sweep = (changes: Partial<Segment> = {}): Segment => ({
  startTime: 0,
  handAngle: 0,
  direction: CLOCKWISE,
  speed: 100,
  ringAngle: 0,
  ringVelocity: 0,
  target: { mark: 90, width: 20, hitWindow: 12, perfectWindow: 2 },
  approach: 90,
  special: false,
  ...changes,
});

describe('twistHintFor', () => {
  it('says nothing on a plain sweep', () => {
    expect(twistHintFor(sweep())).toBeNull();
  });

  it('names the twist on the dial, and the side of a GMT gate', () => {
    const gate = (side: 'wait' | 'beat') =>
      sweep({
        special: true,
        twist: { kind: 'gmt', side, clear: 0.2 },
      });
    expect(twistHintFor(gate('wait'))).toBe('gmtWait');
    expect(twistHintFor(gate('beat'))).toBe('gmtBeat');
  });

  it('follows the marker while the ring turns (the Diver’s bezel)', () => {
    expect(twistHintFor(sweep({ ringVelocity: -30 }))).toBe('turn');
    expect(en.game.twistHints.turn).toBe('Follow the marker as it turns');
  });
});

describe('tipText', () => {
  it('says each tip with the scoring’s numbers', () => {
    const say = (tip: Parameters<typeof tipText>[1]) =>
      tipText(en, tip, DEFAULT_SCORING);
    expect(say('perfect')).toBe('Perfect: the bright core scores 2');
    expect(say('streak')).toBe('3 Perfects in a row double every score');
    expect(say('multiplier')).toBe('×2 until a plain hit');
    expect(say('streakBroken')).toBe('A plain hit ends the streak');
  });

  it('says them in Turkish too', () => {
    expect(tipText(tr, 'streak', DEFAULT_SCORING)).toBe(
      'Üst üste 3 Mükemmel her puanı ikiye katlar'
    );
    expect(tipText(tr, 'multiplier', DEFAULT_SCORING)).toBe(
      'Sıradan bir isabete kadar ×2'
    );
  });

  it('follows rules that score differently', () => {
    const scoring = {
      ...DEFAULT_SCORING,
      perfectPoints: 3,
      multipliers: [{ streak: 4, factor: 3 }],
    } as const;
    expect(tipText(en, 'perfect', scoring)).toBe(
      'Perfect: the bright core scores 3'
    );
    expect(tipText(en, 'streak', scoring)).toBe(
      '4 Perfects in a row triple every score'
    );
  });
});
