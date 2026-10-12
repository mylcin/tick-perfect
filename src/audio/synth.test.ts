import { describe, expect, it } from 'vitest';

import { render, seeded, type Layer } from './synth';

const RATE = 48_000;
const peakOf = (samples: Float32Array) =>
  samples.reduce((loudest, value) => Math.max(loudest, Math.abs(value)), 0);

/** The loudest sample between two moments, in seconds. */
const peakBetween = (samples: Float32Array, from: number, to: number) =>
  peakOf(samples.subarray(Math.round(from * RATE), Math.round(to * RATE)));

const STRIKE: Layer = {
  kind: 'strike',
  at: 0,
  impacts: [{ at: 0, strength: 1, width: 0.0003 }],
  modes: [{ frequency: 2000, gain: 1, ring: 0.2 }],
};

describe('seeded', () => {
  it('repeats its sequence for a seed, within [0, 1)', () => {
    const [a, b] = [seeded(42), seeded(42)];
    const values = Array.from({ length: 1000 }, a);
    expect(Array.from({ length: 1000 }, b)).toEqual(values);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe('render', () => {
  const options = { seconds: 0.5, peak: 0.5, sampleRate: RATE, seed: 7 };

  it('scales the loudest sample to the peak', () => {
    expect(peakOf(render([STRIKE], options))).toBeCloseTo(0.5, 6);
  });

  it('renders the same samples from the same seed', () => {
    expect(render([STRIKE], options)).toEqual(render([STRIKE], options));
    expect(render([STRIKE], { ...options, seed: 8 })).not.toEqual(
      render([STRIKE], options)
    );
  });

  it('strikes a smooth contact as a clean pulse, the same from any seed', () => {
    const smooth: Layer = {
      ...STRIKE,
      impacts: [{ at: 0, strength: 1, width: 0.0003, noise: 0 }],
    };
    expect(render([smooth], { ...options, seed: 8 })).toEqual(
      render([smooth], options)
    );
  });

  it('lets a mode fade by 60 dB over its ring', () => {
    const samples = render([STRIKE], options);
    const early = peakBetween(samples, 0.01, 0.02);
    const later = peakBetween(samples, 0.21, 0.22);
    expect(20 * Math.log10(later / early)).toBeCloseTo(-60, -1);
  });

  it('starts a strike at its moment, silent before', () => {
    const samples = render([{ ...STRIKE, at: 0.1 }], options);
    expect(peakBetween(samples, 0, 0.099)).toBe(0);
    expect(peakBetween(samples, 0.1, 0.11)).toBeGreaterThan(0);
  });

  it('always ends in silence', () => {
    const samples = render(
      [{ ...STRIKE, modes: [{ frequency: 2000, gain: 1, ring: 5 }] }],
      options
    );
    expect(samples.at(-1)).toBeCloseTo(0, 6);
  });

  it('renders a hiss and a breath, finite and in range', () => {
    const samples = render(
      [
        { kind: 'hiss', at: 0, gain: 1, ring: 0.2, cutoff: 1800 },
        {
          kind: 'breath',
          at: 0.05,
          gain: 1,
          length: 0.3,
          from: 2600,
          to: 700,
          q: 1.6,
        },
      ],
      options
    );
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(peakOf(samples)).toBeCloseTo(0.5, 6);
  });

  it('skips a mode above what the rate can hold', () => {
    const samples = render(
      [{ ...STRIKE, modes: [{ frequency: 30_000, gain: 1, ring: 0.2 }] }],
      options
    );
    expect(peakOf(samples)).toBe(0);
  });
});
