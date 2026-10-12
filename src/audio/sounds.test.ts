import { describe, expect, it } from 'vitest';

import { FIRST_SERIES, WATCH_ORDER, type WatchId } from '../watches/ids';
import { DESIGNS, MOVEMENTS, renderTakes, type VoiceName } from './sounds';

const RATE = 48_000;
const VOICES = Object.keys(DESIGNS) as VoiceName[];
const takes = new Map(VOICES.map(voice => [voice, renderTakes(voice, RATE)]));
const first = (voice: VoiceName) => takes.get(voice)?.[0] ?? new Float32Array();

const peakOf = (samples: Float32Array) =>
  samples.reduce((loudest, value) => Math.max(loudest, Math.abs(value)), 0);
/** A rough loudness: the energy of a take's first 300 ms. */
const energy = (voice: VoiceName) =>
  first(voice)
    .subarray(0, RATE * 0.3)
    .reduce((sum, value) => sum + value * value, 0);

/** Every take of a watch's tick and tock. */
const beatsOf = (watch: WatchId) => [
  ...(takes.get(`tick:${watch}`) ?? []),
  ...(takes.get(`tock:${watch}`) ?? []),
];
/** A watch's beat loudness: the mean energy of its takes, in dB. */
const beatLevel = (watch: WatchId) => {
  const all = beatsOf(watch);
  const total = all.reduce(
    (sum, take) => sum + take.reduce((part, value) => part + value * value, 0),
    0
  );
  return 10 * Math.log10(total / all.length);
};
/**
 * How bright a watch's beats are: their RMS frequency in Hz, from the
 * energy of the signal's slope against its own.
 */
const brightness = (watch: WatchId) => {
  let slope = 0;
  let signal = 0;
  for (const take of beatsOf(watch)) {
    for (let index = 1; index < take.length; index++) {
      slope += ((take[index] ?? 0) - (take[index - 1] ?? 0)) ** 2;
      signal += (take[index] ?? 0) ** 2;
    }
  }
  return (Math.sqrt(slope / signal) * RATE) / (2 * Math.PI);
};

describe('DESIGNS', () => {
  it.each(VOICES)('renders %s within range, ending in silence', voice => {
    const design = DESIGNS[voice];
    const rendered = takes.get(voice) ?? [];
    expect(rendered).toHaveLength(design.takes);
    for (const take of rendered) {
      expect(take.every(Number.isFinite)).toBe(true);
      expect(20 * Math.log10(peakOf(take))).toBeCloseTo(design.peakDb, 6);
      expect(peakOf(take.subarray(-48))).toBeLessThan(peakOf(take) / 1000);
      expect(take.length / RATE).toBeLessThan(1.5);
    }
  });

  it('renders the same takes every time', () => {
    expect(renderTakes('tick:diver', RATE)).toEqual(takes.get('tick:diver'));
  });

  it('makes every take of a sound a little different', () => {
    for (const voice of VOICES) {
      const rendered = takes.get(voice) ?? [];
      for (let index = 1; index < rendered.length; index++) {
        expect(rendered[index]).not.toEqual(rendered[index - 1]);
      }
    }
  });

  it('beats tick and tock on two different pallets', () => {
    for (const watch of WATCH_ORDER) {
      expect(first(`tock:${watch}`)).not.toEqual(first(`tick:${watch}`));
      expect(DESIGNS[`tock:${watch}`].layers).not.toEqual(
        DESIGNS[`tick:${watch}`].layers
      );
    }
  });

  it('keeps the escapement under every other sound of play', () => {
    for (const watch of WATCH_ORDER) {
      for (const voice of ['hit', 'perfect', 'miss', 'pusher'] as const) {
        expect(DESIGNS[`tick:${watch}`].peakDb).toBeLessThan(
          DESIGNS[voice].peakDb
        );
      }
    }
  });

  it('presses a pusher that is heard over the hit it rides on', () => {
    expect(DESIGNS.pusher.peakDb).toBeGreaterThan(DESIGNS.hit.peakDb);
  });

  it('ranks the rewards: an unlock over a certificate over a new best', () => {
    expect(energy('unlock')).toBeGreaterThan(energy('certify'));
    expect(energy('certify')).toBeGreaterThan(energy('best'));
    // A new best is a soft chime, never louder than a Perfect.
    expect(energy('best')).toBeLessThan(energy('perfect'));
  });

  it('marks passing a best mid-round 10 dB under a new best', () => {
    expect(DESIGNS.best.peakDb - DESIGNS.pass.peakDb).toBe(10);
    expect(energy('pass')).toBeLessThan(energy('best'));
  });

  it('lets the multiplier go softly, under the hit it rides on', () => {
    expect(DESIGNS.release.peakDb).toBeLessThan(DESIGNS.hit.peakDb);
    expect(energy('release')).toBeLessThan(energy('hit'));
    expect(energy('release')).toBeLessThan(energy('multiplier'));
  });

  it('rings a Perfect longer and brighter than a plain hit', () => {
    expect(energy('perfect')).toBeGreaterThan(energy('hit'));
    expect(DESIGNS.perfect.seconds).toBeGreaterThan(DESIGNS.hit.seconds);
  });
});

describe('MOVEMENTS', () => {
  it('gives every watch, and only those, a movement of its own', () => {
    expect(Object.keys(MOVEMENTS)).toEqual(WATCH_ORDER);
    WATCH_ORDER.forEach((watch, index) => {
      for (const other of WATCH_ORDER.slice(index + 1)) {
        expect(DESIGNS[`tick:${watch}`].layers).not.toEqual(
          DESIGNS[`tick:${other}`].layers
        );
      }
    });
  });

  // The first series climbs from a diver's sports beat to Endless's
  // platinum hush; the second is tool watches, built to be heard.
  it('quietens the movement up the first series', () => {
    FIRST_SERIES.slice(1).forEach((watch, index) => {
      const below = FIRST_SERIES[index] ?? watch;
      expect(beatLevel(below) - beatLevel(watch)).toBeGreaterThan(1);
    });
  });

  it('regulates more finely up the first series', () => {
    const settings = FIRST_SERIES.map(watch => {
      const { spread, play, noise, direct, tock } = MOVEMENTS[watch];
      return [
        ...Object.values(spread),
        play.cents,
        play.db,
        noise,
        direct,
        tock.db,
        // How far the tock's pallet sits from the tick's.
        1 - tock.pitch,
      ];
    });
    settings.slice(1).forEach((finer, index) => {
      finer.forEach((value, setting) => {
        expect(value).toBeLessThanOrEqual(settings[index]?.[setting] ?? 0);
      });
    });
  });

  it('warms the precious-metal cases', () => {
    const steel = ['diver', 'chronograph', 'gmt'] as const;
    for (const precious of ['moonphase', 'grandComplication'] as const) {
      for (const watch of steel) {
        expect(brightness(precious)).toBeLessThan(brightness(watch));
      }
    }
  });
});
