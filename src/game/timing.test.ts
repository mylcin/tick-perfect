import { describe, expect, it } from 'vitest';

import {
  angularDistance,
  arcContains,
  CLOCKWISE,
  COUNTERCLOCKWISE,
  forwardDistance,
  MINUTE_MARK,
  normalizeAngle,
  rotate,
} from './angle.js';
import { createRng, nextFloat, type RngState } from './rng.js';
import {
  centerTime,
  closingSpeed,
  handAngleAt,
  judgeTap,
  progressAt,
  ringAngleAt,
  targetCenterAt,
  windowCloseTime,
  type Segment,
  type Target,
} from './timing.js';

// At 100°/s the hand covers one degree every 10 ms, which keeps the expected
// timestamps easy to read: the target centre (90° away) is reached at 1900.
const BASE: Segment = {
  startTime: 1000,
  handAngle: 0,
  direction: CLOCKWISE,
  speed: 100,
  ringAngle: 0,
  ringVelocity: 0,
  target: { mark: 90, width: 20, hitWindow: 12, perfectWindow: 2 },
  approach: 90,
  special: false,
};

type SegmentOverrides = Partial<Omit<Segment, 'target'>> & {
  target?: Partial<Target>;
};

function segment({ target, ...rest }: SegmentOverrides = {}): Segment {
  return { ...BASE, ...rest, target: { ...BASE.target, ...target } };
}

describe('handAngleAt', () => {
  it('starts where the sweep starts', () => {
    expect(handAngleAt(BASE, 1000)).toBe(0);
  });

  it('moves clockwise at the segment speed', () => {
    expect(handAngleAt(BASE, 1500)).toBeCloseTo(50, 9);
  });

  it('moves counter-clockwise across 0°', () => {
    const ccw = segment({ handAngle: 10, direction: COUNTERCLOCKWISE });
    expect(handAngleAt(ccw, 1200)).toBeCloseTo(350, 9);
  });

  it('moves clockwise across 0°', () => {
    expect(handAngleAt(segment({ handAngle: 350 }), 1200)).toBeCloseTo(10, 9);
  });
});

describe('ring motion', () => {
  const turning = segment({ ringAngle: 10, ringVelocity: -30 });

  it('turns the ring at its velocity', () => {
    expect(ringAngleAt(turning, 2000)).toBeCloseTo(340, 9);
  });

  it('carries the target with the ring', () => {
    expect(targetCenterAt(turning, 1000)).toBeCloseTo(100, 9);
    expect(targetCenterAt(turning, 2000)).toBeCloseTo(70, 9);
  });

  it('closes faster when the ring turns towards the hand', () => {
    expect(closingSpeed(segment({ ringVelocity: -30 }))).toBe(130);
  });

  it('closes slower when the ring turns away from the hand', () => {
    expect(closingSpeed(segment({ ringVelocity: 30 }))).toBe(70);
    expect(
      closingSpeed(segment({ direction: COUNTERCLOCKWISE, ringVelocity: -30 }))
    ).toBe(70);
  });
});

describe('progressAt', () => {
  it('is minus the approach at the start', () => {
    expect(progressAt(BASE, 1000)).toBe(-90);
  });

  it('is 0 at the centre and positive past it', () => {
    expect(progressAt(BASE, 1900)).toBeCloseTo(0, 9);
    expect(progressAt(BASE, 2000)).toBeCloseTo(10, 9);
  });
});

describe('centerTime and windowCloseTime', () => {
  it('finds when the hand meets the centre and leaves the window', () => {
    expect(centerTime(BASE)).toBe(1900);
    expect(windowCloseTime(BASE)).toBe(2020);
  });

  it('accounts for a moving ring', () => {
    const turning = segment({ ringVelocity: -30 });
    const meet = centerTime(turning);
    expect(meet).toBeCloseTo(1000 + (90 / 130) * 1000, 9);
    expect(
      angularDistance(handAngleAt(turning, meet), targetCenterAt(turning, meet))
    ).toBeCloseTo(0, 9);
  });
});

