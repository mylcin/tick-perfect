import { WATCH_ORDER, type WatchId } from '../watches/ids';
import { render, seeded, type Impact, type Layer, type Mode } from './synth';

// What a mechanical watch sounds like, as modal synthesis (see synth.ts).
// Each sound is rendered into a few takes that differ the way two strikes
// of the same part do, and every play detunes and levels its take a little,
// so a run of ticks never repeats one sample.

/** A digital's piezo beeping at 4 kHz for about `length` seconds. */
function piezo(length: number): Design {
  return {
    seconds: length + 0.05,
    peakDb: -22,
    takes: 1,
    spread: { pitch: 0, ring: 0, time: 0, strength: 0 },
    play: { cents: 0, db: 0 },
    layers: [
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 1, 0.0002)],
        // The fundamental rings out; odd harmonics square it off.
        modes: [
          mode(4096, 1, length / 3),
          mode(12288, 0.3, length / 4),
          mode(20480, 0.12, length / 5),
        ],
        direct: 0,
      },
    ],
  };
}

/** What the game plays by name; the escapement's beats come per watch. */
export type SoundName =
  | 'hit'
  | 'perfect'
  | 'multiplier'
  | 'release'
  | 'miss'
  | 'pusher'
  | 'cover'
  | 'uncover'
  | 'fade'
  | 'unlock'
  | 'certify'
  | 'best'
  | 'pass'
  | 'crown'
  | 'beep'
  | 'beepZero';

/** The escapement's two beats, one per pallet. */
export type Beat = 'tick' | 'tock';
/** A beat in one watch's own voice, as `tick:diver`. */
export type BeatVoice = `${Beat}:${WatchId}`;
/** What can be rendered: every sound, and every watch's two beats. */
export type VoiceName = SoundName | BeatVoice;

interface Design {
  readonly seconds: number;
  /** The loudest sample of a take, in dBFS. */
  readonly peakDb: number;
  /** How many takes to render; the engine rotates through them. */
  readonly takes: number;
  /** How far a take strays from the design, either way. */
  readonly spread: {
    /** Of every mode's frequency, as a share. */
    readonly pitch: number;
    /** Of every mode's ring, as a share. */
    readonly ring: number;
    /** Of every impact's moment after its strike's first, in seconds. */
    readonly time: number;
    /** Of every impact's strength, as a share. */
    readonly strength: number;
  };
  /** How far each play strays, either way: detune and level. */
  readonly play: { readonly cents: number; readonly db: number };
  readonly layers: readonly Layer[];
}

const mode = (frequency: number, gain: number, ring: number): Mode => ({
  frequency,
  gain,
  ring,
});
const impact = (at: number, strength: number, width: number): Impact => ({
  at,
  strength,
  width,
});

/**
 * One pallet's beat, its contacts as [moment s, strength, width s]: the
 * unlock (always at 0), the tooth's impulse, then the next tooth's drop
 * onto the other pallet. The tooth may bounce on the locking face:
 * [delay after the drop s, strength].
 */
interface Escapement {
  readonly unlock: readonly [number, number];
  readonly impulse: readonly [number, number, number];
  readonly drop: readonly [number, number, number];
  readonly bounces?: readonly (readonly [number, number])[];
}

/**
 * A watch's escapement as it is heard. The higher a watch sits in the
 * collection, the finer its movement is finished and regulated: quieter,
 * with smoother contacts, steadier beats and a tick and tock closer alike.
 */
interface Movement {
  /** The tick's loudest sample, in dBFS. */
  readonly peakDb: number;
  readonly seconds: number;
  readonly spread: Design['spread'];
  readonly play: Design['play'];
  /** The movement's modes, then the case's: [frequency Hz, gain, ring s]. */
  readonly modes: readonly (readonly [number, number, number])[];
  /** The dry click of the contacts over the ring (see Strike). */
  readonly direct: number;
  /** How rough every contact is (see Impact). */
  readonly noise: number;
  readonly tick: Escapement;
  /** The other pallet: its modes at `pitch` of the tick's, `db` under it. */
  readonly tock: Escapement & { readonly pitch: number; readonly db: number };
}

