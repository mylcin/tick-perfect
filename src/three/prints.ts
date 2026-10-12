import { NoColorSpace, type Texture } from 'three';

import type { CertificateTier } from '../state/certificates';
import type { BezelSpec, WatchSpec } from '../watches';
import {
  arcText,
  bar,
  canvas,
  colorTexture,
  disc,
  planar,
  printText,
  radialText,
  ring,
  SANS,
  SERIF,
  shade,
  TECHNICAL,
  type TextStyle,
} from './canvas';
import {
  CHAPTER,
  DIGITAL_WINDOWS,
  LAYOUT,
  polar,
  slotFor,
  type SlotLayout,
} from './layout';

// The printing on each watch, painted from its spec: the dial, the chapter
// ring at the dial's edge and the bezel insert. Each dial style lays its
// text out the way its icon does.

const DIAL_TEXTURE_SIZE = 1024;
const CHAPTER_TEXTURE_SIZE = 1024;
const INSERT_TEXTURE_SIZE = 1024;

/** How certificates read on the dial, as on a chronometer's dial text. */
const CERTIFICATE_TEXT: Readonly<Record<CertificateTier, string>> = {
  adjusted: 'ADJUSTED',
  chronometer: 'CHRONOMETER CERTIFIED',
  observatory: 'OBSERVATORY CERTIFIED',
};

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** The two calendar windows under 12 on a perpetual dial. */
const CALENDAR_WINDOWS = {
  y: 0.52,
  x: 0.115,
  width: 0.17,
  height: 0.085,
} as const;

/** The date ring around a perpetual's moon, and its hand's reach. */
export const DATE_RING = { radius: 0.22, numerals: 0.191 } as const;

const WORDMARK: TextStyle = { size: 0.068, weight: 600, tracking: 0.22 };
const SMALL: TextStyle = { size: 0.038, weight: 400, tracking: 0.28 };

/** A minute track of 60 ticks between two radii, five-minute ticks bolder. */
function minuteTrack(
  context: CanvasRenderingContext2D,
  outer: number,
  inner: number,
  fiveInner: number,
  width = 0.0055
) {
  for (let minute = 0; minute < 60; minute++) {
    const five = minute % 5 === 0;
    bar(
      context,
      minute * 6,
      outer,
      five ? fiveInner : inner,
      five ? width * 2 : width
    );
  }
}

/** A railway: two circles with the minute ticks between them. */
function railway(
  context: CanvasRenderingContext2D,
  inner: number,
  outer: number,
  width: number
) {
  ring(context, inner, width);
  ring(context, outer, width);
  for (let minute = 0; minute < 60; minute++) {
    bar(
      context,
      minute * 6,
      inner,
      outer,
      minute % 5 === 0 ? width * 2.4 : width
    );
  }
}

/** Wordmark, AUTOMATIC and the certificate, stacked down from `top`. */
function wordmark(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null,
  top: number,
  {
    automatic = true,
    family = SANS,
  }: { automatic?: boolean; family?: string } = {}
): number {
  context.fillStyle = spec.dial.printColor;
  printText(context, 'TICK PERFECT', 0, top, { ...WORDMARK, family });
  let line = top - 0.085;
  if (automatic) {
    printText(context, 'AUTOMATIC', 0, line, { ...SMALL, family });
    line -= 0.06;
  }
  if (certificate) {
    context.fillStyle = spec.accents.print;
    printText(context, CERTIFICATE_TEXT[certificate], 0, line, {
      size: 0.032,
      weight: 600,
      tracking: 0.22,
      family,
    });
    line -= 0.06;
  }
  return line;
}

/**
 * A chronograph register: a disc in the register colour with a fine scale
 * and numerals, as on a panda dial.
 */
