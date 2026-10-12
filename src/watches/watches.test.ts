import { describe, expect, it } from 'vitest';

import {
  VARIANTS,
  WATCH_ORDER,
  WATCHES,
  withVariant,
  type Color,
  type WatchSpec,
} from '.';

/** WCAG relative luminance of an sRGB hex colour. */
function luminance(hex: Color): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r = 0, g = 0, b = 0] = [16, 8, 0].map(shift => {
    const channel = ((value >> shift) & 0xff) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Color, b: Color): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Every colour the target can sit on. */
function trackColors(spec: WatchSpec): Color[] {
  const { bezel } = spec;
  if (spec.targetTrack === 'chapter') return [spec.dial.color];
  switch (bezel.type) {
    case 'gmt24':
      return [bezel.dayColor, bezel.nightColor];
    case 'diveTimer':
    case 'minutes60':
      return [bezel.insertColor];
    default:
      return [];
  }
}

// Shape cues come first (brackets, the Perfect core standing proud), but
// low vision still needs the colours themselves to stand apart.
const MIN_CONTRAST = 3;

// Every watch in every variant: a colourway must read as well as the
// standard.
const WORN = WATCH_ORDER.flatMap(id =>
  VARIANTS[id].map(
    variant =>
      [
        `${id} (${variant.id})`,
        id,
        withVariant(WATCHES[id], variant.id),
      ] as const
  )
);

describe.each(WORN)('%s', (_, id, spec) => {
  it('is filed under its own id', () => {
    expect(spec.id).toBe(id);
  });

  it('carries the target on something it stands out from', () => {
    const tracks = trackColors(spec);
    expect(tracks.length).toBeGreaterThan(0);
    for (const track of tracks) {
      expect(contrast(spec.accents.target, track)).toBeGreaterThanOrEqual(
        MIN_CONTRAST
      );
    }
  });

  it('draws the seconds hand clear of its dial', () => {
    expect(
      contrast(spec.hands.secondsColor, spec.dial.color)
    ).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('lights its lume brighter at night', () => {
    expect(spec.lume.night).toBeGreaterThan(spec.lume.day);
  });

  it('puts the target on an insert only when the bezel has one', () => {
    // A digital's guard is printed with its buttons, not a scale.
    const scale = 'insert' in spec.bezel && spec.bezel.type !== 'octagon';
    expect(spec.targetTrack === 'bezel').toBe(scale);
  });

  it('gives every sub-dial, aperture and window a slot of its own', () => {
    const { chronograph, smallSeconds, moon, tourbillon } = spec.complications;
    const taken: string[] = [
      ...(chronograph ? [chronograph.counter] : []),
      ...(smallSeconds ? [smallSeconds.slot] : []),
      ...(moon ? [moon.slot] : []),
      ...(tourbillon ? [tourbillon.slot] : []),
      spec.date.at,
    ];
    expect(new Set(taken).size).toBe(taken.length);
  });

  it('has a GMT hand exactly when its rules can gate', () => {
    const gates = spec.rules.twists.some(twist => twist.kind === 'gmt');
    expect(spec.complications.gmt !== undefined).toBe(gates);
  });
});
