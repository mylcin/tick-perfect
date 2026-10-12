import {
  CanvasTexture,
  NoColorSpace,
  RepeatWrapping,
  type Texture,
} from 'three';

import type { WatchSpec } from '../watches';
import { canvas, colorTexture, planar, SANS } from './canvas';
import { LAYOUT } from './layout';

// Textures shared by every watch, painted on canvases at load time: crisp
// at any size, no image downloads, and recoloured straight from the spec.
// The printing particular to each dial is in prints.ts.

const ANISOTROPY_TEXTURE_SIZE = 256;
const DATE_TEXTURE_WIDTH = 160;
const DATE_TEXTURE_HEIGHT = 128;
const DATE_DISC_TEXTURE_SIZE = 192;
/** The disc's numerals as a share of its diameter: font size, widest run. */
const DATE_DISC_FONT = 0.6;
const DATE_DISC_TEXT_WIDTH = 0.7;
const MOON_TEXTURE_SIZE = 256;
const HATCH_TEXTURE_SIZE = 64;
const SOFTBOX_TEXTURE_SIZE = 64;
const WEAVE_TEXTURE_SIZE = 64;
const CLOUD_TEXTURE_SIZE = 256;

/**
 * A soft radial falloff for the dial base, so the sunburst darkens towards
 * the edge like lacquer pooling at the rim.
 */
export function dialFalloff(): Texture {
  const size = 256;
  const { element, context } = canvas(size);
  planar(context, size, LAYOUT.dialRadius);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.7, '#d0d0d0');
  gradient.addColorStop(1, '#7a7a7a');
  context.fillStyle = gradient;
  context.fillRect(-1, -1, 2, 2);
  return colorTexture(element);
}

/**
 * Per-pixel brushing direction for MeshPhysicalMaterial.anisotropyMap: RG
 * holds the direction in UV space, B the strength. Radial grain is what
 * turns a flat dial into a sunburst that sweeps as the watch tilts.
 */
export function sunburstAnisotropy(strength: number): Texture {
  const size = ANISOTROPY_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  const image = context.createImageData(size, size);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      // Canvas rows run down; UV v runs up.
      const u = (column + 0.5) / size - 0.5;
      const v = 0.5 - (row + 0.5) / size;
      const length = Math.hypot(u, v) || 1;
      const index = (row * size + column) * 4;
      image.data[index] = ((u / length) * 0.5 + 0.5) * 255;
      image.data[index + 1] = ((v / length) * 0.5 + 0.5) * 255;
      image.data[index + 2] = strength * 255;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(element);
  texture.colorSpace = NoColorSpace;
  return texture;
}

/**
 * The moon in its aperture as it is tonight: a gold disc on a starry sky,
 * lit from the right while waxing and from the left while waning.
 */
export function moonTexture(sky: string, moon: string, phase: number): Texture {
  const size = MOON_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  const centre = size / 2;
  context.fillStyle = sky;
  context.fillRect(0, 0, size, size);
  context.fillStyle = moon;
  for (const [x, y, r] of [
    [0.2, 0.3, 0.012],
    [0.78, 0.22, 0.016],
    [0.84, 0.7, 0.01],
    [0.16, 0.74, 0.014],
    [0.5, 0.12, 0.009],
    [0.62, 0.86, 0.011],
  ] as const) {
    context.beginPath();
    context.arc(x * size, y * size, r * size, 0, Math.PI * 2);
    context.fill();
  }

  const radius = size * 0.3;
  context.globalAlpha = 0.22;
  context.beginPath();
  context.arc(centre, centre, radius, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  // The lit part: a half disc plus or minus the terminator's half ellipse.
  const waning = phase > 0.5;
  const turn = Math.cos(phase * Math.PI * 2);
  context.save();
  context.translate(centre, centre);
  if (waning) context.scale(-1, 1);
  context.beginPath();
  context.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
  context.ellipse(
    0,
    0,
    Math.abs(turn) * radius,
    radius,
    0,
    Math.PI / 2,
    turn > 0 ? -Math.PI / 2 : (Math.PI * 3) / 2,
    turn > 0
  );
  context.fill();
  context.restore();
  return colorTexture(element);
}

/**
 * The face of a studio softbox: full in the middle and fading smoothly to
 * nothing at the rim, so the panel mirrored in the crystal or the case is a
 * soft glow rather than a hard-edged rectangle. `feather` is the share of
 * each half that fades (1 fades all the way to the centre).
 */
export function softboxTexture(feather: number): Texture {
  const size = SOFTBOX_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  const image = context.createImageData(size, size);
  const ramp = (position: number) => {
    const share = Math.min(1, Math.min(position, 1 - position) / (feather / 2));
    return share * share * (3 - 2 * share);
  };
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const value =
        ramp((column + 0.5) / size) * ramp((row + 0.5) / size) * 255;
      const index = (row * size + column) * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(element);
  texture.colorSpace = NoColorSpace;
  return texture;
}

/** Puffs in a cloud's texture, and how big they are, in texture widths. */
const CLOUD_PUFFS = 220;
const CLOUD_PUFF = { min: 0.03, max: 0.1 } as const;
/** The mist the puffs float in. */
const CLOUD_MIST = 0.5;

/**
 * Cloud over the dial, planar like the dial print: soft white puffs of
 * every size in a white mist, thick in some places and thin in others.
 * Drawn from a fixed sequence, so every cloud is the same.
 */
export function cloudTexture(): Texture {
  const size = CLOUD_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  context.fillStyle = `rgba(255, 255, 255, ${String(CLOUD_MIST)})`;
  context.fillRect(0, 0, size, size);
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let puff = 0; puff < CLOUD_PUFFS; puff++) {
    const x = next() * size;
    const y = next() * size;
    const radius =
      (CLOUD_PUFF.min + next() * (CLOUD_PUFF.max - CLOUD_PUFF.min)) * size;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.3 + next() * 0.4;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(2)})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return colorTexture(element);
}

