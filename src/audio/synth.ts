// A small modal synthesiser. A struck part rings at a handful of its own
// frequencies (its modes), each fading at its own rate: a watch's sounds are
// short impacts (a pallet locking, a pusher bottoming out, a hammer on a
// gong) exciting the modes of the parts they hit. Every sound is rendered
// once into a buffer of samples, in plain arithmetic, so it is the same in
// every browser and can be tested without Web Audio.

/** A uniform source in [0, 1) from a seed: every render is repeatable. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** One way a struck part rings. */
export interface Mode {
  readonly frequency: number;
  /** Its level relative to the part's other modes. */
  readonly gain: number;
  /** Seconds it takes to fade by 60 dB. */
  readonly ring: number;
}

/** A contact: a burst of force that sets the modes ringing. */
export interface Impact {
  /** Seconds after the strike begins. */
  readonly at: number;
  readonly strength: number;
  /**
   * How long the contact lasts, in seconds. A hard, short contact rings
   * every mode; a soft, long one (a felt hammer) mostly the low ones.
   */
  readonly width: number;
  /**
   * How rough the contact is, in [0, 1]: 1 (the default) a burst of noise,
   * as a rough or loose contact gives; 0 a clean pulse of force, as two
   * polished, close-fitting surfaces meeting give.
   */
  readonly noise?: number;
}

/**
 * Impacts on one part. `direct` adds the contact itself, unfiltered: the
 * dry click of metal on metal, on top of the ring.
 */
export interface Strike {
  readonly kind: 'strike';
  readonly at: number;
  readonly impacts: readonly Impact[];
  readonly modes: readonly Mode[];
  readonly direct?: number;
}

/** Air: noise fading away, above a cutoff (a crystal giving way). */
export interface Hiss {
  readonly kind: 'hiss';
  readonly at: number;
  readonly gain: number;
  /** Seconds it takes to fade by 60 dB. */
  readonly ring: number;
  readonly cutoff: number;
}

/** A soft breath of noise whose pitch glides from one band to another. */
export interface Breath {
  readonly kind: 'breath';
  readonly at: number;
  readonly gain: number;
  readonly length: number;
  readonly from: number;
  readonly to: number;
  readonly q: number;
}

export type Layer = Strike | Hiss | Breath;

const LN_1000 = Math.log(1000);
/** The last stretch of every sound fades out, so it always ends silent. */
const TAIL_SECONDS = 0.005;

/** Per-sample decay that fades by 60 dB over `ring` seconds. */
function decayPerSample(ring: number, sampleRate: number): number {
  return Math.exp(-LN_1000 / (ring * sampleRate));
}

/**
 * The impacts as a force signal: windowed bursts of seeded noise, smoothing
 * towards a clean pulse as a contact's roughness falls.
 */
function excitation(
  impacts: readonly Impact[],
  length: number,
  sampleRate: number,
  random: () => number
): Float32Array {
  const force = new Float32Array(length);
  for (const { at, strength, width, noise = 1 } of impacts) {
    const start = Math.round(at * sampleRate);
    const span = Math.max(2, Math.round(width * sampleRate));
    for (let index = 0; index < span; index++) {
      const sample = start + index;
      if (sample < 0 || sample >= length) continue;
      // A raised-cosine window: the force swells and falls with no click
      // of its own beyond the contact.
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / span);
      // Drawn whatever the roughness, so the seed's sequence never shifts.
      const grain = random() * 2 - 1;
      force[sample] =
        (force[sample] ?? 0) +
        strength * window * (noise * grain + (1 - noise));
    }
  }
  return force;
}

/**
 * Adds one mode's ring to `out`: a two-pole resonator driven by `force`,
 * scaled so its impulse response peaks at the mode's gain.
 */
