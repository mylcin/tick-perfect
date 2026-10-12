import type {
  BezelSize,
  DialSlot,
  DialStyle,
  WatchSpec,
} from '../watches/spec';

// Watch geometry in scene units: the dial radius is 1, the watch faces +Z
// and 12 o'clock points along +Y. Heights are measured from the dial plane.

export const DEG_TO_RAD = Math.PI / 180;

export const LAYOUT = {
  dialRadius: 1,
  /** The inclined flange between the dial edge and the crystal. */
  rehautRadius: 1.065,
  rehautHeight: 0.07,
  crystalRadius: 1.08,
  crystalHeight: 0.105,
  hourHand: 0.56,
  minuteHand: 0.86,
  secondsHand: 1.02,
  dateWindowRadius: 0.7,
  /** The GMT hand reaches the outer minute track, pointing at the target. */
  gmtHand: 0.95,
} as const;

export interface TrackLayout {
  /** Inner and outer radius of the target band. */
  readonly inner: number;
  readonly outer: number;
  /** Height of the band above the dial plane. */
  readonly z: number;
  /**
   * How far the Perfect core and the edge brackets may reach in past the
   * band and out beyond it: generously on a bezel insert, a little on a
   * chapter ring, whose markers stand just inside it.
   */
  readonly reach: { readonly in: number; readonly out: number };
  /** Whether a pair's ▶ and ■ sit on the band itself (no room beyond it). */
  readonly marksOnBand: boolean;
}

/** An analog-digital dial's two windows: the score's, and the time's. */
export const DIGITAL_WINDOWS = {
  score: { x: 0.49, y: 0.02, width: 0.34, height: 0.19 },
  main: { x: 0, y: -0.44, width: 0.66, height: 0.27 },
} as const;

/** Ten past ten: how a watch is shown when it isn't telling the time. */
export const SHOWROOM_TIME = { hours: 10, minutes: 10, seconds: 30 };

/** The chapter ring at the dial's edge, on watches without a bezel insert. */
export const CHAPTER = { inner: 0.86, outer: 0.995, z: 0.004 } as const;

/** Where the target band sits on a chapter ring. */
const CHAPTER_TRACK: TrackLayout = {
  inner: 0.875,
  outer: 0.965,
  z: 0.007,
  reach: { in: 0.012, out: 0.022 },
  marksOnBand: true,
};

/** The band's depth into a bezel insert, from its inner edge. */
const INSERT_TRACK_DEPTH = 0.095;

/** One layout per spec, so React sees the same object every render. */
const tracks = new WeakMap<WatchSpec, TrackLayout>();

/**
 * Where a watch draws its target: on the inner edge of its bezel insert, or
 * on the chapter ring of a watch whose bezel is plain metal.
 */
export function trackFor(spec: WatchSpec): TrackLayout {
  const known = tracks.get(spec);
  if (known) return known;
  const { bezel } = spec;
  const track =
    spec.targetTrack === 'chapter' || !('insert' in bezel)
      ? CHAPTER_TRACK
      : {
          inner: bezel.insert.inner + 0.005,
          outer: bezel.insert.inner + 0.005 + INSERT_TRACK_DEPTH,
          z: insertHeight(bezel) + 0.002,
          reach: { in: 0.045, out: 0.04 },
          marksOnBand: false,
        };
  tracks.set(spec, track);
  return track;
}

/**
 * How far an insert's printed face sits below the top of its bezel. The
 * bezel geometry recesses it by the same amount (see bezels.ts).
 */
export const INSERT_RECESS = 0.02;

/** Height of a bezel insert's printed face above the dial. */
function insertHeight(bezel: BezelSize): number {
  return bezel.height - INSERT_RECESS;
}

/** Hands reach the band they serve: a bezel insert, or the chapter ring. */
export function handLengths(spec: WatchSpec): {
  readonly hour: number;
  readonly minute: number;
  readonly seconds: number;
  readonly gmt: number;
} {
  const chapter = trackFor(spec) === CHAPTER_TRACK;
  return {
    hour: LAYOUT.hourHand,
    minute: chapter ? 0.82 : LAYOUT.minuteHand,
    seconds: chapter ? 0.95 : LAYOUT.secondsHand,
    gmt: chapter ? 0.9 : LAYOUT.gmtHand,
  };
}

export interface SlotLayout {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * A small round aperture between two hours: as big as the gap between a
 * perpetual's registers, its moon and its batons allows.
 */
const APERTURE = { distance: 0.62, radius: 0.1 } as const;

function aperture(angle: number): SlotLayout {
  const [x, y] = polar(angle, APERTURE.distance);
  return { x, y, radius: APERTURE.radius };
}

/** Sub-dial and aperture positions, shared by every dial. */
export const DIAL_SLOTS: Readonly<Record<DialSlot, SlotLayout>> = {
  six: { x: 0, y: -0.45, radius: 0.2 },
  nine: { x: -0.45, y: 0, radius: 0.2 },
  three: { x: 0.45, y: 0, radius: 0.2 },
  twelve: { x: 0, y: 0.46, radius: 0.17 },
  fourThirty: aperture(135),
};

/**
 * Slots a dial style lays out its own way: the chronograph dials have big
 * registers at 9 and 3, as their two-register calibres do, and a
 * perpetual's moon sits a little lower to leave its apertures room.
 */
const STYLE_SLOTS: Partial<
  Record<DialStyle, Partial<Record<DialSlot, SlotLayout>>>
> = {
  panda: {
    nine: { x: -0.47, y: 0, radius: 0.25 },
    three: { x: 0.47, y: 0, radius: 0.25 },
  },
  perpetual: {
    six: { x: 0, y: -0.47, radius: 0.2 },
    nine: { x: -0.46, y: 0, radius: 0.24 },
    three: { x: 0.46, y: 0, radius: 0.24 },
  },
};

/** Where a slot sits on this watch's dial. */
export function slotFor(spec: WatchSpec, slot: DialSlot): SlotLayout {
  return STYLE_SLOTS[spec.dial.style]?.[slot] ?? DIAL_SLOTS[slot];
}

/** Where the date window (the score) sits. */
export function dateWindowCentre(spec: WatchSpec): [x: number, y: number] {
  switch (spec.date.at) {
    case 'three':
      return polar(90, LAYOUT.dateWindowRadius);
    case 'six':
      // As far out as at 3, upright under the registers.
      return [0, -LAYOUT.dateWindowRadius];
    case 'fourThirty': {
      const { x, y } = slotFor(spec, 'fourThirty');
      return [x, y];
    }
    case 'display':
      // A digital shows it on its display, which has no window.
      return [0, 0];
  }
}

/**
 * Converts a watch angle (degrees clockwise from 12 o'clock) into a rotation
 * about +Z in radians (counter-clockwise, as Three.js expects).
 */
export function watchAngleToRotation(angle: number): number {
  return -angle * DEG_TO_RAD;
}

/** The point `radius` out from the centre in the direction of `angle`. */
export function polar(angle: number, radius: number): [x: number, y: number] {
  const radians = angle * DEG_TO_RAD;
  return [Math.sin(radians) * radius, Math.cos(radians) * radius];
}

/** Hour and minute hand angles showing the wall-clock time. */
export function clockAngles(time: {
  hours: number;
  minutes: number;
  seconds: number;
}): { hour: number; minute: number } {
  const minutes = time.minutes + time.seconds / 60;
  return {
    hour: ((time.hours % 12) + minutes / 60) * 30,
    minute: minutes * 6,
  };
}