/** Threads across one tile of a canvas strap's weave. */
const WEAVE_THREADS = 4;

/**
 * A tile of plain-woven canvas, light where a thread rides over and dark
 * where it dips under, to multiply over a strap's colour.
 */
export function weaveTexture(): Texture {
  const size = WEAVE_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  const pitch = size / WEAVE_THREADS;
  context.fillStyle = '#9a9a9a';
  context.fillRect(0, 0, size, size);
  for (let row = 0; row < WEAVE_THREADS; row++) {
    for (let column = 0; column < WEAVE_THREADS; column++) {
      // Over and under in turn: along the strap here, across it next.
      const along = (row + column) % 2 === 0;
      const x = column * pitch;
      const y = row * pitch;
      const gradient = along
        ? context.createLinearGradient(x, 0, x + pitch, 0)
        : context.createLinearGradient(0, y, 0, y + pitch);
      gradient.addColorStop(0, '#b4b4b4');
      gradient.addColorStop(0.5, '#ffffff');
      gradient.addColorStop(1, '#b4b4b4');
      context.fillStyle = gradient;
      const inset = pitch * 0.06;
      context.fillRect(
        x + inset,
        y + inset,
        pitch - inset * 2,
        pitch - inset * 2
      );
    }
  }
  const texture = colorTexture(element);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Diagonal stripes for the target while the GMT hand covers it. */
export function hatchTexture(): Texture {
  const size = HATCH_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  context.strokeStyle = '#ffffff';
  context.lineWidth = size / 8;
  for (let offset = -size; offset < size * 2; offset += size / 2) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + size, size);
    context.stroke();
  }
  const texture = colorTexture(element);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * A texture for the date window, redrawn whenever the score changes: a
 * wheel under a rectangular window, or a disc under a round aperture.
 */
export function createDateWheel(spec: WatchSpec): {
  texture: Texture;
  show: (value: number) => void;
} {
  return spec.date.at === 'fourThirty'
    ? createDateDisc(spec)
    : createRectangularDateWheel(spec);
}

function createRectangularDateWheel(spec: WatchSpec): {
  texture: Texture;
  show: (value: number) => void;
} {
  const { element, context } = canvas(DATE_TEXTURE_WIDTH, DATE_TEXTURE_HEIGHT);
  const texture = colorTexture(element);
  const show = (value: number) => {
    context.fillStyle = spec.accents.dateWheel;
    context.fillRect(0, 0, DATE_TEXTURE_WIDTH, DATE_TEXTURE_HEIGHT);
    const text = String(value);
    const size = text.length > 2 ? 64 : 92;
    context.fillStyle = spec.accents.dateText;
    context.font = `700 ${String(size)}px ${SANS}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, DATE_TEXTURE_WIDTH / 2, DATE_TEXTURE_HEIGHT / 2 + 4);
    texture.needsUpdate = true;
  };
  show(0);
  return { texture, show };
}

/** Darkens a square canvas towards its inscribed circle's rim. */
function sunkShade(context: CanvasRenderingContext2D, size: number) {
  const centre = size / 2;
  const shadow = context.createRadialGradient(
    centre,
    centre,
    size * 0.3,
    centre,
    centre,
    size * 0.5
  );
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  context.fillStyle = shadow;
  context.fillRect(0, 0, size, size);
}

/**
 * The score on a disc seen through a small round aperture. One or two
 * digits fill the opening; three and more shrink to fit inside the circle.
 */
function createDateDisc(spec: WatchSpec): {
  texture: Texture;
  show: (value: number) => void;
} {
  const size = DATE_DISC_TEXTURE_SIZE;
  const { element, context } = canvas(size);
  const texture = colorTexture(element);
  const centre = size / 2;
  const show = (value: number) => {
    context.fillStyle = spec.accents.dateWheel;
    context.fillRect(0, 0, size, size);
    sunkShade(context, size);
    const text = String(value);
    context.fillStyle = spec.accents.dateText;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // As tall as the opening allows, narrowed to fit a long score across.
    let font = DATE_DISC_FONT * size;
    context.font = `700 ${String(font)}px ${SANS}`;
    const width = context.measureText(text).width;
    font *= Math.min(1, (size * DATE_DISC_TEXT_WIDTH) / width);
    context.font = `700 ${String(font)}px ${SANS}`;
    context.fillText(text, centre, centre + font * 0.04);
    texture.needsUpdate = true;
  };
  show(0);
  return { texture, show };
}

export { shade } from './canvas';