/**
 * Raises or lowers every watch's beats together, keeping the steps between
 * them: the one knob if the quietest proves too quiet on a phone.
 */
const BEAT_TRIM_DB = 0;

/**
 * A watch beats in three impacts a few milliseconds apart: the pallet
 * unlocks the escape wheel, the tooth gives the pallet its impulse, then
 * the next tooth drops onto the other pallet and locks, the loudest of the
 * three. They ring the movement's plates and wheels high and the case
 * lower. Tick and tock are the two pallets: alike, never the same.
 *
 * The drop follows the unlock by the balance's lift time, about its lift
 * angle over 2π × its frequency × its amplitude. With a 52° lift, 28,800
 * vph at 280° gives 7.4 ms, 21,600 at 270° gives 10.2 ms and 18,000 at
 * 260° gives 12.7 ms: a slower balance draws its beat out.
 */
function movement(spec: Movement): Record<Beat, Design> {
  const beat = (pallet: Escapement, pitch: number, peakDb: number): Design => {
    const [dropAt, , dropWidth] = pallet.drop;
    return {
      seconds: spec.seconds,
      peakDb: peakDb + BEAT_TRIM_DB,
      takes: 6,
      spread: spec.spread,
      play: spec.play,
      layers: [
        {
          kind: 'strike',
          at: 0,
          impacts: [
            impact(0, ...pallet.unlock),
            impact(...pallet.impulse),
            impact(...pallet.drop),
            ...(pallet.bounces ?? []).map(([delay, strength]) =>
              impact(dropAt + delay, strength, dropWidth * 0.8)
            ),
          ].map(hit => ({ ...hit, noise: spec.noise })),
          modes: spec.modes.map(([frequency, gain, ring]) =>
            mode(frequency * pitch, gain, ring)
          ),
          direct: spec.direct,
        },
      ],
    };
  };
  return {
    tick: beat(spec.tick, 1, spec.peakDb),
    tock: beat(spec.tock, spec.tock.pitch, spec.peakDb - spec.tock.db),
  };
}

/**
 * Every watch's movement, in collection order. A Record, so a new watch
 * can't be added without a voice of its own.
 */
