import type { GameRules } from '../game/index.js';
import type { WatchId } from './ids.js';

// A watch is data: the 3D scene builds every model from a WatchSpec, and the
// game plays it with the spec's rules. Adding a watch means a new spec (and,
// for a new twist, a rule module), never a new scene.
//
// Each watch of the collection is an homage to an icon of its kind: the
// shapes, proportions and colours that make it recognisable, never a maker's
// name or mark. Every dial reads TICK PERFECT.

export type { WatchId } from './ids.js';

/** sRGB hex colour, e.g. `#0b0d10`. */
export type Color = `#${string}`;

export interface MetalSpec {
  readonly color: Color;
  /** 0 = mirror, 1 = matte. */
  readonly roughness: number;
  /** Strength of the brushed grain; 0 for a polished surface. */
  readonly brushing: number;
}

/**
 * The case and how it meets the strap:
 *
 * - oyster: a sturdy round sports case with thick, straight lugs.
 * - tool: a slimmer round case with plain lugs, for a pilot's chronograph.
 * - calatrava: a thin round dress case with slender lugs that curve down.
 * - tonneau: a curved barrel, taller than wide, with the strap built in.
 * - grand: a round case with stepped, concave lugs, as grand complications
 *   wear.
 */
export type CaseStyle = 'oyster' | 'tool' | 'calatrava' | 'tonneau' | 'grand';

/**
 * `onion`: a big fluted bulb a gloved hand can wind, as on a pilot's
 * watch; `none` for a digital, set by its buttons.
 */
export type CrownStyle =
  'screwDown' | 'tool' | 'flat' | 'barrel' | 'onion' | 'none';

/**
 * A composite case, in place of a metal finish:
 *
 * - forged: chopped carbon fibres pressed together, a dark marbled pattern
 *   of flakes that catch the light at different angles; with a `flake`
 *   colour, coloured fibres are pressed in with the carbon and show as
 *   bright marbling.
 * - layered: hundreds of thin plies laid up and machined, so the plies show
 *   as fine wavy bands; `share` of them are coloured `ply`.
 * - resin: moulded resin, matte and one colour all through, as a
 *   shock-resistant digital's case is.
 * - ceramic: sintered ceramic, one colour all through under its polish, so
 *   it shows no pattern at all.
 */
export type CompositeSpec =
  | { readonly kind: 'forged'; readonly flake?: Color }
  | { readonly kind: 'ceramic' }
  | { readonly kind: 'resin' }
  | {
      readonly kind: 'layered';
      readonly ply: Color;
      /** The share of the plies that are coloured, in (0, 1). */
      readonly share: number;
    };

export interface CaseSpec {
  readonly style: CaseStyle;
  /** Half the case width across 9 to 3, in dial radii. */
  readonly radius: number;
  /** Half its length across 12 to 6, for a tonneau. */
  readonly length?: number;
  /** Height of the case middle, in dial radii. */
  readonly height: number;
  readonly metal: MetalSpec;
  /** A composite's pattern over the metal's colour and roughness. */
  readonly composite?: CompositeSpec;
  /** Polished bevels, bezel edge and crown, catching sharp highlights. */
  readonly accentMetal: MetalSpec;
  readonly crown: CrownStyle;
  readonly crownGuards: boolean;
  /**
   * Chronograph pushers at 2 and 4 o'clock, pump (flat) or round, or a
   * digital's four broad buttons at 2, 4, 8 and 10.
   */
  readonly pushers: 'none' | 'pump' | 'round' | 'buttons';
}

/** Radii of a bezel, in dial radii: where its top starts and ends. */
export interface BezelSize {
  readonly inner: number;
  readonly outer: number;
  /** Height of its top above the dial. */
  readonly height: number;
}

/**
 * The bezel. The first three carry an insert, and the target on it:
 *
 * - diveTimer: a black ceramic 60-minute scale, the first 15 minutes marked
 *   out, a lume pip at 12.
 * - gmt24: a two-tone 24-hour scale, one colour for day and one for night.
 * - minutes60: a bold 60-minute scale for timing, turning either way.
 * - octagon: a thick eight-sided resin guard, printed with what each
 *   button does; `outer` is across its flats.
 *
 * The rest are metal, and the target sits on the dial's chapter ring:
 *
 * - hobnail: a narrow ring of pyramid guilloché (clous de Paris).
 * - screwPlate: the top plate of a tonneau case, held by spline screws.
 * - stepped: a thin polished step.
 */
export type BezelSpec = BezelSize &
  (
    | {
        readonly type: 'diveTimer' | 'minutes60' | 'octagon';
        readonly insert: { readonly inner: number; readonly outer: number };
        readonly insertColor: Color;
        readonly printColor: Color;
        /** Ridges around the grip edge; 0 for a smooth edge. */
        readonly grip: number;
      }
    | {
        readonly type: 'gmt24';
        readonly insert: { readonly inner: number; readonly outer: number };
        /** The day half, 6 to 18. */
        readonly dayColor: Color;
        /** The night half, 18 to 6. */
        readonly nightColor: Color;
        readonly printColor: Color;
        readonly grip: number;
      }
    | { readonly type: 'hobnail' | 'stepped' }
    | { readonly type: 'screwPlate'; readonly screws: number }
  );

