import { Box3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import type {
  HourHandStyle,
  MinuteHandStyle,
  SecondsHandStyle,
} from '../../watches';
import {
  gmtHandGeometry,
  hourHandGeometry,
  minuteHandGeometry,
  secondsHandGeometry,
  type HandGeometry,
} from './hands';

const HOUR = 0.56;
const MINUTE = 0.86;
const SECONDS = 1.02;
const GMT = 0.95;
/** Bevels round the outline out a little past its points. */
const BEVEL_SLACK = 0.008;
/** Above this the collar and counterweights are behind us: the blade. */
const BLADE_FROM = 0.12;
/** Plenty for a hand; the whole watch has to fit a phone. */
const MAX_TRIANGLES = 3000;

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

const triangles = (geometry: BufferGeometry) =>
  (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;

/** Half the width of `geometry` over the stretch `from` ≤ y ≤ `to`. */
function halfWidth(geometry: BufferGeometry, from: number, to = Infinity) {
  const position = geometry.getAttribute('position');
  let widest = 0;
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index);
    if (y >= from && y <= to) {
      widest = Math.max(widest, Math.abs(position.getX(index)));
    }
  }
  return widest;
}

/** Whether `geometry`, seen from the front, covers the point (x, y). */
function covers(geometry: BufferGeometry, x: number, y: number): boolean {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const corner = (at: number) => {
    const vertex = index ? index.getX(at) : at;
    return [position.getX(vertex), position.getY(vertex)] as const;
  };
  const side = (
    [ax, ay]: readonly [number, number],
    [bx, by]: readonly [number, number]
  ) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  for (let at = 0; at < count; at += 3) {
    const a = corner(at);
    const b = corner(at + 1);
    const c = corner(at + 2);
    // Walls are edge-on from the front.
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-10) continue;
    const sides = [side(a, b), side(b, c), side(c, a)];
    if (sides.every(value => value >= 0) || sides.every(value => value <= 0)) {
      return true;
    }
  }
  return false;
}

function expectFinite(geometry: BufferGeometry) {
  for (const name of ['position', 'normal']) {
    const values = Array.from(geometry.getAttribute(name).array);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(Number.isFinite)).toBe(true);
  }
}

function partsOf(hand: HandGeometry): BufferGeometry[] {
  return [hand.metal, hand.lume, hand.tip].filter(
    (part): part is BufferGeometry => part !== null
  );
}

/** Lume stands proud of the metal and stays within its footprint. */
function expectLumeOnMetal(lume: BufferGeometry, metal: BufferGeometry) {
  const lumeBox = box(lume);
  const metalBox = box(metal);
  expect(lumeBox.max.z).toBeGreaterThan(metalBox.max.z);
  expect(lumeBox.min.x).toBeGreaterThanOrEqual(metalBox.min.x);
  expect(lumeBox.max.x).toBeLessThanOrEqual(metalBox.max.x);
  expect(lumeBox.min.y).toBeGreaterThanOrEqual(metalBox.min.y);
  expect(lumeBox.max.y).toBeLessThanOrEqual(metalBox.max.y);
}

interface Expected {
  readonly tail: number;
  /** Most the blade may measure across. */
  readonly width: number;
}

const HOURS: Readonly<Record<HourHandStyle, Expected>> = {
  mercedes: { tail: 0.1, width: 0.16 },
  sword: { tail: 0.09, width: 0.078 },
  baton: { tail: 0.09, width: 0.06 },
  dauphine: { tail: 0.06, width: 0.1 },
  leaf: { tail: 0.06, width: 0.09 },
  skeleton: { tail: 0.09, width: 0.1 },
};

const MINUTES: Readonly<Record<MinuteHandStyle, Expected>> = {
  sword: { tail: 0.11, width: 0.062 },
  baton: { tail: 0.12, width: 0.044 },
  dauphine: { tail: 0.07, width: 0.075 },
  leaf: { tail: 0.07, width: 0.07 },
  skeleton: { tail: 0.12, width: 0.08 },
};

const SECONDS_HANDS: Readonly<Record<SecondsHandStyle, Expected>> = {
  lollipop: { tail: 0.22, width: 0.1 },
  arrow: { tail: 0.2, width: 0.056 },
  needle: { tail: 0.26, width: 0.012 },
  skeleton: { tail: 0.215, width: 0.03 },
};