export const MOVEMENTS: Readonly<Record<WatchId, Movement>> = {
  // A steel oyster case round a 28,800 vph calibre: robust and bright, the
  // locking tooth bouncing twice.
  diver: {
    peakDb: -17,
    seconds: 0.06,
    spread: { pitch: 0.014, ring: 0.14, time: 0.0007, strength: 0.2 },
    play: { cents: 18, db: 1.5 },
    modes: [
      [3300, 1, 0.03],
      [4950, 0.85, 0.022],
      [6700, 0.65, 0.016],
      [9300, 0.45, 0.011],
      [1650, 0.6, 0.05],
      [2550, 0.5, 0.04],
    ],
    direct: 0.2,
    noise: 1,
    tick: {
      unlock: [0.4, 0.00018],
      impulse: [0.0026, 0.6, 0.00028],
      drop: [0.0074, 1, 0.00012],
      bounces: [
        [0.0007, 0.3],
        [0.0015, 0.12],
      ],
    },
    tock: {
      pitch: 0.95,
      db: 0.8,
      unlock: [0.4, 0.00018],
      impulse: [0.0029, 0.6, 0.00028],
      drop: [0.0083, 1, 0.00012],
      bounces: [
        [0.0008, 0.32],
        [0.0017, 0.14],
      ],
    },
  },

  // A steel tool case round a sixties column-wheel calibre at 18,000 vph:
  // a slower, drawn-out tick-a.
  chronograph: {
    peakDb: -18.7,
    seconds: 0.065,
    spread: { pitch: 0.012, ring: 0.12, time: 0.0006, strength: 0.15 },
    play: { cents: 15, db: 1.3 },
    modes: [
      [3050, 1, 0.032],
      [4600, 0.75, 0.024],
      [6200, 0.5, 0.016],
      [8600, 0.3, 0.01],
      [1750, 0.45, 0.04],
      [2700, 0.4, 0.03],
    ],
    direct: 0.15,
    noise: 0.85,
    tick: {
      unlock: [0.35, 0.0002],
      impulse: [0.0046, 0.55, 0.0003],
      drop: [0.0125, 1, 0.00014],
      bounces: [[0.0007, 0.18]],
    },
    tock: {
      pitch: 0.955,
      db: 0.6,
      unlock: [0.35, 0.0002],
      impulse: [0.005, 0.55, 0.0003],
      drop: [0.0136, 1, 0.00014],
      bounces: [[0.0008, 0.2]],
    },
  },

  // A steel oyster case at 28,800 vph with a light, skeletonised escape
  // wheel: clean, the tooth locking without a bounce.
  gmt: {
    peakDb: -21.1,
    seconds: 0.06,
    spread: { pitch: 0.01, ring: 0.1, time: 0.0005, strength: 0.12 },
    play: { cents: 12, db: 1 },
    modes: [
      [3250, 1, 0.028],
      [4850, 0.75, 0.02],
      [6550, 0.5, 0.014],
      [9100, 0.25, 0.009],
      [1620, 0.5, 0.045],
      [2500, 0.4, 0.035],
    ],
    direct: 0.12,
    noise: 0.7,
    tick: {
      unlock: [0.3, 0.0002],
      impulse: [0.0025, 0.6, 0.0003],
      drop: [0.0072, 0.9, 0.00015],
    },
    tock: {
      pitch: 0.962,
      db: 0.5,
      unlock: [0.3, 0.0002],
      impulse: [0.0027, 0.6, 0.0003],
      drop: [0.0078, 0.9, 0.00015],
    },
  },

  // A thin 18k gold case round a micro-rotor dress calibre at 21,600 vph.
  // Gold carries sound at about half the speed steel does and damps more,
  // so the case rings lower and shorter, with its high partials cut.
  moonphase: {
    peakDb: -23.3,
    seconds: 0.06,
    spread: { pitch: 0.008, ring: 0.08, time: 0.0004, strength: 0.1 },
    play: { cents: 10, db: 0.8 },
    modes: [
      [2950, 1, 0.026],
      [4400, 0.6, 0.018],
      [5900, 0.3, 0.012],
      [8200, 0.12, 0.007],
      [1250, 0.55, 0.03],
      [1950, 0.4, 0.024],
    ],
    direct: 0.06,
    noise: 0.5,
    tick: {
      unlock: [0.3, 0.00025],
      impulse: [0.0036, 0.55, 0.00035],
      drop: [0.0102, 1, 0.00022],
    },
    tock: {
      pitch: 0.97,
      db: 0.4,
      unlock: [0.3, 0.00025],
      impulse: [0.0038, 0.55, 0.00035],
      drop: [0.0107, 1, 0.00022],
    },
  },

  // Forged carbon round a titanium skeleton at 21,600 vph, as the racing
  // tourbillons run. Carbon damps hard: dry and delicate, its modes high
  // but very short.
  tourbillon: {
    peakDb: -23.8,
    seconds: 0.05,
    spread: { pitch: 0.006, ring: 0.06, time: 0.0003, strength: 0.08 },
    play: { cents: 8, db: 0.6 },
    modes: [
      [3500, 1, 0.02],
      [5200, 0.65, 0.014],
      [7100, 0.35, 0.009],
      [9800, 0.12, 0.005],
      [2200, 0.3, 0.014],
      [3300, 0.15, 0.009],
    ],
    direct: 0.05,
    noise: 0.5,
    tick: {
      unlock: [0.3, 0.0002],
      impulse: [0.0036, 0.5, 0.0003],
      drop: [0.0102, 0.85, 0.00018],
    },
    tock: {
      pitch: 0.975,
      db: 0.3,
      unlock: [0.3, 0.0002],
      impulse: [0.0037, 0.5, 0.0003],
      drop: [0.0106, 0.85, 0.00018],
    },
  },

  // Platinum at 28,800 vph, as a perpetual chronograph calibre runs. The
  // dense, heavy case radiates least: the quietest and purest beat, four
  // modes, no bounce and the smoothest contact.
  grandComplication: {
    peakDb: -27.6,
    seconds: 0.06,
    spread: { pitch: 0.004, ring: 0.05, time: 0.0002, strength: 0.05 },
    play: { cents: 5, db: 0.4 },
    modes: [
      [2800, 1, 0.025],
      [4200, 0.45, 0.016],
      [5700, 0.15, 0.009],
      [1400, 0.3, 0.03],
    ],
    direct: 0.03,
    noise: 0.3,
    tick: {
      unlock: [0.25, 0.0003],
      impulse: [0.0025, 0.5, 0.0004],
      drop: [0.0074, 0.9, 0.00025],
    },
    tock: {
      pitch: 0.985,
      db: 0.2,
      unlock: [0.25, 0.0003],
      impulse: [0.0026, 0.5, 0.0004],
      drop: [0.0077, 0.9, 0.00025],
    },
  },

  // A small steel field case round a hand-wound 21,600 vph calibre: plain
  // and dry, a little higher and quieter than the diver's bigger case, one
  // short bounce on the locking tooth.
  field: {
    peakDb: -19,
    seconds: 0.055,
    spread: { pitch: 0.012, ring: 0.12, time: 0.0006, strength: 0.18 },
    play: { cents: 16, db: 1.3 },
    modes: [
      [3600, 1, 0.026],
      [5300, 0.8, 0.019],
      [7200, 0.55, 0.014],
      [9900, 0.35, 0.009],
      [1850, 0.5, 0.04],
      [2800, 0.4, 0.032],
    ],
    direct: 0.16,
    noise: 0.9,
    tick: {
      unlock: [0.4, 0.0002],
      impulse: [0.0034, 0.6, 0.0003],
      drop: [0.0098, 1, 0.00014],
      bounces: [[0.0008, 0.24]],
    },
    tock: {
      pitch: 0.955,
      db: 0.7,
      unlock: [0.4, 0.0002],
      impulse: [0.0036, 0.6, 0.0003],
      drop: [0.0104, 1, 0.00014],
      bounces: [[0.0009, 0.26]],
    },
  },

  // A big steel observer's case round a 28,800 vph calibre in a soft-iron
  // cage against magnetism: the case rings lower and longer than the
  // field watch's, and the cage damps the brightest partials.
  pilot: {
    peakDb: -18,
    seconds: 0.065,
    spread: { pitch: 0.012, ring: 0.12, time: 0.0006, strength: 0.18 },
    play: { cents: 15, db: 1.2 },
    modes: [
      [2900, 1, 0.034],
      [4300, 0.8, 0.026],
      [5900, 0.5, 0.018],
      [8200, 0.25, 0.011],
      [1450, 0.6, 0.055],
      [2250, 0.45, 0.044],
    ],
    direct: 0.15,
    noise: 0.85,
    tick: {
      unlock: [0.4, 0.00018],
      impulse: [0.0026, 0.6, 0.00028],
      drop: [0.0074, 1, 0.00012],
      bounces: [[0.0007, 0.26]],
    },
    tock: {
      pitch: 0.955,
      db: 0.7,
      unlock: [0.4, 0.00018],
      impulse: [0.0028, 0.6, 0.00028],
      drop: [0.0081, 1, 0.00012],
      bounces: [[0.0008, 0.28]],
    },
  },

  // No escapement: a quartz module's stepping motor behind a resin case and
  // a steel caseback. Each step is a single dry, high click with almost no
  // ring, the resin damping it at once; tick and tock alike, as a motor's
  // steps are.
  digital: {
    peakDb: -24,
    seconds: 0.03,
    spread: { pitch: 0.004, ring: 0.05, time: 0.0002, strength: 0.06 },
    play: { cents: 5, db: 0.4 },
    modes: [
      [4100, 1, 0.008],
      [6150, 0.45, 0.006],
      [8200, 0.2, 0.004],
      [2050, 0.25, 0.01],
    ],
    direct: 0.3,
    noise: 0.3,
    tick: {
      unlock: [0.15, 0.0001],
      impulse: [0.0008, 0.9, 0.00015],
      drop: [0.0016, 0.3, 0.0001],
    },
    tock: {
      pitch: 0.995,
      db: 0.1,
      unlock: [0.15, 0.0001],
      impulse: [0.0008, 0.9, 0.00015],
      drop: [0.0016, 0.3, 0.0001],
    },
  },
};