function register(
  context: CanvasRenderingContext2D,
  { x, y, radius }: SlotLayout,
  color: string,
  print: string,
  numerals: readonly (readonly [angle: number, text: string])[],
  ticks: number
) {
  context.save();
  context.translate(x, y);
  context.fillStyle = color;
  disc(context, 0, 0, radius);
  // Concentric rings, as on an azurage (snailed) finish.
  context.strokeStyle = shade(color, -0.06);
  for (let r = radius * 0.15; r < radius; r += 0.011) ring(context, r, 0.0035);
  context.strokeStyle = print;
  for (let tick = 0; tick < ticks; tick++) {
    const major = tick % (ticks / 6) === 0;
    const angle = (tick / ticks) * 360;
    bar(
      context,
      angle,
      radius * 0.97,
      radius * (major ? 0.78 : 0.87),
      major ? 0.006 : 0.0028
    );
  }
  context.fillStyle = print;
  for (const [angle, text] of numerals) {
    const [nx, ny] = polar(angle, radius * 0.58);
    printText(context, text, nx, ny, { size: radius * 0.22, weight: 600 });
  }
  context.restore();
}

/** Today's day and month in two windows under 12. */
function calendarWindows(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  today: Date
) {
  const { x, y, width, height } = CALENDAR_WINDOWS;
  const labels = [DAYS[today.getDay()] ?? '', MONTHS[today.getMonth()] ?? ''];
  labels.forEach((label, index) => {
    const cx = index === 0 ? -x : x;
    context.fillStyle = shade(spec.dial.printColor, -0.2);
    context.fillRect(
      cx - width / 2 - 0.008,
      y - height / 2 - 0.008,
      width + 0.016,
      height + 0.016
    );
    context.fillStyle = spec.accents.dateWheel;
    context.fillRect(cx - width / 2, y - height / 2, width, height);
    context.fillStyle = spec.accents.dateText;
    printText(context, label, cx, y, {
      size: 0.05,
      weight: 600,
      tracking: 0.08,
    });
  });
}

/** The date ring round a perpetual's moon: 1 to 31, today's at the top. */
function dateRing(context: CanvasRenderingContext2D, spec: WatchSpec) {
  const { x, y } = slotFor(spec, 'six');
  context.save();
  context.translate(x, y);
  context.fillStyle = spec.dial.registerColor ?? spec.dial.color;
  disc(context, 0, 0, DATE_RING.radius + 0.02);
  context.strokeStyle = spec.dial.printColor;
  ring(context, DATE_RING.radius + 0.018, 0.003);
  context.fillStyle = spec.dial.printColor;
  for (let date = 1; date <= 31; date++) {
    const angle = ((date - 1) / 31) * 360;
    if (date % 2 === 1) {
      radialText(context, String(date), angle, DATE_RING.numerals, {
        size: 0.026,
        weight: 600,
      });
    } else {
      bar(
        context,
        angle,
        DATE_RING.radius + 0.012,
        DATE_RING.radius - 0.004,
        0.004
      );
    }
  }
  context.restore();
}

/**
 * A chronograph's two registers: the running seconds, a fine scale to 60,
 * and the 30-minute counter.
 */
function chronographRegisters(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  color: string,
  print: string
) {
  const { chronograph, smallSeconds } = spec.complications;
  if (smallSeconds) {
    register(
      context,
      slotFor(spec, smallSeconds.slot),
      color,
      print,
      [
        [0, '60'],
        [120, '20'],
        [240, '40'],
      ],
      60
    );
  }
  if (chronograph) {
    register(
      context,
      slotFor(spec, chronograph.counter),
      color,
      print,
      [
        [0, '30'],
        [120, '10'],
        [240, '20'],
      ],
      30
    );
  }
}

function paintMaxi(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  context.strokeStyle = spec.dial.printColor;
  minuteTrack(context, 0.985, 0.955, 0.94);
  wordmark(context, spec, certificate, 0.47);
  // The model lines sit low, as on a diver: the accent line first.
  context.fillStyle = spec.accents.print;
  printText(context, spec.dial.label, 0, -0.36, {
    size: 0.056,
    weight: 600,
    tracking: 0.16,
  });
  if (spec.dial.sublabel) {
    context.fillStyle = spec.dial.printColor;
    printText(context, spec.dial.sublabel, 0, -0.44, SMALL);
  }
}