function resonate(
  out: Float32Array,
  force: Float32Array,
  offset: number,
  mode: Mode,
  sampleRate: number
) {
  const omega = (2 * Math.PI * mode.frequency) / sampleRate;
  if (omega <= 0 || omega >= Math.PI) return;
  const radius = decayPerSample(mode.ring, sampleRate);
  const a1 = 2 * radius * Math.cos(omega);
  const a2 = radius * radius;
  const scale = mode.gain * Math.sin(omega);
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index + offset < out.length; index++) {
    const y = a1 * y1 - a2 * y2 + (force[index] ?? 0) * scale;
    y2 = y1;
    y1 = y;
    const sample = index + offset;
    out[sample] = (out[sample] ?? 0) + y;
  }
}

function strike(
  out: Float32Array,
  layer: Strike,
  sampleRate: number,
  random: () => number
) {
  const offset = Math.round(layer.at * sampleRate);
  const force = excitation(
    layer.impacts,
    out.length - offset,
    sampleRate,
    random
  );
  for (const mode of layer.modes)
    resonate(out, force, offset, mode, sampleRate);
  if (layer.direct) {
    force.forEach((value, index) => {
      const sample = index + offset;
      out[sample] = (out[sample] ?? 0) + value * (layer.direct ?? 0);
    });
  }
}

function hiss(
  out: Float32Array,
  layer: Hiss,
  sampleRate: number,
  random: () => number
) {
  const offset = Math.round(layer.at * sampleRate);
  const fade = decayPerSample(layer.ring, sampleRate);
  // A one-pole high-pass leaves the air above the cutoff.
  const keep = Math.exp((-2 * Math.PI * layer.cutoff) / sampleRate);
  let level = layer.gain;
  let lastIn = 0;
  let lastOut = 0;
  for (let sample = offset; sample < out.length; sample++) {
    const noise = random() * 2 - 1;
    lastOut = keep * (lastOut + noise - lastIn);
    lastIn = noise;
    out[sample] = (out[sample] ?? 0) + lastOut * level;
    level *= fade;
  }
}

function breath(
  out: Float32Array,
  layer: Breath,
  sampleRate: number,
  random: () => number
) {
  const offset = Math.round(layer.at * sampleRate);
  const span = Math.round(layer.length * sampleRate);
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < span && index + offset < out.length; index++) {
    const share = index / span;
    // The band glides exponentially, as a pitch does.
    const frequency = layer.from * (layer.to / layer.from) ** share;
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const radius = 1 - omega / (2 * layer.q);
    const y =
      2 * radius * Math.cos(omega) * y1 -
      radius * radius * y2 +
      (random() * 2 - 1) * (1 - radius);
    y2 = y1;
    y1 = y;
    // In softly and out again.
    const swell = Math.sin(Math.PI * share);
    const sample = index + offset;
    out[sample] = (out[sample] ?? 0) + y * swell * layer.gain;
  }
}

/**
 * Renders `layers` into `seconds` of samples, fades out the tail and scales
 * the whole so its loudest sample sits at `peak`.
 */
export function render(
  layers: readonly Layer[],
  {
    seconds,
    peak,
    sampleRate,
    seed,
  }: { seconds: number; peak: number; sampleRate: number; seed: number }
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.ceil(seconds * sampleRate));
  const random = seeded(seed);
  for (const layer of layers) {
    if (layer.kind === 'strike') strike(out, layer, sampleRate, random);
    else if (layer.kind === 'hiss') hiss(out, layer, sampleRate, random);
    else breath(out, layer, sampleRate, random);
  }

  const tail = Math.min(out.length, Math.round(TAIL_SECONDS * sampleRate));
  for (let index = 0; index < tail; index++) {
    const sample = out.length - tail + index;
    out[sample] =
      (out[sample] ?? 0) *
      (0.5 + 0.5 * Math.cos((Math.PI * (index + 1)) / tail));
  }

  let loudest = 0;
  for (const value of out) loudest = Math.max(loudest, Math.abs(value));
  if (loudest > 0) {
    const scale = peak / loudest;
    for (let index = 0; index < out.length; index++) {
      out[index] = (out[index] ?? 0) * scale;
    }
  }
  return out;
}