/**
 * Every watch's tick and tock, keyed as `tick:diver`. A voice's seed comes
 * from its key, so renaming one renders different takes.
 */
function beatDesigns(
  movements: Readonly<Record<WatchId, Movement>>
): Record<BeatVoice, Design> {
  // fromEntries forgets the keys; WATCH_ORDER names every watch.
  return Object.fromEntries(
    WATCH_ORDER.flatMap(watch => {
      const { tick, tock } = movement(movements[watch]);
      return [
        [`tick:${watch}`, tick],
        [`tock:${watch}`, tock],
      ];
    })
  ) as Record<BeatVoice, Design>;
}

/**
 * A gong of a minute repeater: hardened steel wire round the movement.
 * Each partial is a pair of modes a hair apart, as a real gong's are, so
 * it shimmers as it fades rather than holding one flat tone.
 */
function gong(
  at: number,
  frequency: number,
  ring: number,
  {
    strength = 1,
    hammer = 0.0005,
    overtones = [
      [1.5, 0.4],
      [2.76, 0.15],
    ],
  }: {
    strength?: number;
    /** The hammer's contact: longer is softer. */
    hammer?: number;
    readonly overtones?: readonly (readonly [number, number])[];
  } = {}
): Layer {
  return {
    kind: 'strike',
    at,
    impacts: [impact(0, strength, hammer)],
    modes: [
      mode(frequency, 1, ring),
      mode(frequency + 3.5, 0.5, ring * 0.92),
      ...overtones.map(([ratio, gain]) =>
        mode(frequency * ratio, gain, ring / ratio ** 0.8)
      ),
    ],
    direct: 0.04,
  };
}

