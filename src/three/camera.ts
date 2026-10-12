import { DEG_TO_RAD } from './layout';

/** How the watch is framed: the title's turntable, play, or the results. */
export type RigMode = 'showcase' | 'play' | 'result';

/** A part of the screen, as fractions of its width and height (0 to 1). */
export interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export const FULL_SCREEN: Box = { top: 0, bottom: 1, left: 0, right: 1 };

/**
 * Screens at least this much wider than tall lay out side by side. The CSS
 * uses the same breakpoints (the `wide` and `short` variants in index.css).
 */
const WIDE_ASPECT = 6 / 5;
/** Below this height (CSS px) a wide screen is a phone held sideways. */
export const SHORT_HEIGHT = 520;
/** Below this height (CSS px) an upright screen is a small phone. */
const COMPACT_HEIGHT = 700;

/**
 * Frames a circle of `radius` inside a box on the screen, for a camera with
 * the given vertical field of view. Returns how far back the camera stands
 * and how far the circle must move (in world units) to sit centred in the
 * box, so the rest of the screen stays free for text.
 */
export function fitInBox({
  fov,
  aspect,
  radius,
  box,
}: {
  fov: number;
  aspect: number;
  radius: number;
  box: Box;
}): { distance: number; x: number; y: number } {
  const tangent = Math.tan((fov / 2) * DEG_TO_RAD);
  // In units of half the screen height, the box's half height is
  // (bottom - top) and its half width (right - left) × aspect; the smaller
  // decides.
  const distance =
    radius /
    (tangent * Math.min((box.right - box.left) * aspect, box.bottom - box.top));
  const halfHeight = tangent * distance;
  return {
    distance,
    x: (box.left + box.right - 1) * aspect * halfHeight,
    y: (1 - box.top - box.bottom) * halfHeight,
  };
}

/**
 * The camera's depth range. It never comes near the watch, and stands far
 * back for the smallest framings: a wide near plane keeps the depth sharp
 * out there.
 */
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 100;

/**
 * The least of the screen's height the watch keeps upright, however much
 * text there is under it: small enough that on the smallest phone it ends
 * above the text rather than under its shade.
 */
const MIN_UPRIGHT_HEIGHT = 0.14;

/**
 * Ends an upright box where the text under the watch starts (a share of the
 * screen's height), when that is higher than the box would end anyway.
 */
function above(box: Box, textTop: number | null): Box {
  if (textTop === null) return box;
  const bottom = Math.min(
    box.bottom,
    Math.max(textTop, box.top + MIN_UPRIGHT_HEIGHT)
  );
  return { ...box, bottom };
}

/**
 * Where the watch sits in each mode, and the radius kept clear around its
 * centre (the bezel is 1.42; the strap may run off screen). Text gets the
 * rest: the title above and the button below, the HUD at the bottom (or to
 * the side on a phone held sideways), the results beside or under it.
 * Upright, `textTop` is where the title's column or the results start, as
 * measured on the page, so a tall stack of text never covers the dial.
 */
export function framingFor(
  mode: RigMode,
  { width, height }: { width: number; height: number },
  textTop: number | null = null
): { box: Box; radius: number } {
  const wide = width / Math.max(height, 1) >= WIDE_ASPECT;
  const short = wide && height < SHORT_HEIGHT;
  switch (mode) {
    case 'showcase':
      // The collection: the watch above its strip, or left of it (of half
      // the screen, on a phone held sideways).
      if (wide) {
        return {
          box: short
            ? { top: 0.1, bottom: 0.96, left: 0, right: 0.5 }
            : { top: 0.12, bottom: 0.9, left: 0, right: 0.56 },
          radius: 1.85,
        };
      }
      // Upright, the button, the Daily and the strip take the lower part.
      return {
        box: above(
          {
            top: 0.1,
            bottom: height < COMPACT_HEIGHT ? 0.47 : 0.54,
            left: 0,
            right: 1,
          },
          textTop
        ),
        radius: 1.85,
      };
    case 'play':
      return {
        box: short
          ? { top: 0.04, bottom: 0.96, left: 0, right: 1 }
          : { top: 0.03, bottom: 0.85, left: 0, right: 1 },
        radius: 1.85,
      };
    case 'result':
      if (wide) {
        return {
          // Sideways on a phone the results need more of the width.
          box: { top: 0.06, bottom: 0.94, left: 0, right: short ? 0.5 : 0.55 },
          radius: 1.95,
        };
      }
      return {
        box: above(
          {
            top: 0.04,
            bottom: height < COMPACT_HEIGHT ? 0.5 : 0.56,
            left: 0,
            right: 1,
          },
          textTop
        ),
        radius: 1.95,
      };
  }
}
