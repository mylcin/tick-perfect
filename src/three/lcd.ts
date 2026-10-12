import { NoColorSpace, type Texture } from 'three';

import type { WatchSpec } from '../watches';
import { canvas, colorTexture, planar, printText, SANS, shade } from './canvas';
import { DIGITAL_WINDOWS, LAYOUT } from './layout';

// An analog-digital dial's two windows, painted on a canvas over the whole
// dial, clear but for them: seven-segment digits as liquid crystal shows
// them, every unlit segment a faint ghost behind the lit ones. A second
// canvas says where the backlight shines through: round dark segments on
// a positive display, through light ones on a negative.

const DISPLAY_TEXTURE_SIZE = 512;

/** What the windows show. */
export interface DisplayContent {
  readonly score: number;
  /** The time of day, or a countdown's beats to go. */
  readonly main:
    | {
        readonly kind: 'time';
        readonly hours: number;
        readonly minutes: number;
        readonly seconds: number;
      }
    | { readonly kind: 'count'; readonly count: number };
}

/** Each character's lit segments: a to g, round from the top. */
const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
};

/** A digit's proportions, as shares of its height. */
const DIGIT = {
  width: 0.5,
  thickness: 0.13,
  gap: 0.02,
  advance: 0.72,
  skew: 0.1,
} as const;

type Point = readonly [number, number];

/** The seven segments of a digit `height` tall, its bottom left at x, y. */
function segmentsAt(
  x: number,
  y: number,
  height: number
): Readonly<Record<string, readonly Point[]>> {
  const t = height * DIGIT.thickness;
  const g = height * DIGIT.gap;
  const w = height * DIGIT.width;
  const left = x + t / 2;
  const right = x + w - t / 2;
  const top = y + height - t / 2;
  const middle = y + height / 2;
  const bottom = y + t / 2;
  const across = (y0: number): Point[] => [
    [left + g, y0],
    [left + g + t / 2, y0 + t / 2],
    [right - g - t / 2, y0 + t / 2],
    [right - g, y0],
    [right - g - t / 2, y0 - t / 2],
    [left + g + t / 2, y0 - t / 2],
  ];
  const down = (x0: number, from: number, to: number): Point[] => [
    [x0, from],
    [x0 + t / 2, from + t / 2],
    [x0 + t / 2, to - t / 2],
    [x0, to],
    [x0 - t / 2, to - t / 2],
    [x0 - t / 2, from + t / 2],
  ];
  // Slanted forwards, as a watch's digits are.
  const slant = (points: Point[]) =>
    points.map(([px, py]) => [px + (py - y) * DIGIT.skew, py] as const);
  return {
    a: slant(across(top)),
    b: slant(down(right, middle + g, top - g)),
    c: slant(down(right, bottom + g, middle - g)),
    d: slant(across(bottom)),
    e: slant(down(left, bottom + g, middle - g)),
    f: slant(down(left, middle + g, top - g)),
    g: slant(across(middle)),
  };
}