const CLICK_SPREAD = { pitch: 0.012, ring: 0.12, time: 0.0006, strength: 0.15 };
const GONG_SPREAD = { pitch: 0.002, ring: 0.06, time: 0.002, strength: 0.08 };

export const DESIGNS: Readonly<Record<VoiceName, Design>> = {
  // First, so the beats are rendered first after the unlock.
  ...beatDesigns(MOVEMENTS),

  // A clean clink: a small steel bar struck, its modes inharmonic (1 :
  // 2.76 : 5.40), over the dry click of the contact.
  hit: {
    seconds: 0.3,
    peakDb: -12,
    takes: 5,
    spread: { ...CLICK_SPREAD, pitch: 0.006 },
    play: { cents: 10, db: 1 },
    layers: [
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 1, 0.00012)],
        modes: [
          mode(1760, 1, 0.22),
          mode(4851, 0.45, 0.12),
          mode(9511, 0.18, 0.05),
        ],
        direct: 0.25,
      },
    ],
  },

  // The repeater's gong: brighter and longer than a hit.
  perfect: {
    seconds: 1,
    peakDb: -10,
    takes: 3,
    spread: GONG_SPREAD,
    play: { cents: 5, db: 1 },
    layers: [
      gong(0, 2093, 0.9, {
        overtones: [
          [1.5, 0.45],
          [2.756, 0.2],
          [3.99, 0.08],
        ],
      }),
    ],
  },

  // The multiplier switching on: the gong, rising in three strikes.
  multiplier: {
    seconds: 1,
    peakDb: -9,
    takes: 2,
    spread: GONG_SPREAD,
    play: { cents: 0, db: 0.5 },
    layers: [1568, 2093, 2637].map((frequency, step) =>
      gong(step * 0.065, frequency, 0.55)
    ),
  },

  // The multiplier letting go: two soft strikes falling, damped short, as
  // if a hand rested on the gong. Under the hit it rides on.
  release: {
    seconds: 0.5,
    peakDb: -22,
    takes: 2,
    spread: GONG_SPREAD,
    play: { cents: 0, db: 0.5 },
    layers: [2093, 1568].map((frequency, step) =>
      gong(step * 0.07, frequency, 0.25, {
        strength: 1 - step * 0.25,
        hammer: 0.0012,
        overtones: [[1.5, 0.15]],
      })
    ),
  },

  // A chronograph pusher bottoming out, then the start lever: a firm,
  // weighted double click with the case's body under it.
  pusher: {
    seconds: 0.14,
    peakDb: -8,
    takes: 4,
    spread: CLICK_SPREAD,
    play: { cents: 12, db: 1 },
    layers: [0, 0.028].map((at, index) => ({
      kind: 'strike' as const,
      at,
      impacts: [
        impact(0, 1 - index * 0.15, 0.0004),
        impact(0.0012, 0.4, 0.0003),
      ],
      modes: [
        mode(1900 - index * 420, 1, 0.05),
        mode(3300 - index * 600, 0.7, 0.035),
        mode(5100 - index * 800, 0.45, 0.02),
        mode(720, 0.6, 0.06),
      ],
      direct: 0.2,
    })),
  },

  // The GMT hand landing on the target: a low, muted tock that says wait.
  cover: {
    seconds: 0.2,
    peakDb: -15,
    takes: 3,
    spread: CLICK_SPREAD,
    play: { cents: 10, db: 1 },
    layers: [
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 1, 0.0015)],
        modes: [
          mode(330, 1, 0.09),
          mode(523, 0.5, 0.06),
          mode(880, 0.25, 0.04),
        ],
      },
    ],
  },

  // The GMT hand leaving the target: a light, higher click that says go.
  uncover: {
    seconds: 0.12,
    peakDb: -18,
    takes: 3,
    spread: CLICK_SPREAD,
    play: { cents: 10, db: 1 },
    layers: [
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 1, 0.0004)],
        modes: [
          mode(990, 1, 0.05),
          mode(1560, 0.55, 0.04),
          mode(2400, 0.3, 0.03),
        ],
        direct: 0.1,
      },
    ],
  },

  // A Moonphase target fading: a soft breath of air, falling away.
  fade: {
    seconds: 0.45,
    peakDb: -24,
    takes: 3,
    spread: { pitch: 0.04, ring: 0, time: 0, strength: 0 },
    play: { cents: 30, db: 1.5 },
    layers: [
      {
        kind: 'breath',
        at: 0,
        gain: 1,
        length: 0.4,
        from: 2600,
        to: 700,
        q: 1.6,
      },
    ],
  },

  // A new watch: the gongs climbing a bright arpeggio.
  unlock: {
    seconds: 1.4,
    peakDb: -9,
    takes: 1,
    spread: GONG_SPREAD,
    play: { cents: 0, db: 0 },
    layers: [1318.5, 1661.2, 1975.5, 2637].map((frequency, step) =>
      gong(step * 0.09, frequency, 0.8, {
        overtones: [
          [2, 0.25],
          [2.76, 0.1],
        ],
      })
    ),
  },

  // A certificate or a new variant: a repeater's two gongs, ding-dong.
  certify: {
    seconds: 1.2,
    peakDb: -11,
    takes: 1,
    spread: GONG_SPREAD,
    play: { cents: 0, db: 0 },
    layers: [gong(0, 2093, 0.9), gong(0.12, 3136, 0.8)],
  },

  // A new best: one soft strike, under a certificate.
  best: {
    seconds: 0.8,
    peakDb: -18,
    takes: 2,
    spread: GONG_SPREAD,
    play: { cents: 0, db: 0.5 },
    layers: [gong(0, 2637, 0.5, { hammer: 0.0008, overtones: [[1.5, 0.2]] })],
  },

  // Passing the best, or a certificate's score, mid-round: a quiet note
  // just after the hit and high over it, 10 dB under a new best, so the
  // round plays on.
  pass: {
    seconds: 0.75,
    peakDb: -28,
    takes: 2,
    spread: GONG_SPREAD,
    play: { cents: 0, db: 0.5 },
    layers: [
      gong(0.05, 3136, 0.4, { hammer: 0.001, overtones: [[1.5, 0.15]] }),
    ],
  },

  // A sapphire crystal cracking: a dull knock, a hiss and a few snaps.
  miss: {
    seconds: 0.6,
    peakDb: -8,
    takes: 3,
    spread: CLICK_SPREAD,
    play: { cents: 20, db: 1 },
    layers: [
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 1, 0.003)],
        modes: [mode(150, 1, 0.25), mode(95, 0.6, 0.3)],
      },
      { kind: 'hiss', at: 0, gain: 0.5, ring: 0.25, cutoff: 1800 },
      ...[0, 0.019, 0.043, 0.071].map((at, index): Layer => ({
        kind: 'strike',
        at,
        impacts: [impact(0, 1 - index * 0.17, 0.0001)],
        modes: [
          mode(3200 + index * 900, 1, 0.03),
          mode((3200 + index * 900) * 1.7, 0.4, 0.02),
        ],
        direct: 0.3,
      })),
    ],
  },

  // The crown turning a detent as the collection moves on: a weighted
  // click with a low thump under it.
  // A digital's countdown: its piezo's thin square-wave beep, a little
  // longer on zero.
  beep: piezo(0.06),
  beepZero: piezo(0.2),

  crown: {
    seconds: 0.07,
    peakDb: -20,
    takes: 5,
    spread: CLICK_SPREAD,
    play: { cents: 20, db: 1.5 },
    layers: [
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 1, 0.00025), impact(0.0016, 0.35, 0.0002)],
        modes: [
          mode(2900, 1, 0.02),
          mode(5300, 0.6, 0.012),
          mode(7800, 0.35, 0.008),
        ],
        direct: 0.1,
      },
      {
        kind: 'strike',
        at: 0,
        impacts: [impact(0, 0.8, 0.002)],
        modes: [mode(210, 0.35, 0.03)],
      },
    ],
  },
};

