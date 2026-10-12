import { rotate, signedDelta, type GmtGate, type HitQuality } from '../game';

// How the watch answers a hit, a miss or a gate opening over time. Pure
// functions of the time since the moment, so the frame loop only has to
// apply them.

interface FlashStyle {
  /** How long the flash lasts, in ms. */
  readonly duration: number;
  /** Brightness before tone mapping; above ~1.2 it starts to bloom. */
  readonly glow: number;
  /** How far the flash swells outwards as it fades, as a scale. */
  readonly swell: number;
}

/** A Perfect flashes brighter, longer and whiter than a plain hit. */
export const FLASH_STYLES: Readonly<Record<HitQuality, FlashStyle>> = {
  good: { duration: 260, glow: 1.4, swell: 0.035 },
  perfect: { duration: 520, glow: 3.2, swell: 0.06 },
};

/** The flash's strength `age` ms after the hit: 1 at once, fading to 0. */
export function flashStrength(quality: HitQuality, age: number): number {
  const { duration } = FLASH_STYLES[quality];
  if (age < 0 || age >= duration) return 0;
  const left = 1 - age / duration;
  return left * left;
}

/** How dark a GMT gate's covered part is drawn. */
export interface GateCover {
  /** Opacity of the dark shade over it. */
  readonly shade: number;
  /** Opacity of the stripes over the shade, the cue that needs no colour. */
  readonly stripes: number;
}

/**
 * The covered part until the seconds hand reaches the gate line, and on a
 * beaten gate once the GMT hand has landed there.
 */
export const GATE_COVER: Readonly<Record<'waiting' | 'landed', GateCover>> = {
  waiting: { shade: 0.6, stripes: 0.85 },
  landed: { shade: 0.75, stripes: 1 },
};

const GATE_FADE_MS = 150;

/**
 * The covered part `crossed` ms after the seconds hand crossed the gate
 * line; null before it does. Past a waiting gate's line the GMT hand has
 * left, so the cover fades out behind the seconds hand; past a beaten
 * gate's it has landed, so the cover darkens. With animations off, every
 * change is instant.
 */
export function gateCover(
  side: GmtGate['side'],
  crossed: number | null,
  reducedMotion: boolean
): GateCover {
  if (crossed === null) return GATE_COVER.waiting;
  if (side === 'beat') return GATE_COVER.landed;
  const left = reducedMotion ? 0 : Math.max(0, 1 - crossed / GATE_FADE_MS);
  return {
    shade: GATE_COVER.waiting.shade * left,
    stripes: GATE_COVER.waiting.stripes * left,
  };
}

interface GatePulse {
  /** The line's scale about its middle. */
  readonly scale: number;
  /** Its brightness; 1 at rest. */
  readonly glow: number;
}

const GATE_PULSE_MS = 140;
/** How far the line swells at the peak of its pulse, as a scale. */
const GATE_SWELL = 0.25;
const GATE_AT_REST: GatePulse = { scale: 1, glow: 1 };

/**
 * The gate line `crossed` ms after the seconds hand crossed it (null:
 * not yet): a short swell and a flash of light as the judgement flips. With
 * animations off it only flashes.
 */
export function gatePulse(
  crossed: number | null,
  reducedMotion: boolean
): GatePulse {
  if (crossed === null || crossed >= GATE_PULSE_MS) return GATE_AT_REST;
  const rise = Math.sin((Math.PI * crossed) / GATE_PULSE_MS);
  return {
    scale: reducedMotion ? 1 : 1 + GATE_SWELL * rise,
    glow: 1 + rise,
  };
}

const CRACK_FADE_IN_MS = 90;
export const CRACK_OPACITY = 0.7;

/** The crack appears almost at once, as glass does. */
export function crackOpacity(age: number): number {
  if (age <= 0) return 0;
  return CRACK_OPACITY * Math.min(1, age / CRACK_FADE_IN_MS);
}

const SHAKE_MS = 450;
const SHAKE_HZ = 17;
const SHAKE_DECAY_MS = 110;
/** Peak sideways jolt in scene units and twist in radians. */
const SHAKE_OFFSET = 0.014;
const SHAKE_TWIST = 0.012;

interface Jolt {
  readonly offset: number;
  readonly twist: number;
}

const NO_JOLT: Jolt = { offset: 0, twist: 0 };

/** A short, damped jolt of the watch on a miss; none with animations off. */
export function shakeAt(age: number, reducedMotion: boolean): Jolt {
  if (reducedMotion || age < 0 || age >= SHAKE_MS) return NO_JOLT;
  const envelope = Math.exp(-age / SHAKE_DECAY_MS);
  const wave = Math.sin((age / 1000) * SHAKE_HZ * Math.PI * 2);
  return {
    offset: SHAKE_OFFSET * envelope * wave,
    twist: SHAKE_TWIST * envelope * Math.cos((age / 1000) * SHAKE_HZ * Math.PI),
  };
}

/**
 * Eases an angle towards `goal` the short way round, frame-rate
 * independently (like MathUtils.damp, but wrapping at 360°).
 */
export function easeAngle(
  current: number,
  goal: number,
  damping: number,
  deltaSeconds: number
): number {
  const share = 1 - Math.exp(-damping * deltaSeconds);
  return rotate(current, signedDelta(current, goal) * share);
}
