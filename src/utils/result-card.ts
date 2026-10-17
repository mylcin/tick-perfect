import type { HitQuality } from '../game';
import { APP_URL } from './share';

// A round's result as a picture to share: the watch it was played on, the
// score and what it earned, and the run's trace, on the studio's own
// colours. Drawn in the browser on a canvas; nothing about the player (no
// name, no account) is on it.

/** The card's side, in pixels: square, which every app shows whole. */
export const CARD_SIZE = 1080;

/** What a card shows. */
export interface CardContent {
  /** What was played: "Daily #42 · Chronograph", "Diver". */
  readonly heading: string;
  readonly score: number;
  readonly scoreLabel: string;
  /** The figure beside the score: the best, the day's best, to beat. */
  readonly second: { readonly label: string; readonly value: number } | null;
  /** What the round earned or did, as chips: "New best", "Chronometer". */
  readonly badges: readonly string[];
  readonly qualities: readonly HitQuality[];
  /** The watch's pictures, the first that loads drawn: large, then small. */
  readonly images: readonly string[];
}

/** The studio's colours the card is drawn in. */
export interface CardPalette {
  readonly pool: string;
  readonly edge: string;
  readonly ink: string;
  readonly ink2: string;
  readonly ink3: string;
  readonly ink4: string;
  readonly accent: string;
}

const FONT = "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif";
/** The watch's picture: its strap fades out top and bottom. */
const WATCH = 420;
const MARKS_PER_ROW = 10;
/** Three rows of the trace fit the card; the share text has the rest. */
const CARD_MARKS = 30;
const MARK = 26;
const MARK_GAP = 22;
const TRACE_TOP = 885;
const ROW = MARK + 14;

/** The page's studio colours, read off the root's custom properties. */
export function pagePalette(root: Element): CardPalette {
  const style = getComputedStyle(root);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    pool: read('--studio-pool'),
    edge: read('--studio-edge'),
    ink: read('--ink'),
    ink2: read('--ink-2'),
    ink3: read('--ink-3'),
    ink4: read('--ink-4'),
    accent: read('--accent'),
  };
}

/** `text` with letters spaced `spacing` apart, centred on `x`. */
function spaced(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number
) {
  // Letter by letter, as a reader sees letters (Turkish's dotted İ too).
  const letters = Array.from(
    new Intl.Segmenter().segment(text),
    ({ segment }) => segment
  );
  const widths = letters.map(letter => context.measureText(letter).width);
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    spacing * Math.max(0, letters.length - 1);
  let at = x - total / 2;
  context.textAlign = 'left';
  letters.forEach((letter, index) => {
    context.fillText(letter, at, y);
    at += (widths[index] ?? 0) + spacing;
  });
  context.textAlign = 'center';
}

/** A diamond, filled for a Perfect, outlined for a plain hit. */
function diamond(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  filled: boolean
) {
  const r = MARK / 2;
  context.beginPath();
  context.moveTo(x, y - r);
  context.lineTo(x + r, y);
  context.lineTo(x, y + r);
  context.lineTo(x - r, y);
  context.closePath();
  if (filled) context.fill();
  else context.stroke();
}