/**
 * How the dial is laid out:
 *
 * - maxi: a diver's dial of big lume dots, batons at 6 and 9, a triangle at
 *   12 and the date at 3.
 * - panda: two contrasting chronograph registers at 9 and 3, the date at 6.
 * - dress: applied faceted batons, a printed railway, the moon at 6.
 * - skeleton: no dial at all, the movement in view under a chapter ring.
 * - perpetual: a calendar dial with day and month windows at 12, the moon
 *   at 6, registers at 9 and 3 and small round apertures at 4:30 and 7:30.
 * - field: big printed numerals with the 24-hour time inside them, a lume
 *   dot at each hour and the date at 3.
 * - pilot: an observer's dial: big numerals, a triangle between two dots
 *   at 12 and the date at 3.
 * - anadigi: an analog-digital dial: slim batons round two liquid crystal
 *   windows, the score's at 3 and the time's at 6. `registerColor` is the
 *   crystal, `registerPrint` its segments.
 */
export type DialStyle =
  | 'maxi'
  | 'panda'
  | 'dress'
  | 'skeleton'
  | 'perpetual'
  | 'field'
  | 'pilot'
  | 'anadigi';

/** How a skeleton's movement is finished. */
export interface MovementSpec {
  /** The base plate at the back. */
  readonly plate: Color;
  readonly bridges: MetalSpec;
  /** The wheels and the mainspring barrel. */
  readonly gears: MetalSpec;
}

export interface DialSpec {
  readonly style: DialStyle;
  readonly color: Color;
  /** Deep gloss, matte, a soft opaline grain or a radial sunburst. */
  readonly finish: 'gloss' | 'matte' | 'opaline' | 'sunburst';
  readonly printColor: Color;
  /** The model line under the centre, e.g. "300m = 1000ft". */
  readonly label: string;
  /** A smaller second line. */
  readonly sublabel?: string;
  /** Registers and windows that differ from the dial. */
  readonly registerColor?: Color;
  readonly registerPrint?: Color;
  /** A skeleton's movement, seen in place of a dial. */
  readonly movement?: MovementSpec;
}

export type HourHandStyle =
  'mercedes' | 'sword' | 'baton' | 'dauphine' | 'leaf' | 'skeleton';
export type MinuteHandStyle =
  'sword' | 'baton' | 'dauphine' | 'leaf' | 'skeleton';
export type SecondsHandStyle = 'lollipop' | 'arrow' | 'needle' | 'skeleton';

export interface HandsSpec {
  readonly hour: HourHandStyle;
  readonly minute: MinuteHandStyle;
  /** The gameplay hand: long, bright and unmistakable on its dial. */
  readonly seconds: SecondsHandStyle;
  readonly metal: MetalSpec;
  readonly secondsColor: Color;
  /** A contrasting tip on the seconds hand, if it has one. */
  readonly secondsTip?: Color;
  /** Lume inlays on the hour and minute hands. */
  readonly lume: boolean;
}

export interface LumeSpec {
  readonly color: Color;
  /** Emissive strength in daylight and in night mode. */
  readonly day: number;
  readonly night: number;
}

/** A strap, or a metal bracelet in the case's own metal. */
export type StrapSpec =
  | {
      /**
       * Canvas is a woven strap, as a field watch wears; riveted is
       * leather held at the lugs by two rivets, as a pilot's is.
       */
      readonly type: 'rubber' | 'leather' | 'alligator' | 'canvas' | 'riveted';
      readonly color: Color;
    }
  | {
      /** Three broad links a row, or five with small polished centre links. */
      readonly type: 'oyster' | 'jubilee';
    };

/**
 * A sub-dial position: centred below, left of, above or right of centre,
 * or a small round aperture between 4 and 5.
 */
export type DialSlot = 'six' | 'nine' | 'twelve' | 'three' | 'fourThirty';

/** The extra mechanisms on a dial, each drawn only when present. */
export interface ComplicationsSpec {
  /** The stopwatch counter, running between a pair's taps. */
  readonly chronograph?: { readonly counter: DialSlot };
  /** A running seconds hand in a register, telling the time. */
  readonly smallSeconds?: { readonly slot: DialSlot };
  /** A second, arrow-tipped or hollow hand: the GMT twist's obstacle. */
  readonly gmt?: { readonly style: 'arrow' | 'hollow'; readonly color: Color };
  /** An aperture showing today's moon. */
  readonly moon?: {
    readonly slot: DialSlot;
    readonly sky: Color;
    readonly moon: Color;
  };
  /** An open aperture with the turning cage. */
  readonly tourbillon?: { readonly slot: DialSlot; readonly bridge: Color };
  /** Today's day and month in two windows under 12. */
  readonly calendar?: true;
}

/** Where the score shows: the date window, magnified or not. */
export interface DateSpec {
  /**
   * A window in the dial at 3, a window at 6 (under a chronograph's
   * registers), a small round aperture between 4 and 5, or a digital's
   * display.
   */
  readonly at: 'three' | 'six' | 'fourThirty' | 'display';
  /** A cyclops lens on the crystal, magnifying it. */
  readonly cyclops: boolean;
}

export interface WatchSpec {
  readonly id: WatchId;
  readonly name: string;
  readonly rules: GameRules;
  /**
   * What carries the target and turns with the game's ring: the bezel
   * insert, or the chapter ring at the dial's edge.
   */
  readonly targetTrack: 'bezel' | 'chapter';
  readonly case: CaseSpec;
  readonly bezel: BezelSpec;
  readonly dial: DialSpec;
  readonly date: DateSpec;
  readonly hands: HandsSpec;
  readonly lume: LumeSpec;
  readonly strap: StrapSpec;
  readonly complications: ComplicationsSpec;
  readonly accents: {
    /** Target highlight; paired with shape cues, never colour alone. */
    readonly target: Color;
    /** Printed details that pick up the watch's accent, e.g. the label. */
    readonly print: Color;
    readonly dateWheel: Color;
    readonly dateText: Color;
  };
}