function expectShape(
  hand: HandGeometry,
  length: number,
  { tail, width }: Expected
) {
  const parts = partsOf(hand);
  parts.forEach(expectFinite);
  const whole = parts.map(box).reduce((all, next) => all.union(next));
  expect(whole.max.y).toBeGreaterThanOrEqual(length - 1e-6);
  expect(whole.max.y).toBeLessThan(length + BEVEL_SLACK);
  expect(whole.min.y).toBeLessThanOrEqual(-tail + 1e-6);
  expect(whole.min.y).toBeGreaterThan(-tail - BEVEL_SLACK);
  expect(halfWidth(hand.metal, BLADE_FROM) * 2).toBeLessThanOrEqual(width);
  // Each part is one draw call, from the dial plane towards the viewer.
  for (const part of parts) {
    expect(part.groups).toHaveLength(0);
    expect(box(part).min.z).toBeGreaterThanOrEqual(-1e-6);
  }
  const total = parts.reduce((sum, part) => sum + triangles(part), 0);
  expect(total).toBeLessThan(MAX_TRIANGLES);
}

describe.each(Object.entries(HOURS) as [HourHandStyle, Expected][])(
  'the %s hour hand',
  (style, expected) => {
    const hand = hourHandGeometry(style, HOUR, true);

    it('points up from a short tail and stays within its width', () => {
      expectShape(hand, HOUR, expected);
    });

    it('carries lume above its metal, or none when asked', () => {
      expect(hand.lume).not.toBeNull();
      if (hand.lume) expectLumeOnMetal(hand.lume, hand.metal);
      expect(hand.tip).toBeNull();
      expect(hourHandGeometry(style, HOUR, false).lume).toBeNull();
    });
  }
);

describe.each(Object.entries(MINUTES) as [MinuteHandStyle, Expected][])(
  'the %s minute hand',
  (style, expected) => {
    const hand = minuteHandGeometry(style, MINUTE, true);

    it('points up from a short tail and stays within its width', () => {
      expectShape(hand, MINUTE, expected);
    });

    it('carries lume above its metal, or none when asked', () => {
      expect(hand.lume).not.toBeNull();
      if (hand.lume) expectLumeOnMetal(hand.lume, hand.metal);
      expect(hand.tip).toBeNull();
      expect(minuteHandGeometry(style, MINUTE, false).lume).toBeNull();
    });

    it('scales to a shorter length inside a chapter ring', () => {
      const short = minuteHandGeometry(style, 0.8, true);
      expect(box(short.metal).max.y).toBeLessThan(0.8 + BEVEL_SLACK);
    });
  }
);