/** Draws the card on `context`, `CARD_SIZE` square, `watch` if loaded. */
export function drawCard(
  context: CanvasRenderingContext2D,
  content: CardContent,
  palette: CardPalette,
  watch: CanvasImageSource | null
): void {
  const size = CARD_SIZE;
  const centre = size / 2;

  // The sweep, lit from above the watch.
  const sweep = context.createRadialGradient(
    centre,
    size * 0.32,
    0,
    centre,
    size * 0.32,
    size * 0.85
  );
  sweep.addColorStop(0, palette.pool);
  sweep.addColorStop(1, palette.edge);
  context.fillStyle = sweep;
  context.fillRect(0, 0, size, size);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';

  context.fillStyle = palette.ink;
  context.font = `500 30px ${FONT}`;
  spaced(context, 'TICK PERFECT', centre, 92, 14);
  context.fillStyle = palette.ink3;
  context.font = `400 30px ${FONT}`;
  context.fillText(content.heading, centre, 140);

  if (watch) context.drawImage(watch, centre - WATCH / 2, 165, WATCH, WATCH);

  // The score, and the figure beside it, their labels on one line.
  const labelY = 640;
  const valueY = 770;
  const scoreX = content.second ? centre - 150 : centre;
  context.fillStyle = palette.ink3;
  context.font = `500 22px ${FONT}`;
  spaced(context, content.scoreLabel.toUpperCase(), scoreX, labelY, 8);
  context.fillStyle = palette.ink;
  context.font = `300 150px ${FONT}`;
  context.fillText(String(content.score), scoreX, valueY);
  if (content.second) {
    const x = centre + 170;
    context.fillStyle = palette.ink3;
    context.font = `500 22px ${FONT}`;
    spaced(context, content.second.label.toUpperCase(), x, labelY, 8);
    context.fillStyle = palette.ink2;
    context.font = `300 84px ${FONT}`;
    context.fillText(String(content.second.value), x, valueY);
  }

  // What it earned.
  if (content.badges.length > 0) {
    context.font = `600 24px ${FONT}`;
    const text = content.badges.join('  ·  ').toUpperCase();
    context.fillStyle = palette.accent;
    spaced(context, text, centre, 830, 4);
  }

  // The run's trace: a diamond a hit, ten to a row, the rest counted.
  const shown = content.qualities.slice(0, CARD_MARKS);
  const pitch = MARK + MARK_GAP;
  context.fillStyle = palette.accent;
  context.strokeStyle = palette.ink4;
  context.lineWidth = 3;
  shown.forEach((quality, index) => {
    const row = Math.floor(index / MARKS_PER_ROW);
    const inRow = Math.min(MARKS_PER_ROW, shown.length - row * MARKS_PER_ROW);
    const column = index % MARKS_PER_ROW;
    const x = centre + (column - (inRow - 1) / 2) * pitch;
    diamond(context, x, TRACE_TOP + row * ROW, quality === 'perfect');
  });
  const rest = content.qualities.length - shown.length;
  if (rest > 0) {
    context.fillStyle = palette.ink3;
    context.font = `500 24px ${FONT}`;
    context.fillText(
      `+${String(rest)}`,
      centre,
      TRACE_TOP + (shown.length / MARKS_PER_ROW) * ROW + 4
    );
  }

  context.fillStyle = palette.ink4;
  context.font = `400 26px ${FONT}`;
  context.fillText(new URL(APP_URL).host, centre, size - 36);
}

/** The first of `urls` that loads, its strap faded out; null if none. */
async function loadWatch(
  urls: readonly string[]
): Promise<HTMLCanvasElement | null> {
  for (const url of urls) {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      continue;
    }
    const canvas = document.createElement('canvas');
    canvas.width = WATCH;
    canvas.height = WATCH;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, WATCH, WATCH);
    // The picture is square; the strap runs on past it, so it fades.
    const fade = context.createLinearGradient(0, 0, 0, WATCH);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.16, 'rgba(0,0,0,1)');
    fade.addColorStop(0.84, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = fade;
    context.fillRect(0, 0, WATCH, WATCH);
    return canvas;
  }
  return null;
}

/** The card as a PNG, in the page's studio colours. */
export async function cardBlob(content: CardContent): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas here');
  drawCard(
    context,
    content,
    pagePalette(document.documentElement),
    await loadWatch(content.images)
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The card could not be drawn'));
    }, 'image/png');
  });
}

export type CardOutcome = 'shared' | 'saved' | 'cancelled' | 'failed';

/**
 * Hands the card to the system share sheet, with the text, where files can
 * be shared; saves it as a file everywhere else.
 */
export async function shareCard(
  blob: Blob,
  name: string,
  text: string,
  browser: Partial<Pick<Navigator, 'share' | 'canShare'>> = navigator
): Promise<CardOutcome> {
  const file = new File([blob], name, { type: 'image/png' });
  if (browser.canShare?.({ files: [file] }) && browser.share) {
    try {
      await browser.share({ files: [file], text });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
      // Sharing is blocked here; save it instead.
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
    return 'saved';
  } catch {
    return 'failed';
  }
}
