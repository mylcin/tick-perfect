import { describe, expect, it } from 'vitest';

import {
  CHRONOGRAPH,
  DIVER,
  GMT,
  GRAND_COMPLICATION,
  MOONPHASE,
  TOURBILLON,
  type DialSlot,
} from '../watches';
import {
  clockAngles,
  DIAL_SLOTS,
  dateWindowCentre,
  LAYOUT,
  polar,
  slotFor,
  watchAngleToRotation,
} from './layout';

describe('watchAngleToRotation', () => {
  it('turns clockwise watch angles into counter-clockwise radians', () => {
    expect(watchAngleToRotation(0)).toBeCloseTo(0, 12);
    expect(watchAngleToRotation(90)).toBeCloseTo(-Math.PI / 2, 12);
    expect(watchAngleToRotation(180)).toBeCloseTo(-Math.PI, 12);
  });
});

describe('polar', () => {
  it.each([
    [0, [0, 1]],
    [90, [1, 0]],
    [180, [0, -1]],
    [270, [-1, 0]],
  ] as const)('points %d° to %j', (angle, [x, y]) => {
    const [px, py] = polar(angle, 1);
    expect(px).toBeCloseTo(x, 12);
    expect(py).toBeCloseTo(y, 12);
  });

  it('scales with the radius', () => {
    const [x, y] = polar(45, 2);
    expect(Math.hypot(x, y)).toBeCloseTo(2, 12);
  });
});

describe('clockAngles', () => {
  it('shows 3:00 with the hour hand on 3 and the minute hand on 12', () => {
    expect(clockAngles({ hours: 15, minutes: 0, seconds: 0 })).toEqual({
      hour: 90,
      minute: 0,
    });
  });

  it('moves both hands smoothly between marks', () => {
    const { hour, minute } = clockAngles({
      hours: 10,
      minutes: 30,
      seconds: 30,
    });
    expect(minute).toBeCloseTo(30.5 * 6, 9);
    expect(hour).toBeCloseTo((10 + 30.5 / 60) * 30, 9);
  });

  it('wraps 24-hour time onto the 12-hour dial', () => {
    expect(clockAngles({ hours: 0, minutes: 0, seconds: 0 }).hour).toBe(0);
    expect(clockAngles({ hours: 12, minutes: 0, seconds: 0 }).hour).toBe(0);
    expect(
      clockAngles({ hours: 23, minutes: 59, seconds: 59 }).hour
    ).toBeLessThan(360);
  });
});

describe('LAYOUT', () => {
  it('stacks the dial parts from the centre outwards', () => {
    const radii = [
      LAYOUT.dialRadius,
      LAYOUT.rehautRadius,
      LAYOUT.crystalRadius,
    ];
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
  });

  it('reaches the seconds hand past the dial edge', () => {
    expect(LAYOUT.secondsHand).toBeGreaterThan(LAYOUT.dialRadius);
  });

  it('keeps the hands in their usual order of length', () => {
    expect(LAYOUT.hourHand).toBeLessThan(LAYOUT.minuteHand);
    expect(LAYOUT.minuteHand).toBeLessThan(LAYOUT.secondsHand);
  });
});

const SLOTS = Object.keys(DIAL_SLOTS) as DialSlot[];

describe('slotFor', () => {
  it.each([DIVER, GMT, MOONPHASE, TOURBILLON])(
    'lays the $name out on the shared slots',
    spec => {
      for (const slot of SLOTS) {
        expect(slotFor(spec, slot)).toBe(DIAL_SLOTS[slot]);
      }
    }
  );

  it.each([CHRONOGRAPH, GRAND_COMPLICATION])(
    'gives the $name registers a fifth bigger, the same either side',
    spec => {
      const nine = slotFor(spec, 'nine');
      const three = slotFor(spec, 'three');
      expect(nine.radius).toBeGreaterThanOrEqual(DIAL_SLOTS.nine.radius * 1.2);
      expect(three).toEqual({ ...nine, x: -nine.x });
      expect(nine.y).toBe(0);
    }
  );
});

describe('dateWindowCentre', () => {
  it('puts the date at 3 on a plain dial', () => {
    expect(dateWindowCentre(DIVER)).toEqual(polar(90, LAYOUT.dateWindowRadius));
  });

  it('puts the Chronograph date at 6, under its registers', () => {
    expect(dateWindowCentre(CHRONOGRAPH)).toEqual([
      0,
      -LAYOUT.dateWindowRadius,
    ]);
  });

  it('puts the Grand Complication score at 4:30', () => {
    const [x, y] = dateWindowCentre(GRAND_COMPLICATION);
    expect(Math.atan2(x, y) * (180 / Math.PI)).toBeCloseTo(135, 9);
    expect([x, y]).toEqual([DIAL_SLOTS.fourThirty.x, DIAL_SLOTS.fourThirty.y]);
  });
});

describe('insert height', () => {
  it('matches the recess the bezel geometry cuts for the insert', async () => {
    const bezels = await import('./geometry/bezels');
    const { INSERT_RECESS } = await import('./layout');
    expect(INSERT_RECESS).toBe(bezels.INSERT_RECESS);
  });
});