describe('judgeTap', () => {
  it.each([
    [1900, 'perfect', 0],
    [1910, 'perfect', 1],
    [1880, 'perfect', -2],
    [1920, 'perfect', 2],
    [1921, 'good', 2.1],
    [1879, 'good', -2.1],
    [1780, 'good', -12],
    [2020, 'good', 12],
  ] as const)('a tap at %d is a %s hit', (time, quality, offset) => {
    const judgement = judgeTap(BASE, time);
    expect(judgement).toMatchObject({ kind: 'hit', quality });
    expect(judgement.offset).toBeCloseTo(offset, 9);
  });

  it.each([
    [1779, 'early'],
    [1000, 'early'],
    [2021, 'late'],
    [5000, 'late'],
  ] as const)('a tap at %d is %s', (time, reason) => {
    expect(judgeTap(BASE, time)).toMatchObject({ kind: 'miss', reason });
  });

  it('judges the tap timestamp, not the last frame', () => {
    // The last frame was drawn at 1770 (outside the window); the tap
    // happened at 1785, inside it.
    expect(progressAt(BASE, 1770)).toBeLessThan(-BASE.target.hitWindow);
    expect(judgeTap(BASE, 1785).kind).toBe('hit');
  });

  describe('across 0°', () => {
    // Clockwise from 340° to a target centred on 12 o'clock (350° … 10°).
    const clockwise = segment({
      handAngle: 340,
      approach: 20,
      target: { mark: 0 },
    });

    it.each([
      [1100, 350, 'good'],
      [1200, 0, 'perfect'],
      [1300, 10, 'good'],
    ] as const)('at %d the hand is at %d° — %s', (time, angle, quality) => {
      expect(handAngleAt(clockwise, time)).toBeCloseTo(angle, 9);
      expect(judgeTap(clockwise, time)).toMatchObject({ kind: 'hit', quality });
    });

    it('misses just past the far edge', () => {
      expect(judgeTap(clockwise, 1321)).toMatchObject({ reason: 'late' });
    });

    // Counter-clockwise from 20° to a target centred on 354°.
    const counterClockwise = segment({
      handAngle: 20,
      direction: COUNTERCLOCKWISE,
      approach: 26,
      target: { mark: 354 },
    });

    it('hits the centre counter-clockwise', () => {
      expect(handAngleAt(counterClockwise, 1260)).toBeCloseTo(354, 9);
      expect(judgeTap(counterClockwise, 1260)).toMatchObject({
        quality: 'perfect',
      });
    });

    it('opens the window on the far side of 0° counter-clockwise', () => {
      // The window runs 6° → 342°: at 7° the hand is 1° short of it.
      expect(judgeTap(counterClockwise, 1130)).toMatchObject({
        reason: 'early',
      });
      expect(handAngleAt(counterClockwise, 1150)).toBeCloseTo(5, 9);
      expect(judgeTap(counterClockwise, 1150)).toMatchObject({ kind: 'hit' });
    });

    it('is late past 342° counter-clockwise', () => {
      expect(judgeTap(counterClockwise, 1381)).toMatchObject({
        reason: 'late',
      });
    });
  });

  it('measures progress along a reversed hand', () => {
    const reversed = segment({
      handAngle: 180,
      direction: COUNTERCLOCKWISE,
      approach: 90,
      target: { mark: 90 },
    });
    expect(judgeTap(reversed, 1890)).toMatchObject({
      quality: 'perfect',
      offset: expect.closeTo(-1, 9) as number,
    });
    expect(judgeTap(reversed, 1910)).toMatchObject({
      quality: 'perfect',
      offset: expect.closeTo(1, 9) as number,
    });
  });
});

describe('progress agrees with the angles on the dial', () => {
  /** Random but reproducible sweeps and tap times. */
  function* cases(count: number) {
    let rng: RngState = createRng(2026);
    const draw = () => {
      const [value, next] = nextFloat(rng);
      rng = next;
      return value;
    };
    while (count > 0) {
      const speed = 110 + draw() * 230;
      const direction = draw() < 0.5 ? CLOCKWISE : COUNTERCLOCKWISE;
      const width = 10 + draw() * 14;
      const hitWindow = width / 2 + 2;
      const handAngle = draw() * 360;
      const ringAngle = draw() * 360;
      const mark = Math.floor(draw() * 60) * MINUTE_MARK;
      const approach = forwardDistance(
        handAngle,
        rotate(ringAngle, mark),
        direction
      );
      // Spawns never place a target this close behind the hand.
      if (approach > 360 - 2 * hitWindow) continue;

      const sweep: Segment = {
        startTime: 5000,
        handAngle,
        direction,
        speed,
        ringAngle,
        ringVelocity: (draw() - 0.5) * speed,
        target: { mark, width, hitWindow, perfectWindow: 2 },
        approach,
        special: false,
      };
      const time =
        sweep.startTime + draw() * (windowCloseTime(sweep) - sweep.startTime);
      count--;
      yield { sweep, time };
    }
  }

  it('matches the forward distance between hand and target', () => {
    for (const { sweep, time } of cases(2000)) {
      const ahead = forwardDistance(
        handAngleAt(sweep, time),
        targetCenterAt(sweep, time),
        sweep.direction
      );
      expect(
        angularDistance(normalizeAngle(-progressAt(sweep, time)), ahead)
      ).toBeLessThan(1e-6);
    }
  });

  it('hits exactly when the hand is on the hit arc', () => {
    for (const { sweep, time } of cases(2000)) {
      const offset = progressAt(sweep, time);
      const { hitWindow, perfectWindow } = sweep.target;
      const nearEdge =
        Math.abs(Math.abs(offset) - hitWindow) < 1e-6 ||
        Math.abs(Math.abs(offset) - perfectWindow) < 1e-6;
      if (nearEdge) continue;

      const center = targetCenterAt(sweep, time);
      const hand = handAngleAt(sweep, time);
      const judgement = judgeTap(sweep, time);
      expect(judgement.kind === 'hit').toBe(
        arcContains({ center, width: 2 * hitWindow }, hand)
      );
      expect(judgement.kind === 'hit' && judgement.quality === 'perfect').toBe(
        arcContains({ center, width: 2 * perfectWindow }, hand)
      );
    }
  });
});