function paintPanda(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  context.strokeStyle = spec.dial.printColor;
  minuteTrack(context, 0.985, 0.96, 0.935);
  chronographRegisters(
    context,
    spec,
    spec.dial.registerColor ?? spec.dial.printColor,
    spec.dial.registerPrint ?? spec.dial.color
  );
  wordmark(context, spec, certificate, 0.5, { automatic: false });
  context.fillStyle = spec.dial.printColor;
  printText(context, spec.dial.label, 0, 0.33, {
    size: 0.045,
    weight: 600,
    tracking: 0.2,
  });
  if (spec.dial.sublabel) {
    // Low, just over the date at 6.
    context.fillStyle = spec.accents.print;
    printText(context, spec.dial.sublabel, 0, -0.47, {
      size: 0.042,
      weight: 700,
      tracking: 0.2,
    });
  }
}

function paintDress(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  wordmark(context, spec, certificate, 0.42, { family: SERIF });
  context.fillStyle = spec.accents.print;
  printText(context, spec.dial.label, 0, -0.2, {
    size: 0.032,
    weight: 400,
    tracking: 0.3,
    family: SERIF,
  });
}

function paintPerpetual(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null,
  today: Date
) {
  chronographRegisters(
    context,
    spec,
    spec.dial.registerColor ?? spec.dial.color,
    spec.dial.registerPrint ?? spec.dial.printColor
  );
  dateRing(context, spec);
  calendarWindows(context, spec, today);
  const line = wordmark(context, spec, certificate, 0.36, {
    automatic: false,
    family: SERIF,
  });
  // Under the wordmark (and any certificate), clear of the big registers.
  context.fillStyle = spec.accents.print;
  printText(context, spec.dial.label, 0, line + 0.01, {
    size: 0.028,
    weight: 400,
    tracking: 0.28,
    family: SERIF,
  });
}

/** Where a field dial's numerals sit: the hours, then the 24-hour time. */
const FIELD_NUMERALS = { hours: 0.66, day: 0.5 } as const;

/**
 * A soldier's dial: big numerals, the 24-hour time inside them in the
 * accent colour, the wordmark under 12 and the model lines over 6.
 */
function paintField(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  context.fillStyle = spec.dial.printColor;
  for (let hour = 1; hour <= 12; hour++) {
    // The date takes 3.
    if (hour === 3) continue;
    const [x, y] = polar(hour * 30, FIELD_NUMERALS.hours);
    printText(context, String(hour), x, y, {
      size: 0.15,
      weight: 700,
      family: TECHNICAL,
    });
  }
  context.fillStyle = spec.accents.print;
  for (let hour = 13; hour <= 24; hour++) {
    const [x, y] = polar(hour * 30, FIELD_NUMERALS.day);
    printText(context, String(hour), x, y, {
      size: 0.06,
      weight: 600,
      family: TECHNICAL,
    });
  }
  wordmark(context, spec, certificate, 0.2, { automatic: false });
  context.fillStyle = spec.accents.print;
  printText(context, spec.dial.label, 0, -0.25, {
    size: 0.056,
    weight: 700,
    tracking: 0.2,
    family: TECHNICAL,
  });
  if (spec.dial.sublabel) {
    context.fillStyle = spec.dial.printColor;
    printText(context, spec.dial.sublabel, 0, -0.33, SMALL);
  }
}

/** Where a pilot's numerals and the dots beside its triangle sit. */
const PILOT_NUMERALS = 0.68;
const PILOT_DOTS = { x: 0.15, y: 0.8, radius: 0.026 } as const;

/**
 * An observer's dial, read at a glance in a cockpit: big numerals, two
 * lume dots beside the triangle at 12, the wordmark under it and the model
 * lines over 6.
 */
function paintPilot(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  context.fillStyle = spec.dial.printColor;
  for (let hour = 1; hour <= 11; hour++) {
    // The date takes 3.
    if (hour === 3) continue;
    const [x, y] = polar(hour * 30, PILOT_NUMERALS);
    printText(context, String(hour), x, y, {
      size: 0.17,
      weight: 700,
      family: TECHNICAL,
    });
  }
  context.fillStyle = spec.lume.color;
  for (const side of [-1, 1]) {
    disc(context, side * PILOT_DOTS.x, PILOT_DOTS.y, PILOT_DOTS.radius);
  }
  wordmark(context, spec, certificate, 0.42, {
    automatic: false,
    family: TECHNICAL,
  });
  context.fillStyle = spec.accents.print;
  printText(context, spec.dial.label, 0, -0.3, {
    size: 0.056,
    weight: 700,
    tracking: 0.24,
    family: TECHNICAL,
  });
  if (spec.dial.sublabel) {
    context.fillStyle = spec.dial.printColor;
    printText(context, spec.dial.sublabel, 0, -0.38, {
      ...SMALL,
      family: TECHNICAL,
    });
  }
}

