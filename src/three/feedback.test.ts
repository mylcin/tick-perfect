import { describe, expect, it } from 'vitest';

import {
  CRACK_OPACITY,
  crackOpacity,
  easeAngle,
  FLASH_STYLES,
  flashStrength,
  GATE_COVER,
  gateCover,
  gatePulse,
  shakeAt,
} from './feedback';

describe('flashStrength', () => {
  it('starts full and fades out over the flash', () => {
    expect(flashStrength('good', 0)).toBe(1);
    const { duration } = FLASH_STYLES.good;
    expect(flashStrength('good', duration / 2)).toBeCloseTo(0.25, 9);
    expect(flashStrength('good', duration)).toBe(0);
    expect(flashStrength('good', -5)).toBe(0);
  });

  it('lets a Perfect shine brighter and longer', () => {
    expect(FLASH_STYLES.perfect.glow).toBeGreaterThan(FLASH_STYLES.good.glow);
    const late = FLASH_STYLES.good.duration + 10;
    expect(flashStrength('good', late)).toBe(0);
    expect(flashStrength('perfect', late)).toBeGreaterThan(0);
  });
});

describe('crackOpacity', () => {
  it('appears almost at once and stays', () => {
    expect(crackOpacity(0)).toBe(0);
    expect(crackOpacity(30)).toBeGreaterThan(0);
    expect(crackOpacity(500)).toBe(CRACK_OPACITY);
    expect(crackOpacity(60_000)).toBe(CRACK_OPACITY);
  });
});

describe('gateCover', () => {
  it('covers either gate the same until the seconds hand gets there', () => {
    expect(gateCover('wait', null, false)).toEqual(GATE_COVER.waiting);
    expect(gateCover('beat', null, false)).toEqual(GATE_COVER.waiting);
  });

  it('fades a waiting gate out behind the hand, as the GMT hand leaves', () => {
    const fading = gateCover('wait', 50, false);
    expect(fading.shade).toBeGreaterThan(0);
    expect(fading.shade).toBeLessThan(GATE_COVER.waiting.shade);
    expect(gateCover('wait', 400, false)).toEqual({ shade: 0, stripes: 0 });
  });

  it('darkens a beaten gate once the GMT hand lands', () => {
    const landed = gateCover('beat', 10, false);
    expect(landed).toEqual(GATE_COVER.landed);
    expect(landed.shade).toBeGreaterThan(GATE_COVER.waiting.shade);
    expect(landed.stripes).toBeGreaterThan(GATE_COVER.waiting.stripes);
  });

  it('changes at once with reduced motion', () => {
    expect(gateCover('wait', 1, true)).toEqual({ shade: 0, stripes: 0 });
  });
});

describe('gatePulse', () => {
  it('swells and lights the line briefly as the hand crosses it', () => {
    expect(gatePulse(null, false)).toEqual({ scale: 1, glow: 1 });
    const peak = gatePulse(70, false);
    expect(peak.scale).toBeCloseTo(1.25, 9);
    expect(peak.glow).toBeCloseTo(2, 9);
    expect(gatePulse(500, false)).toEqual({ scale: 1, glow: 1 });
  });

  it('only lights it with reduced motion', () => {
    const peak = gatePulse(70, true);
    expect(peak.scale).toBe(1);
    expect(peak.glow).toBeGreaterThan(1);
  });
});

describe('shakeAt', () => {
  it('jolts briefly, then settles', () => {
    const peak = Math.max(
      ...Array.from({ length: 40 }, (_, ms) =>
        Math.abs(shakeAt(ms, false).offset)
      )
    );
    expect(peak).toBeGreaterThan(0);
    expect(shakeAt(1000, false)).toEqual({ offset: 0, twist: 0 });
  });

  it('never moves with reduced motion', () => {
    for (const age of [0, 10, 40, 120, 300]) {
      expect(shakeAt(age, true)).toEqual({ offset: 0, twist: 0 });
    }
  });
});

describe('easeAngle', () => {
  it('takes the short way round', () => {
    const next = easeAngle(350, 10, 7, 1 / 60);
    expect(next).toBeGreaterThan(350);
  });

  it('arrives without overshooting', () => {
    let angle = 200;
    for (let frame = 0; frame < 240; frame++) {
      angle = easeAngle(angle, 0, 7, 1 / 60);
    }
    expect(Math.min(angle, 360 - angle)).toBeLessThan(0.01);
  });

  it('is frame-rate independent', () => {
    let at60 = 90;
    for (let frame = 0; frame < 30; frame++)
      at60 = easeAngle(at60, 0, 5, 1 / 60);
    let at30 = 90;
    for (let frame = 0; frame < 15; frame++)
      at30 = easeAngle(at30, 0, 5, 1 / 30);
    expect(at30).toBeCloseTo(at60, 9);
  });
});
