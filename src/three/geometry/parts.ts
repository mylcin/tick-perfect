import {
  CircleGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { DialSlot, WatchSpec } from '../../watches';
import {
  DIAL_SLOTS,
  handLengths,
  LAYOUT,
  slotFor,
  trackFor,
  type TrackLayout,
} from '../layout';
import { braceletGeometry, braceletLinks, endLinkReach } from './bracelet';
import { arcBand, extrude, lathe } from './build';
import {
  caseGeometry,
  casebackGeometry,
  crownAxisZ,
  crownGeometry,
  crownGuardGeometry,
  pusherGeometry,
} from './cases';
import {
  chapterRing,
  cyclopsDate,
  cyclopsLens,
  markerKinds,
  registerHand,
  registerHub,
} from './dial-parts';
import {
  gmtHandGeometry,
  hourHandGeometry,
  minuteHandGeometry,
  secondsHandGeometry,
} from './hands';
import { DATE_RING } from '../prints';
import { bezelGeometry } from './bezels';
import { movementGeometry } from './movement';
import {
  bridgeOutline,
  chevron,
  circle,
  rectangle,
  type Point,
} from './outlines';
import {
  apertureFrameProfile,
  rehautProfile,
  subdialRimProfile,
} from './profiles';

export const DATE_WINDOW = { width: 0.17, height: 0.13, frame: 0.018 };
/** Chronograph pushers sit at 2 and 4 o'clock, a digital's buttons at 8 and 10 as well. */
export function pusherAngles(
  pushers: WatchSpec['case']['pushers']
): readonly number[] {
  return pushers === 'buttons' ? [60, 120, 240, 300] : [60, 120];
}

/** How far a strap or bracelet runs from the spring bar, off screen. */
const STRAP_RUN = 4.3;
/** A perpetual's moon shares its sub-dial with the date ring round it. */
const PERPETUAL_MOON = 0.135;

/** Every sub-dial or aperture a dial has, by what fills it. */
function dialSlots(spec: WatchSpec) {
  const { chronograph, smallSeconds, moon, tourbillon } = spec.complications;
  const registers: DialSlot[] = [
    ...(smallSeconds ? [smallSeconds.slot] : []),
    ...(chronograph ? [chronograph.counter] : []),
  ];
  return {
    registers,
    rims: [
      ...registers,
      ...(moon ? [moon.slot] : []),
      ...(tourbillon && spec.dial.style !== 'skeleton'
        ? [tourbillon.slot]
        : []),
    ],
  };
}

function slotRims(
  spec: WatchSpec,
  slots: readonly DialSlot[],
  radiusOf: (slot: DialSlot) => number
): BufferGeometry | null {
  if (slots.length === 0) return null;
  return mergeGeometries(
    slots.map(slot => {
      const { x, y } = slotFor(spec, slot);
      return lathe(subdialRimProfile(radiusOf(slot)), 64).translate(x, y, 0);
    })
  );
}

/** A small round aperture's polished frame, round a disc under it. */
function aperture(radius: number) {
  return {
    disc: new CircleGeometry(radius, 48),
    frame: lathe(apertureFrameProfile(radius), 64),
  };
}

/**
 * The date window's frame and wheel: a framed rectangle, or round; none
 * where a digital's display shows the score.
 */
function dateWindow(spec: WatchSpec) {
  if (spec.date.at === 'display') return null;
  if (spec.date.at === 'fourThirty') {
    const { disc, frame } = aperture(slotFor(spec, 'fourThirty').radius);
    return { wheel: disc, frame };
  }
  return {
    wheel: new PlaneGeometry(DATE_WINDOW.width, DATE_WINDOW.height),
    frame: extrude(
      rectangle(
        DATE_WINDOW.width + DATE_WINDOW.frame * 2,
        DATE_WINDOW.height + DATE_WINDOW.frame * 2
      ),
      {
        depth: 0.016,
        bevel: 0.004,
        holes: [rectangle(DATE_WINDOW.width, DATE_WINDOW.height)],
      }
    ),
  };
}

function tourbillonCage(radius: number) {
  const bridge = extrude(bridgeOutline(radius * 0.92, 3, 3), {
    depth: 0.008,
    bevel: 0.002,
    holes: [circle(radius * 0.18, 32)],
  });
  bridge.translate(0, 0, 0.012);
  const balance = mergeGeometries([
    // Extrusions carry no index; the ring must match to merge with them.
    extrude(circle(radius * 0.58, 48), {
      depth: 0.002,
      holes: [circle(radius * 0.5, 48)],
    }),
    ...[0, 1, 2].map(spoke =>
      extrude(rectangle(0.01, radius * 1.04), { depth: 0.002 }).rotateZ(
        (spoke * Math.PI) / 3
      )
    ),
  ]).translate(0, 0, 0.006);
  return { bridge, balance };
}

/** A shallow sapphire dome sitting on the crystal rim. */
function crystalDome(): BufferGeometry {
  const radius = 14;
  const angle = Math.asin(LAYOUT.crystalRadius / radius);
  const dome = new SphereGeometry(radius, 96, 6, 0, Math.PI * 2, 0, angle);
  dome.rotateX(Math.PI / 2);
  dome.translate(0, 0, LAYOUT.crystalHeight - radius * Math.cos(angle));
  return dome;
}

function strapGeometry(spec: WatchSpec, anchor: TrackAnchor) {
  const { strap } = spec;
  if (strap.type !== 'oyster' && strap.type !== 'jubilee') return null;
  const caseRadius = spec.case.radius;
  return {
    // The end link closes the lug gap flush against the case.
    geometry: braceletGeometry(strap.type, {
      width: anchor.width,
      caseRadius,
      reach: endLinkReach(anchor.y, caseRadius),
    }),
    links: braceletLinks(strap.type, {
      width: anchor.width,
      startY: anchor.y,
      startZ: anchor.z,
      length: STRAP_RUN,
    }),
  };
}

/** Where a chronograph pair's ▶ and ■ sit. */
function pairMarkRadius(track: TrackLayout): number {
  return track.marksOnBand
    ? (track.inner + track.outer) / 2
    : track.outer + 0.045;
}

/**
 * A GMT gate's line, in scene units: its bar, the dark edge round it and
 * the flag at its inner end (how far along the line, and how far out).
 */
const GATE_LINE = { width: 0.018, edge: 0.007, flag: 0.044, point: 0.036 };

/**
 * The line where a GMT gate's covered part meets the open one: a light bar
 * across the band and as far past it as the brackets reach, with a small
 * flag at its inner end, beside the seconds hand's tip and clear of the
 * insert's numerals, pointing into the open part (mirror it to point the
 * other way). It is centred on the origin, so it swells about its middle;
 * `radius` is where it goes. The edge is the same outline grown, drawn dark
 * behind the bar, so the line stays crisp on the colour and on the shade.
 */
function gateLine(track: TrackLayout) {
  const inner = track.inner - track.reach.in;
  const outer = track.outer + track.reach.out;
  const half = (outer - inner) / 2;
  const outline = (grow: number): Point[] => {
    const side = GATE_LINE.width / 2 + grow;
    const end = half + grow;
    return [
      [-side, -end],
      [side, -end],
      // The flag's point needs more room than its sides to grow as much.
      [
        GATE_LINE.width / 2 + GATE_LINE.point + grow * 2,
        -half + GATE_LINE.flag / 2,
      ],
      [side, -half + GATE_LINE.flag + grow],
      [side, end],
      [-side, end],
    ];
  };
  return {
    radius: (inner + outer) / 2,
    bar: extrude(outline(0), { depth: 0.003 }).translate(0, 0, 0.001),
    edge: extrude(outline(GATE_LINE.edge), { depth: 0.003 }),
  };
}

interface TrackAnchor {
  readonly y: number;
  readonly z: number;
  readonly width: number;
}

/** Every piece of one watch's geometry, built from its spec. */
export function createWatchGeometry(spec: WatchSpec) {
  const track: TrackLayout = trackFor(spec);
  const lengths = handLengths(spec);
  const { chronograph, smallSeconds, gmt, moon, tourbillon } =
    spec.complications;
  const skeleton = spec.dial.style === 'skeleton';
  const caseParts = caseGeometry(spec.case, spec.bezel.outer);
  const slots = dialSlots(spec);
  const date = dateWindow(spec);

  return {
    case: caseParts,
    caseback: casebackGeometry(spec.case),
    crown: spec.case.crown === 'none' ? null : crownGeometry(spec.case.crown),
    crownZ: crownAxisZ(spec.case),
    crownGuard: spec.case.crownGuards
      ? crownGuardGeometry(spec.case.radius, crownAxisZ(spec.case))
      : null,
    pusher:
      spec.case.pushers === 'none' ? null : pusherGeometry(spec.case.pushers),
    bezel: bezelGeometry(spec.bezel, spec.case),
    strap: strapGeometry(spec, caseParts.strap),
    // A skeleton shows its movement where the dial would be.
    dial: skeleton ? null : new CircleGeometry(LAYOUT.dialRadius, 128),
    chapter: spec.targetTrack === 'chapter' || skeleton ? chapterRing() : null,
    movement: skeleton
      ? movementGeometry([
          { x: DIAL_SLOTS.six.x, y: DIAL_SLOTS.six.y, radius: 0.23 },
          { x: 0.7, y: 0, radius: 0.15 },
          { x: 0, y: 0, radius: 0.07 },
        ])
      : null,
    rehaut: lathe(rehautProfile()),
    dateFrame: date?.frame ?? null,
    dateWheel: date?.wheel ?? null,
    // Drawn over the whole dial, clear but for its windows.
    display:
      spec.dial.style === 'anadigi'
        ? new CircleGeometry(LAYOUT.dialRadius, 96)
        : null,
    cyclops: spec.date.cyclops
      ? { lens: cyclopsLens(), date: cyclopsDate() }
      : null,
    hourHand: hourHandGeometry(spec.hands.hour, lengths.hour, spec.hands.lume),
    minuteHand: minuteHandGeometry(
      spec.hands.minute,
      lengths.minute,
      spec.hands.lume
    ),
    secondsHand: secondsHandGeometry(spec.hands.seconds, lengths.seconds),
    gmtHand: gmt ? gmtHandGeometry(gmt.style, lengths.gmt) : null,
    hub: new CylinderGeometry(0.048, 0.048, 0.03, 40).rotateX(Math.PI / 2),
    hubCap: new CylinderGeometry(0.028, 0.028, 0.012, 32).rotateX(Math.PI / 2),
    crystal: crystalDome(),
    // Points in at the target's edges, so its extent reads without colour.
    targetBracket: extrude(
      [
        [-0.03, track.inner + 0.02],
        [0.03, track.inner + 0.02],
        [0, track.inner - track.reach.in],
      ],
      { depth: 0.012 }
    ),
    // ▶ on a chronograph start mark, pointing the way the hand travels, and
    // ■ on its stop mark: beyond the band, or on it where there's no room.
    startChevron: extrude(
      track.marksOnBand ? chevron(0.05, 0.045) : chevron(0.07, 0.06),
      { depth: 0.01 }
    ).translate(0, pairMarkRadius(track), track.marksOnBand ? 0.004 : 0),
    stopBlock: extrude(
      rectangle(
        track.marksOnBand ? 0.038 : 0.05,
        track.marksOnBand ? 0.038 : 0.05,
        [0, pairMarkRadius(track)]
      ),
      { depth: 0.01 }
    ).translate(0, 0, track.marksOnBand ? 0.004 : 0),
    gateLine: gateLine(track),
    markers: markerKinds(spec.dial.style),
    registers: slots.registers,
    slotRims: slotRims(spec, slots.rims, slot =>
      // A perpetual's moon wears its date ring inside the rim.
      spec.dial.style === 'perpetual' && slot === moon?.slot
        ? DATE_RING.radius + 0.028
        : slotFor(spec, slot).radius
    ),
    registerHand: registerHand(
      slotFor(spec, chronograph?.counter ?? 'nine').radius * 0.82
    ),
    registerHub: registerHub(),
    smallSecondsHand: smallSeconds
      ? registerHand(slotFor(spec, smallSeconds.slot).radius * 0.86)
      : null,
    dateHand:
      spec.dial.style === 'perpetual'
        ? registerHand(DATE_RING.numerals + 0.012)
        : null,
    moonDisc: moon
      ? new CircleGeometry(
          spec.dial.style === 'perpetual'
            ? PERPETUAL_MOON
            : slotFor(spec, moon.slot).radius * 0.9,
          48
        )
      : null,
    cage: tourbillon
      ? tourbillonCage(slotFor(spec, tourbillon.slot).radius)
      : null,
  };
}

export type WatchGeometry = ReturnType<typeof createWatchGeometry>;

/**
 * The target band for a given width on its track; rebuilt only when the
 * width changes.
 */
export function createTargetGeometry(
  width: number,
  perfectWindow: number,
  track: TrackLayout
) {
  const { inner, outer, reach } = track;
  return {
    band: arcBand(inner, outer, width),
    // The Perfect zone stands proud of the band on both edges, so it reads
    // by shape as well as by colour.
    core: arcBand(inner - reach.in, outer + reach.out, perfectWindow * 2, 8),
  };
}

export function disposeAll(value: unknown): void {
  if (value && typeof value === 'object') {
    if ('dispose' in value && typeof value.dispose === 'function') {
      (value as { dispose: () => void }).dispose();
      return;
    }
    Object.values(value).forEach(disposeAll);
  }
}