function fill(context: CanvasRenderingContext2D, points: readonly Point[]) {
  context.beginPath();
  points.forEach(([px, py], index) => {
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.closePath();
  context.fill();
}

/** How wide a character runs at `height`. */
function advanceOf(character: string, height: number): number {
  return height * (character === ':' ? 0.3 : DIGIT.advance);
}

/** How wide `text` runs at `height`. */
function runWidth(text: string, height: number): number {
  let width = 0;
  for (const character of text) width += advanceOf(character, height);
  return width;
}

/**
 * `text` in seven segments, `height` tall, its bottom left at x, y: lit in
 * `lit`, the unlit segments of every digit in `ghost`.
 */
function segmentText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  height: number,
  lit: string,
  ghost: string
) {
  let at = x;
  const dot = height * DIGIT.thickness;
  for (const character of text) {
    if (character === ':') {
      context.fillStyle = lit;
      for (const row of [0.3, 0.7]) {
        const cy = y + height * row;
        context.fillRect(
          at + height * 0.08 + (cy - y) * DIGIT.skew - dot / 2,
          cy - dot / 2,
          dot,
          dot
        );
      }
    } else {
      const on = SEGMENTS[character] ?? '';
      for (const [name, points] of Object.entries(segmentsAt(at, y, height))) {
        context.fillStyle = on.includes(name) ? lit : ghost;
        fill(context, points);
      }
    }
    at += advanceOf(character, height);
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The text a content shows, as one string, so a repaint can be skipped. */
export function displayKey(content: DisplayContent): string {
  const { main } = content;
  const shown =
    main.kind === 'count'
      ? `C${String(main.count)}`
      : `${pad(main.hours)}:${pad(main.minutes)}:${pad(main.seconds)}`;
  return `${String(content.score)}|${shown}`;
}

/** Whether a dial's crystal is light under dark segments: a positive one. */
export function isPositive(spec: WatchSpec): boolean {
  const hex = (spec.dial.registerColor ?? spec.dial.color).slice(1);
  const channel = (offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4) > 0.3;
}

/** Digit heights, as shares of their window's. */
const SCORE_DIGITS = 0.6;
const TIME_DIGITS = 0.6;
const SECONDS_DIGITS = 0.36;
const COUNT_DIGIT = 0.78;
/** Room between the time and its seconds, and inside a window's end. */
const SPACING = 0.025;
const INSET = 0.03;

/**
 * Paints `content` on the windows' canvases: `color` as they look, `mask`
 * where the backlight shines.
 */
function paintDisplay(
  color: CanvasRenderingContext2D,
  mask: CanvasRenderingContext2D,
  spec: WatchSpec,
  content: DisplayContent
) {
  const positive = isPositive(spec);
  const crystal = spec.dial.registerColor ?? spec.dial.color;
  const segment = spec.dial.registerPrint ?? spec.dial.printColor;
  const ghost = shade(crystal, positive ? -0.07 : 0.09);
  const extent = LAYOUT.dialRadius;
  for (const [context, look] of [
    [color, { crystal, lit: segment, ghost }],
    // The backlight glows through the crystal, never through a segment
    // on a positive display; through the segments only on a negative.
    [
      mask,
      positive
        ? { crystal: '#ffffff', lit: '#000000', ghost: '#e6e6e6' }
        : { crystal: '#000000', lit: '#ffffff', ghost: '#141414' },
    ],
  ] as const) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, DISPLAY_TEXTURE_SIZE, DISPLAY_TEXTURE_SIZE);
    planar(context, DISPLAY_TEXTURE_SIZE, extent);
    for (const { x, y, width, height } of Object.values(DIGITAL_WINDOWS)) {
      context.fillStyle = look.crystal;
      context.fillRect(x - width / 2, y - height / 2, width, height);
    }

    // The score, right-aligned in its window at 3.
    const { score, main } = DIGITAL_WINDOWS;
    const scoreText = String(Math.min(content.score, 9999)).padStart(4, ' ');
    const scoreHeight = score.height * SCORE_DIGITS;
    segmentText(
      context,
      scoreText,
      score.x + score.width / 2 - INSET - runWidth(scoreText, scoreHeight),
      score.y - scoreHeight / 2,
      scoreHeight,
      look.lit,
      look.ghost
    );

    // The time, seconds beside it; or the countdown, one big digit.
    if (content.main.kind === 'time') {
      const { hours, minutes, seconds } = content.main;
      const time = `${pad(hours)}:${pad(minutes)}`;
      const height = main.height * TIME_DIGITS;
      const small = main.height * SECONDS_DIGITS;
      const run = runWidth(time, height) + SPACING + runWidth('00', small);
      const left = main.x - run / 2;
      segmentText(
        context,
        time,
        left,
        main.y - height / 2,
        height,
        look.lit,
        look.ghost
      );
      segmentText(
        context,
        pad(seconds),
        left + runWidth(time, height) + SPACING,
        main.y - height / 2,
        small,
        look.lit,
        look.ghost
      );
    } else {
      const height = main.height * COUNT_DIGIT;
      const digit = String(content.main.count);
      segmentText(
        context,
        digit,
        main.x - runWidth(digit, height) / 2,
        main.y - height / 2,
        height,
        look.lit,
        look.ghost
      );
      context.fillStyle = look.lit;
      printText(
        context,
        'TMR',
        main.x - main.width / 2 + 0.07,
        main.y + main.height / 2 - 0.05,
        { size: 0.04, weight: 700, tracking: 0.1, family: SANS }
      );
    }
  }
}

/**
 * The windows for `spec`: their look and their backlight's mask as
 * textures, and a paint for new content.
 */
export function createDisplay(spec: WatchSpec): {
  readonly texture: Texture;
  readonly mask: Texture;
  readonly show: (content: DisplayContent) => void;
} {
  const look = canvas(DISPLAY_TEXTURE_SIZE);
  const glow = canvas(DISPLAY_TEXTURE_SIZE);
  const texture = colorTexture(look.element, 4);
  const mask = colorTexture(glow.element, 4);
  mask.colorSpace = NoColorSpace;
  return {
    texture,
    mask,
    show: content => {
      paintDisplay(look.context, glow.context, spec, content);
      texture.needsUpdate = true;
      mask.needsUpdate = true;
    },
  };
}
