import { LAYOUT } from '../layout';
import type { Point } from './outlines';

// Half cross-sections of the turned parts, as [radius, height] pairs from
// the inside out. They are spun around the watch axis into lathe geometry.

/** Case middle and caseback; the bezel sits on its top step. */
export function caseProfile(radius: number, height: number): Point[] {
  const top = 0.1;
  const bottom = top - height - 0.01;
  return [
    [0, bottom],
    [radius - 0.3, bottom],
    [radius - 0.16, bottom + 0.035],
    [radius - 0.055, bottom + 0.11],
    [radius, bottom + 0.19],
    [radius, top - 0.07],
    [radius - 0.012, top - 0.025],
    [radius - 0.04, top],
    [LAYOUT.crystalRadius, top],
  ];
}

/**
 * The inclined flange (rehaut) from the crystal down to the dial edge. Lathe
 * faces point to the left of the profile's direction, so it runs from the
 * outside in to face the viewer.
 */
export function rehautProfile(): Point[] {
  return [
    [LAYOUT.crystalRadius, LAYOUT.crystalHeight],
    [LAYOUT.rehautRadius, LAYOUT.rehautHeight],
    [LAYOUT.dialRadius, 0],
  ];
}

/** The polished ring framing a sub-dial or an aperture. */
export function subdialRimProfile(radius: number): Point[] {
  // From the outside in, so its faces point up at the viewer.
  return [
    [radius + 0.01, 0.0005],
    [radius + 0.004, 0.006],
    [radius - 0.006, 0.006],
    [radius - 0.012, 0.0005],
  ];
}

/**
 * The polished frame round a small aperture: a rounded ring standing as
 * proud as the date window's frame, its inner edge over the disc's rim.
 */
export function apertureFrameProfile(radius: number): Point[] {
  return [
    [radius + 0.018, 0.0005],
    [radius + 0.016, 0.006],
    [radius + 0.011, 0.011],
    [radius + 0.004, 0.012],
    [radius - 0.002, 0.008],
    [radius - 0.005, 0.0005],
  ];
}
