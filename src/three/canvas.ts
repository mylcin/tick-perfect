import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

import { polar } from './layout';

// Helpers for the canvases that the watch's prints are painted on.

export const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const SERIF = 'Didot, "Bodoni 72", "Times New Roman", Times, serif';
/** Squarer, technical lettering, as on a racing movement's flange. */
export const TECHNICAL =
  '"DIN Alternate", "Eurostile", "Arial Narrow", sans-serif';
const DEG = Math.PI / 180;

export function canvas(width: number, height = width) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  return { element, context };
}

export function colorTexture(
  element: HTMLCanvasElement,
  anisotropy = 4
): Texture {
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Maps scene units onto a square canvas that covers [-extent, extent], the
 * way CircleGeometry and RingGeometry lay out their UVs.
 */
export function planar(
  context: CanvasRenderingContext2D,
  size: number,
  extent: number
) {
  const scale = size / (extent * 2);
  context.setTransform(scale, 0, 0, -scale, size / 2, size / 2);
}

export interface TextStyle {
  readonly size: number;
  readonly weight?: number;
  /** Letter spacing as a share of the size. */
  readonly tracking?: number;
  readonly family?: string;
}

/** Text centred on (x, y), upright under the planar transform. */
export function printText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  { size, weight = 400, tracking = 0, family = SANS }: TextStyle
) {
  // The planar transform flips Y; flip back locally so text reads upright.
  context.save();
  context.translate(x, y);
  context.scale(1, -1);
  context.font = `${String(weight)} ${String(size * 100)}px ${family}`;
  context.letterSpacing = `${String(tracking * size * 100)}px`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.scale(0.01, 0.01);
  context.fillText(text, 0, 0);
  context.restore();
}

/** Text at `angle` on a circle of `radius`, its top facing out. */
export function radialText(
  context: CanvasRenderingContext2D,
  text: string,
  angle: number,
  radius: number,
  style: TextStyle
) {
  context.save();
  const [x, y] = polar(angle, radius);
  context.translate(x, y);
  context.rotate(-angle * DEG);
  printText(context, text, 0, 0, style);
  context.restore();
}

/** A radial bar at `angle`, from radius `from` to `to`. */
export function bar(
  context: CanvasRenderingContext2D,
  angle: number,
  from: number,
  to: number,
  width: number
) {
  const [x1, y1] = polar(angle, from);
  const [x2, y2] = polar(angle, to);
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

export function ring(
  context: CanvasRenderingContext2D,
  radius: number,
  width: number
) {
  context.lineWidth = width;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
}

export function disc(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex colour. */
export function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [16, 8, 0].map(shift => (value >> shift) & 0xff);
  const mixed = channels.map(channel =>
    Math.round(
      amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount
    )
  );
  return `#${mixed.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * `text` round a circle of `radius`, centred on `angle` (degrees clockwise
 * from 12), one letter at a time: reading outwards at the top of the
 * circle, inwards at the bottom, so it is never upside down.
 */
export function arcText(
  context: CanvasRenderingContext2D,
  text: string,
  angle: number,
  radius: number,
  style: TextStyle,
  /** Degrees between letters. */
  step: number
) {
  const bottom = Math.cos(angle * DEG) < 0;
  const letters = Array.from(
    new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text),
    ({ segment }) => segment
  );
  const start = angle - ((letters.length - 1) * step) / 2;
  letters.forEach((letter, index) => {
    const at = bottom
      ? angle + ((letters.length - 1) * step) / 2 - index * step
      : start + index * step;
    const [x, y] = polar(at, radius);
    context.save();
    context.translate(x, y);
    context.rotate(-at * DEG + (bottom ? Math.PI : 0));
    printText(context, letter, 0, 0, { ...style, tracking: 0 });
    context.restore();
  });
}