/**
 * An analog-digital dial: the wordmark under 12, a frame round each
 * window, SCORE over the one at 3 and the model lines round the one at 6.
 * What the windows show is drawn live (lcd.ts).
 */
function paintAnadigi(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  const { dial } = spec;
  wordmark(context, spec, certificate, 0.44, {
    automatic: false,
    family: TECHNICAL,
  });
  context.strokeStyle = dial.printColor;
  context.lineWidth = 0.008;
  for (const { x, y, width, height } of Object.values(DIGITAL_WINDOWS)) {
    const frame = 0.022;
    context.strokeRect(
      x - width / 2 - frame,
      y - height / 2 - frame,
      width + frame * 2,
      height + frame * 2
    );
  }
  const { score, main } = DIGITAL_WINDOWS;
  context.fillStyle = dial.printColor;
  printText(context, 'SCORE', score.x, score.y + score.height / 2 + 0.06, {
    size: 0.036,
    weight: 700,
    tracking: 0.2,
    family: TECHNICAL,
  });
  context.fillStyle = spec.accents.print;
  printText(context, dial.label, 0, main.y + main.height / 2 + 0.07, {
    size: 0.05,
    weight: 700,
    tracking: 0.24,
    family: TECHNICAL,
  });
  if (dial.sublabel) {
    context.fillStyle = dial.printColor;
    printText(context, dial.sublabel, 0, main.y - main.height / 2 - 0.07, {
      size: 0.03,
      weight: 600,
      tracking: 0.2,
      family: TECHNICAL,
    });
  }
}

/**
 * The dial's printing on a transparent canvas, repainted when the watch
 * earns a certificate. A skeleton has no dial to print on.
 */
export function createDialPrint(spec: WatchSpec): {
  texture: Texture;
  paint: (certificate: CertificateTier | null) => void;
} {
  const { element, context } = canvas(DIAL_TEXTURE_SIZE);
  const texture = colorTexture(element, 8);
  const paint = (certificate: CertificateTier | null) => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, DIAL_TEXTURE_SIZE, DIAL_TEXTURE_SIZE);
    planar(context, DIAL_TEXTURE_SIZE, LAYOUT.dialRadius);
    switch (spec.dial.style) {
      case 'maxi':
        paintMaxi(context, spec, certificate);
        break;
      case 'panda':
        paintPanda(context, spec, certificate);
        break;
      case 'dress':
        paintDress(context, spec, certificate);
        break;
      case 'perpetual':
        paintPerpetual(context, spec, certificate, new Date());
        break;
      case 'field':
        paintField(context, spec, certificate);
        break;
      case 'pilot':
        paintPilot(context, spec, certificate);
        break;
      case 'anadigi':
        paintAnadigi(context, spec, certificate);
        break;
      case 'skeleton':
        break;
    }
    texture.needsUpdate = true;
  };
  paint(null);
  return { texture, paint };
}

/**
 * The chapter ring that carries the target on watches without an insert:
 * a dress railway, a racing flange or a tachymeter scale. Opaque, laid out
 * planar over the ring's own radius.
 */
export function createChapterPrint(spec: WatchSpec): {
  texture: Texture;
  paint: (certificate: CertificateTier | null) => void;
} {
  const { element, context } = canvas(CHAPTER_TEXTURE_SIZE);
  const texture = colorTexture(element, 8);
  const paint = (certificate: CertificateTier | null) => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    planar(context, CHAPTER_TEXTURE_SIZE, CHAPTER.outer);
    paintChapter(context, spec, certificate);
    texture.needsUpdate = true;
  };
  paint(null);
  return { texture, paint };
}