describe('hour and minute hands of a style', () => {
  it.each(['baton', 'dauphine', 'leaf', 'skeleton'] as const)(
    'make a %s hour hand broader than its minute hand',
    style => {
      const hour = hourHandGeometry(style, HOUR, false).metal;
      const minute = minuteHandGeometry(style, MINUTE, false).metal;
      expect(halfWidth(hour, BLADE_FROM)).toBeGreaterThan(
        halfWidth(minute, BLADE_FROM) + 0.005
      );
    }
  );

  it('give each minute style its own silhouette', () => {
    const signature = (style: MinuteHandStyle) => {
      const { metal, lume } = minuteHandGeometry(style, MINUTE, true);
      return [0.15, 0.3, 0.45, 0.6, 0.72, 0.8]
        .flatMap(y =>
          [0, 0.012, 0.022, 0.03].map(
            x =>
              `${covers(metal, x, y * MINUTE) ? 'm' : '-'}${
                lume && covers(lume, x, y * MINUTE) ? 'l' : '-'
              }`
          )
        )
        .join('');
    };
    const signatures = Object.keys(MINUTES).map(style =>
      signature(style as MinuteHandStyle)
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe('the mercedes hour hand', () => {
  const { metal, lume } = hourHandGeometry('mercedes', HOUR, true);
  // The frame is centred 74% of the way out, its opening 0.056 across.
  const frameY = HOUR * 0.74;

  it('has a round frame far broader than its stem', () => {
    const { min, max } = box(metal);
    expect(max.x - min.x).toBeGreaterThanOrEqual(0.13);
    expect(halfWidth(metal, 0.1, 0.3) * 2).toBeLessThan(0.06);
    expect(halfWidth(metal, frameY - 0.01, frameY + 0.01)).toBeGreaterThan(
      0.07
    );
  });

  it('draws a three-pointed star with lume between its spokes', () => {
    // The spokes: one towards the tip and two 120° either side.
    for (const angle of [90, 210, 330]) {
      const radians = (angle * Math.PI) / 180;
      const x = Math.cos(radians) * 0.035;
      const y = frameY + Math.sin(radians) * 0.035;
      expect(covers(metal, x, y)).toBe(true);
    }
    // The sectors between them are open, and lume fills them.
    for (const angle of [30, 150, 270]) {
      const radians = (angle * Math.PI) / 180;
      const x = Math.cos(radians) * 0.035;
      const y = frameY + Math.sin(radians) * 0.035;
      expect(covers(metal, x, y)).toBe(false);
      expect(lume && covers(lume, x, y)).toBe(true);
    }
  });

  it('runs a lume inlay down the stem', () => {
    expect(lume && covers(lume, 0, 0.2)).toBe(true);
    expect(lume && covers(lume, 0, 0.03)).toBe(false);
  });
});

describe('the dauphine hands', () => {
  it.each([
    ['hour', hourHandGeometry('dauphine', HOUR, false).metal],
    ['minute', minuteHandGeometry('dauphine', 0.8, false).metal],
  ] as const)('slope the %s hand in two facets from a ridge', (_, metal) => {
    const position = metal.getAttribute('position');
    const normal = metal.getAttribute('normal');
    let left = 0;
    let right = 0;
    let lowest = Infinity;
    for (let index = 0; index < position.count; index++) {
      // Upward faces of the blade, beyond the flat collar.
      if (normal.getZ(index) < 0.5 || position.getY(index) < 0.06) continue;
      if (normal.getX(index) > 0.05) right++;
      if (normal.getX(index) < -0.05) left++;
      lowest = Math.min(lowest, position.getZ(index));
    }
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    // The top is not flat: the edges sit well below the ridge.
    expect(box(metal).max.z - lowest).toBeGreaterThan(0.008);
  });

  it('is widest about a fifth of the way out', () => {
    const { metal } = minuteHandGeometry('dauphine', 0.8, false);
    const at = (y: number) => halfWidth(metal, y - 0.005, y + 0.005);
    expect(at(0.8 * 0.22)).toBeGreaterThan(at(0.8 * 0.5));
    expect(at(0.8 * 0.22)).toBeGreaterThan(at(0.06));
  });
});

describe('the skeleton hands', () => {
  it('leave the middle open and fill the outer part with lume', () => {
    const { metal, lume } = minuteHandGeometry('skeleton', 0.8, true);
    expect(covers(metal, 0, 0.8 * 0.45)).toBe(false);
    expect(lume && covers(lume, 0, 0.8 * 0.45)).toBe(false);
    expect(covers(metal, 0, 0.8 * 0.76)).toBe(false);
    expect(lume && covers(lume, 0, 0.8 * 0.76)).toBe(true);
    expect(box(lume ?? metal).min.y).toBeGreaterThanOrEqual(0.8 * 0.7 - 1e-6);
  });
});

describe.each(Object.entries(SECONDS_HANDS) as [SecondsHandStyle, Expected][])(
  'the %s seconds hand',
  (style, expected) => {
    const hand = secondsHandGeometry(style, SECONDS);

    it('reaches from its tail to the length asked', () => {
      expectShape(hand, SECONDS, expected);
      expectShape(secondsHandGeometry(style, 0.95), 0.95, expected);
    });

    it('stacks any lume above the metal', () => {
      if (hand.lume) {
        expect(box(hand.lume).max.z).toBeGreaterThan(box(hand.metal).max.z);
      }
    });
  }
);

describe('the seconds hand styles', () => {
  it('put a lume disc on the lollipop, 70% of the way out', () => {
    const { metal, lume } = secondsHandGeometry('lollipop', SECONDS);
    const disc = box(lume ?? metal);
    expect((disc.min.y + disc.max.y) / 2).toBeCloseTo(SECONDS * 0.7, 3);
    expect(disc.max.x - disc.min.x).toBeCloseTo(0.064, 3);
    expect(halfWidth(metal, 0.2, 0.5) * 2).toBeLessThan(0.02);
    expect(covers(metal, 0, -0.165)).toBe(true);
  });

  it('paint the chronograph hand’s arrowhead as its tip', () => {
    const { metal, lume, tip } = secondsHandGeometry('arrow', SECONDS);
    expect(tip).not.toBeNull();
    if (!tip || !lume) return;
    const head = box(tip);
    expect(head.min.y).toBeGreaterThan(SECONDS - 0.1);
    expect(head.max.x - head.min.x).toBeGreaterThan(0.045);
    expect(halfWidth(metal, BLADE_FROM, SECONDS - 0.1) * 2).toBeLessThan(0.016);
    // Above the needle, so the two never fight for the same pixels.
    expect(head.max.z).toBeGreaterThan(box(metal).max.z);
    // A lume pip in the arrowhead, on top of it.
    const pip = box(lume);
    expect(pip.min.y).toBeGreaterThan(head.min.y);
    expect(pip.max.y).toBeLessThan(head.max.y);
    expect(pip.max.z).toBeGreaterThan(head.max.z);
  });

  it('end the needle’s tail in an open ring, with no lume', () => {
    const { metal, lume, tip } = secondsHandGeometry('needle', SECONDS);
    expect(lume).toBeNull();
    expect(tip).toBeNull();
    expect(covers(metal, 0, -0.23)).toBe(false);
    expect(covers(metal, 0.022, -0.23)).toBe(true);
    // Tapering to a fine point.
    expect(covers(metal, 0.003, 0.2)).toBe(true);
    expect(covers(metal, 0.003, SECONDS - 0.05)).toBe(false);
  });

  it('open the skeleton hand, its tip solid with lume', () => {
    const { metal, lume } = secondsHandGeometry('skeleton', SECONDS);
    expect(covers(metal, 0, SECONDS * 0.5)).toBe(false);
    expect(lume && covers(lume, 0, SECONDS - 0.06)).toBe(true);
    expect(box(lume ?? metal).min.y).toBeGreaterThanOrEqual(
      SECONDS - 0.12 - 1e-6
    );
    // A hollow lozenge for a counterweight.
    expect(covers(metal, 0, -0.17)).toBe(false);
    expect(covers(metal, 0.028, -0.17)).toBe(true);
  });
});

describe.each(['arrow', 'hollow'] as const)('the %s GMT hand', style => {
  const { hand, outline, lume } = gmtHandGeometry(style, GMT);

  it('points up to the length asked', () => {
    [hand, outline, ...(lume ? [lume] : [])].forEach(expectFinite);
    const { min, max } = box(hand);
    expect(max.y).toBeGreaterThanOrEqual(GMT - 1e-6);
    expect(max.y).toBeLessThan(GMT + BEVEL_SLACK);
    expect(min.y).toBeLessThan(-0.07);
    expect(hand.groups).toHaveLength(0);
    expect(outline.groups).toHaveLength(0);
  });

  it('sits on a larger, thinner dark edge behind it', () => {
    const front = box(hand);
    const edge = box(outline);
    // A fine travel-time hand has a finer edge.
    const margin = style === 'arrow' ? 0.008 : 0.004;
    expect(edge.max.y).toBeGreaterThan(front.max.y + margin);
    expect(edge.min.y).toBeLessThan(front.min.y - margin);
    expect(edge.max.x).toBeGreaterThan(front.max.x + margin);
    expect(edge.min.z).toBeLessThan(front.min.z);
    expect(edge.max.z).toBeLessThan(front.max.z);
    expect(edge.max.z - edge.min.z).toBeLessThan(front.max.z - front.min.z);
  });
});

describe('the GMT hand styles', () => {
  it('give the arrow a big lume-filled triangle at its tip', () => {
    const { hand, lume } = gmtHandGeometry('arrow', GMT);
    expect(halfWidth(hand, GMT - 0.09) * 2).toBeGreaterThanOrEqual(0.085);
    expect(halfWidth(hand, BLADE_FROM, GMT - 0.1) * 2).toBeLessThan(0.02);
    expect(lume).not.toBeNull();
    if (!lume) return;
    expect(box(lume).min.y).toBeGreaterThan(GMT - 0.08);
    expect(box(lume).max.z).toBeGreaterThan(box(hand).max.z);
    expect(covers(lume, 0, GMT - 0.05)).toBe(true);
  });

  it('give the travel-time hand a small open arrowhead on a fine stem', () => {
    const { hand, outline, lume } = gmtHandGeometry('hollow', GMT);
    expect(lume).toBeNull();
    // A fine stem most of the way out…
    expect(halfWidth(hand, BLADE_FROM, GMT - 0.08) * 2).toBeLessThan(0.01);
    // …then a head about as wide as the part of the target it covers.
    const widest = halfWidth(hand, GMT - 0.08, GMT) * 2;
    expect(widest).toBeGreaterThan(0.05);
    expect(widest).toBeLessThan(0.065);
    // Open in the middle, edge and all.
    const middle = GMT - 0.035;
    expect(covers(hand, 0, middle)).toBe(false);
    expect(covers(outline, 0, middle)).toBe(false);
    expect(covers(hand, 0.025, GMT - 0.073)).toBe(true);
  });
});