/** A stable seed per voice, so its takes are the same every session. */
function seedOf(voice: VoiceName): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < voice.length; index++) {
    hash ^= voice.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The design's layers as one take plays them: each detail strayed a bit. */
function takeLayers(design: Design, random: () => number): Layer[] {
  const stray = (share: number) => 1 + share * (random() * 2 - 1);
  const { spread } = design;
  return design.layers.map(layer => {
    if (layer.kind === 'hiss')
      return { ...layer, ring: layer.ring * stray(spread.ring) };
    if (layer.kind === 'breath') {
      const shift = stray(spread.pitch);
      return { ...layer, from: layer.from * shift, to: layer.to * shift };
    }
    return {
      ...layer,
      at: Math.max(0, layer.at + spread.time * (random() * 2 - 1)),
      impacts: layer.impacts.map((hit, index) => ({
        ...hit,
        // The first contact starts the strike; the rest drift around it.
        at:
          index === 0
            ? hit.at
            : Math.max(0, hit.at + spread.time * (random() * 2 - 1)),
        strength: hit.strength * stray(spread.strength),
      })),
      modes: layer.modes.map(part => ({
        ...part,
        frequency: part.frequency * stray(spread.pitch),
        ring: part.ring * stray(spread.ring),
      })),
    };
  });
}

/** Renders every take of a voice at `sampleRate`. */
export function renderTakes(
  voice: VoiceName,
  sampleRate: number
): Float32Array<ArrayBuffer>[] {
  const design = DESIGNS[voice];
  const random = seeded(seedOf(voice));
  return Array.from({ length: design.takes }, (_, take) =>
    render(takeLayers(design, random), {
      seconds: design.seconds,
      peak: 10 ** (design.peakDb / 20),
      sampleRate,
      seed: seedOf(voice) + take * 7919,
    })
  );
}