function paintChapter(
  context: CanvasRenderingContext2D,
  spec: WatchSpec,
  certificate: CertificateTier | null
) {
  const { dial } = spec;
  const extent = CHAPTER.outer;
  switch (dial.style) {
    case 'skeleton': {
      // A dark flange: minute ticks outside, bold numerals every five.
      context.fillStyle = '#0d0e10';
      context.fillRect(-extent, -extent, extent * 2, extent * 2);
      context.strokeStyle = dial.printColor;
      minuteTrack(context, 0.99, 0.965, 0.95, 0.006);
      context.fillStyle = spec.accents.print;
      for (let five = 1; five <= 12; five++) {
        radialText(
          context,
          String(five * 5).padStart(2, '0'),
          five * 30,
          0.905,
          {
            size: 0.05,
            weight: 700,
            family: TECHNICAL,
          }
        );
      }
      context.fillStyle = dial.printColor;
      radialText(context, 'TICK PERFECT', 345, 0.905, {
        size: 0.03,
        weight: 600,
        tracking: 0.15,
        family: TECHNICAL,
      });
      if (certificate) {
        radialText(context, CERTIFICATE_TEXT[certificate], 195, 0.905, {
          size: 0.026,
          weight: 600,
          tracking: 0.15,
          family: TECHNICAL,
        });
      }
      break;
    }
    case 'perpetual': {
      // A tachymeter outside a fine railway, as on a perpetual chronograph.
      context.fillStyle = dial.color;
      context.fillRect(-extent, -extent, extent * 2, extent * 2);
      context.strokeStyle = dial.printColor;
      context.fillStyle = dial.printColor;
      railway(context, 0.88, 0.905, 0.003);
      for (const value of TACHYMETER) {
        const angle = (3600 / value) * 6;
        bar(context, angle, 0.915, 0.94, 0.004);
        if (value % 50 === 0 || value <= 100) {
          radialText(context, String(value), angle, 0.962, {
            size: 0.03,
            weight: 500,
          });
        }
      }
      break;
    }
    default: {
      // A dress railway on the dial's own colour.
      context.fillStyle = dial.color;
      context.fillRect(-extent, -extent, extent * 2, extent * 2);
      context.strokeStyle = dial.printColor;
      railway(context, 0.885, 0.965, 0.0032);
      break;
    }
  }
}

/** Tachymeter values: km/h over one measured kilometre. */
const TACHYMETER = [
  500, 400, 300, 250, 200, 180, 160, 150, 140, 130, 120, 110, 100, 90, 80, 75,
  70, 65, 60,
] as const;

type InsertBezel = Extract<BezelSpec, { readonly insert: unknown }>;

/** A digital's guard: its buttons at 2, 4, 8 and 10 named beside them. */
const GUARD_LABELS = [
  [0, 'SHOCK RESIST'],
  [60, 'LIGHT'],
  [120, 'START'],
  [180, 'PROTECTION'],
  [240, 'MODE'],
  [300, 'ADJUST'],
] as const;

/** The printed bezel insert of a diver, a GMT or a timing chronograph. */
export function insertPrint(bezel: InsertBezel): Texture {
  const { element, context } = canvas(INSERT_TEXTURE_SIZE);
  const { inner, outer } = bezel.insert;
  planar(context, INSERT_TEXTURE_SIZE, outer);
  const middle = (inner + outer) / 2;
  const width = outer - inner;

  if (bezel.type === 'octagon') {
    // Printed on the resin guard itself, on clear: what each button does
    // beside it, and what the guard is for across the top and bottom.
    context.fillStyle = bezel.printColor;
    const label = { size: width * 0.24, weight: 700, family: TECHNICAL };
    for (const [angle, text] of GUARD_LABELS) {
      arcText(context, text, angle, middle, label, 2.5);
    }
    return colorTexture(element, 8);
  }

  if (bezel.type === 'gmt24') {
    // Day below (6 to 18), night above (18 round to 6).
    context.fillStyle = bezel.dayColor;
    context.fillRect(-outer, -outer, outer * 2, outer * 2);
    context.fillStyle = bezel.nightColor;
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, outer + 0.01, Math.PI, 0, true);
    context.closePath();
    context.fill();
  } else {
    context.fillStyle = bezel.insertColor;
    context.fillRect(-outer, -outer, outer * 2, outer * 2);
  }

  context.strokeStyle = bezel.printColor;
  context.fillStyle = bezel.printColor;
  const numeral = (angle: number, text: string, size: number) => {
    radialText(context, text, angle, middle, {
      size,
      weight: 500,
      tracking: 0.02,
    });
  };

  switch (bezel.type) {
    case 'diveTimer':
      // Every minute of the first quarter, then bars and numerals.
      for (let minute = 1; minute < 60; minute++) {
        const angle = minute * 6;
        if (minute % 10 === 0) numeral(angle, String(minute), width * 0.5);
        else if (minute % 5 === 0) {
          bar(
            context,
            angle,
            middle - width * 0.24,
            middle + width * 0.24,
            width * 0.1
          );
        } else if (minute < 15) {
          bar(
            context,
            angle,
            middle - width * 0.08,
            middle + width * 0.24,
            width * 0.035
          );
        }
      }
      break;
    case 'gmt24':
      for (let hour = 1; hour < 24; hour++) {
        const angle = hour * 15;
        if (hour % 2 === 0) numeral(angle, String(hour), width * 0.45);
        else
          bar(
            context,
            angle,
            middle - width * 0.12,
            middle + width * 0.12,
            width * 0.06
          );
      }
      break;
    case 'minutes60':
      // A bold timing scale: numerals every ten, a dot every minute.
      for (let minute = 1; minute < 60; minute++) {
        const angle = minute * 6;
        if (minute % 10 === 0) numeral(angle, String(minute), width * 0.5);
        else if (minute % 5 === 0) {
          bar(
            context,
            angle,
            middle - width * 0.26,
            middle + width * 0.26,
            width * 0.08
          );
        } else {
          const [x, y] = polar(angle, middle + width * 0.18);
          disc(context, x, y, width * 0.028);
        }
      }
      break;
  }

  // The triangle at 12 that every scale counts from.
  context.beginPath();
  context.moveTo(-width * 0.34, outer - width * 0.12);
  context.lineTo(width * 0.34, outer - width * 0.12);
  context.lineTo(0, inner + width * 0.18);
  context.closePath();
  context.fill();
  if (bezel.type === 'diveTimer') {
    // The lume pip sits in the triangle.
    context.fillStyle = shade(bezel.insertColor, 0.15);
    disc(context, 0, outer - width * 0.3, width * 0.12);
  }
  return colorTexture(element, 8);
}

/** Emissive mask for an insert: only the pip in the triangle glows. */
export function insertLumeMask(bezel: InsertBezel): Texture {
  const size = INSERT_TEXTURE_SIZE / 2;
  const { element, context } = canvas(size);
  const { inner, outer } = bezel.insert;
  const width = outer - inner;
  planar(context, size, outer);
  context.fillStyle = '#000';
  context.fillRect(-outer, -outer, outer * 2, outer * 2);
  context.fillStyle = '#fff';
  disc(context, 0, outer - width * 0.3, width * 0.12);
  return colorTexture(element);
}

/** Pixels across one hobnail pyramid's tile. */
const HOBNAIL_TILE_SIZE = 64;

/**
 * A tile of clous de Paris: one four-sided pyramid as a tangent-space
 * normal map, repeated round the hobnail bezel.
 */
export function hobnailNormalMap(): Texture {
  const size = HOBNAIL_TILE_SIZE;
  const { element, context } = canvas(size);
  const image = context.createImageData(size, size);
  const slope = 0.55;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const u = (column + 0.5) / size - 0.5;
      const v = 0.5 - (row + 0.5) / size;
      // Which face of the pyramid this pixel is on.
      let nx = 0;
      let ny = 0;
      if (Math.abs(u) > Math.abs(v)) nx = Math.sign(u) * slope;
      else ny = Math.sign(v) * slope;
      const length = Math.hypot(nx, ny, 1);
      const index = (row * size + column) * 4;
      image.data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = colorTexture(element);
  texture.colorSpace = NoColorSpace;
  return texture;
}
