import type { CertificateTier } from '../state/certificates.js';
import type { WatchId } from './ids.js';
import {
  BRUSHED_BRONZE,
  GILT,
  POLISHED_YELLOW_GOLD,
  SATIN_YELLOW_GOLD,
  POLISHED_BRONZE,
  POLISHED_ROSE_GOLD,
  ROSE_GOLD,
  SATIN_BRONZE,
  SATIN_ROSE_GOLD,
} from './metals.js';
import type {
  CaseSpec,
  Color,
  ComplicationsSpec,
  CompositeSpec,
  DialSpec,
  HandsSpec,
  MetalSpec,
  StrapSpec,
  WatchSpec,
} from './spec.js';

// A variant is a colourway of a watch: the same case, dial layout, hands
// and rules in other colours and finishes, each one a colourway that really
// exists on watches of that kind. Certificates on a watch earn its
// variants. A case may change what it is made of and its polished accents,
// the hands their metal, a skeleton how its movement is finished, and the
// strap may be another, or a bracelet: never the case's or a hand's shape.
//
// Each is named as a maker's catalogue names a reference: its colour, then
// the finish or material that sets it apart (Green Sunburst, Black
// Lacquer, Orange Carbon), in the same form on every watch.

/** Every variant id; the same id means the same name on any watch. */
export type VariantId =
  | 'standard'
  | 'green'
  | 'blue'
  | 'panda'
  | 'cream'
  | 'blueBlack'
  | 'burgundyBlack'
  | 'midnightBlue'
  | 'black'
  | 'yellow'
  | 'orangeBlack'
  | 'silver'
  | 'navy'
  | 'olive'
  | 'bronze'
  | 'brownGold'
  | 'red'
  | 'gold';

/** The standard look, always worn. */
export const STANDARD: VariantId = 'standard';

/**
 * Variants since replaced, by watch, and what a pick of one wears now: by
 * watch, since an id retired on one may still be worn on another.
 */
export const RETIRED_VARIANTS: Readonly<
  Record<string, Readonly<Record<string, VariantId>>>
> = {
  diver: { greenBezel: 'green' },
  chronograph: { tropical: 'cream' },
  gmt: { brownBlack: 'burgundyBlack' },
  tourbillon: { lime: 'yellow', crimson: 'orangeBlack', blue: 'orangeBlack' },
  grandComplication: { blue: 'navy' },
};

/**
 * What a variant may change: colours, the dial's finish, what the case is
 * made of and its accents, the hands' metal, a skeleton movement's finish
 * and the strap, nothing else.
 */
export interface VariantChanges {
  readonly case?: {
    /** What the case is made of; null for metal, where it was a composite. */
    readonly composite?: CompositeSpec | null;
    readonly metal?: Pick<MetalSpec, 'color'> & Partial<MetalSpec>;
    readonly accentMetal?: MetalSpec;
  };
  readonly dial?: Partial<
    Pick<
      DialSpec,
      | 'color'
      | 'finish'
      | 'printColor'
      | 'registerColor'
      | 'registerPrint'
      | 'movement'
    >
  >;
  readonly bezel?: Partial<
    Record<'insertColor' | 'dayColor' | 'nightColor' | 'printColor', Color>
  >;
  readonly hands?: Partial<
    Pick<HandsSpec, 'secondsColor' | 'secondsTip' | 'metal'>
  >;
  readonly lume?: { readonly color: Color };
  /** A colour for the strap there is, or another strap or a bracelet. */
  readonly strap?: { readonly color: Color } | StrapSpec;
  readonly complications?: {
    readonly gmt?: { readonly color: Color };
    readonly tourbillon?: { readonly bridge: Color };
  };
  readonly accents?: Partial<WatchSpec['accents']>;
}

export interface WatchVariant {
  readonly id: VariantId;
  /** The certificate on this watch that earns it; null for the standard. */
  readonly earnedBy: CertificateTier | null;
  readonly changes: VariantChanges;
}

/** Gold plate over steel, satin: a full-metal digital's case. */
const GOLD_PLATE = {
  color: '#e3bf68',
  roughness: 0.2,
  brushing: 0.35,
} as const;

const standard: WatchVariant = { id: STANDARD, earnedBy: null, changes: {} };

/** Each watch's variants: the standard, then the Chronometer's and the Observatory's. */
export const VARIANTS: Readonly<
  Record<WatchId, readonly [WatchVariant, ...WatchVariant[]]>
> = {
  diver: [
    standard,
    // Green all over: a green sunburst dial under a green bezel.
    {
      id: 'green',
      earnedBy: 'chronometer',
      changes: {
        dial: { color: '#0d5230', finish: 'sunburst' },
        bezel: { insertColor: '#0f5c36' },
      },
    },
    // The white-gold diver: a blue sunburst dial under a blue bezel.
    {
      id: 'blue',
      earnedBy: 'observatory',
      changes: {
        dial: { color: '#17378f', finish: 'sunburst' },
        bezel: { insertColor: '#1a3a8c' },
      },
    },
  ],
  chronograph: [
    standard,
    // White opaline dial, black registers, a black chronograph hand.
    {
      id: 'panda',
      earnedBy: 'chronometer',
      changes: {
        dial: {
          color: '#eceae2',
          finish: 'opaline',
          printColor: '#16161a',
          registerColor: '#111114',
          registerPrint: '#ecebe4',
        },
        hands: { secondsColor: '#17171a' },
        strap: { color: '#1a1716' },
      },
    },
    // An ivory dial with cream registers a shade deeper, printed in
    // dark brown, on a steel bracelet, as the sixties chronographs came.
    {
      id: 'cream',
      earnedBy: 'observatory',
      changes: {
        dial: {
          color: '#e6d6b4',
          finish: 'opaline',
          printColor: '#2b231c',
          registerColor: '#d3bf96',
          registerPrint: '#2b231c',
        },
        hands: { secondsColor: '#2b231c' },
        lume: { color: '#ecd9a4' },
        // On the steel bracelet the cream chronographs came on.
        strap: { type: 'oyster' },
        accents: { print: '#b5432c' },
      },
    },
  ],
  gmt: [
    standard,
    // Blue days, black nights, a blue GMT hand.
    {
      id: 'blueBlack',
      earnedBy: 'chronometer',
      changes: {
        bezel: { dayColor: '#1f4ea6', nightColor: '#0b0c0e' },
        complications: { gmt: { color: '#3468d0' } },
        accents: { print: '#3f74db' },
      },
    },
    // Burgundy days, black nights and gilt all through, as the vintage
    // divers came: gilt numerals and print, gilt hands and markers, a
    // gilt GMT hand and lume aged to cream.
    {
      id: 'burgundyBlack',
      earnedBy: 'observatory',
      changes: {
        bezel: {
          dayColor: '#6b1525',
          nightColor: '#0b0c0e',
          printColor: '#e3c68d',
        },
        dial: { printColor: '#e3c68d' },
        hands: { metal: GILT, secondsColor: '#e3c68d' },
        lume: { color: '#f0dfb4' },
        complications: { gmt: { color: '#dcb66f' } },
        accents: { print: '#dcb66f' },
      },
    },
  ],
  moonphase: [
    standard,
    // A midnight-blue sunburst dial with gold prints and a matching date.
    {
      id: 'midnightBlue',
      earnedBy: 'chronometer',
      changes: {
        dial: { color: '#1a2747', finish: 'sunburst', printColor: '#e4c57c' },
        hands: { secondsColor: '#eac66f' },
        strap: { color: '#18203a' },
        accents: {
          target: '#f0554a',
          print: '#e4c57c',
          dateWheel: '#1a2747',
          dateText: '#efe6cf',
        },
      },
    },
    // A black lacquer dial with gold prints.
    {
      id: 'black',
      earnedBy: 'observatory',
      changes: {
        dial: { color: '#0c0c0d', finish: 'gloss', printColor: '#e4c57c' },
        hands: { secondsColor: '#eac66f' },
        accents: {
          target: '#f0554a',
          print: '#e4c57c',
          dateWheel: '#141416',
          dateText: '#efe6cf',
        },
      },
    },
  ],
  tourbillon: [
    standard,
    // Forged carbon pressed with yellow fibres, marbled black and yellow,
    // black bridges and a yellow cage, as the racing tourbillons come in
    // their team colours.
    {
      id: 'yellow',
      earnedBy: 'chronometer',
      changes: {
        case: {
          composite: { kind: 'forged', flake: '#ffd21f' },
          metal: { color: '#26282c' },
        },
        dial: {
          movement: {
            plate: '#16181b',
            bridges: { color: '#3b3f45', roughness: 0.34, brushing: 0.6 },
            gears: { color: '#cdd3d9', roughness: 0.2, brushing: 0.3 },
          },
        },
        hands: { secondsColor: '#ffd21f' },
        lume: { color: '#fff0a6' },
        strap: { color: '#f2c40f' },
        complications: { tourbillon: { bridge: '#ffd21f' } },
        accents: { print: '#ffd21f' },
      },
    },
    // Black carbon in bold orange plies over a black movement: black
    // bridges, orange wheels and cage, on an orange strap.
    {
      id: 'orangeBlack',
      earnedBy: 'observatory',
      changes: {
        case: {
          composite: { kind: 'layered', ply: '#ff6a14', share: 0.3 },
          metal: { color: '#1b1c1f', roughness: 0.38 },
        },
        dial: {
          movement: {
            plate: '#0c0d0f',
            bridges: { color: '#2b2e33', roughness: 0.3, brushing: 0.7 },
            gears: { color: '#ff7d2e', roughness: 0.24, brushing: 0.3 },
          },
        },
        hands: { secondsColor: '#ff6a14' },
        lume: { color: '#ffd2a8' },
        strap: { color: '#f2600f' },
        complications: { tourbillon: { bridge: '#ff6a14' } },
        accents: { print: '#ff7d2e' },
      },
    },
  ],
  grandComplication: [
    standard,
    // A silver opaline dial on black alligator.
    {
      id: 'silver',
      earnedBy: 'chronometer',
      changes: {
        dial: {
          color: '#d8d9da',
          printColor: '#24272d',
          registerColor: '#cdcfd1',
          registerPrint: '#24272d',
        },
        strap: { color: '#151517' },
        accents: { print: '#24272d', dateText: '#24272d' },
      },
    },
    // In 18k rose gold: case, hands and travel-time hand, over a navy
    // sunburst dial printed in rose gold, on navy alligator.
    {
      id: 'navy',
      earnedBy: 'observatory',
      changes: {
        case: { metal: ROSE_GOLD, accentMetal: POLISHED_ROSE_GOLD },
        dial: {
          color: '#17244a',
          finish: 'sunburst',
          printColor: '#ecc3ad',
          registerColor: '#142041',
          registerPrint: '#ecc3ad',
        },
        hands: { metal: SATIN_ROSE_GOLD, secondsColor: '#ecc3ad' },
        strap: { color: '#121a33' },
        complications: { gmt: { color: '#ecc3ad' } },
        accents: {
          target: '#f0554a',
          print: '#ecc3ad',
          dateWheel: '#17244a',
          dateText: '#ecc3ad',
        },
      },
    },
  ],
  field: [
    standard,
    // An olive drab dial printed in cream, on a brown leather strap.
    {
      id: 'olive',
      earnedBy: 'chronometer',
      changes: {
        dial: { color: '#3a3f27', printColor: '#efe4c4' },
        lume: { color: '#ecdba8' },
        strap: { type: 'leather', color: '#6a4628' },
        accents: { print: '#dcc48b' },
      },
    },
    // A bronze case over a brown dial, bronze hands and aged lume, on sand
    // canvas: the field watch cast in bronze.
    {
      id: 'bronze',
      earnedBy: 'observatory',
      changes: {
        case: { metal: BRUSHED_BRONZE, accentMetal: POLISHED_BRONZE },
        dial: { color: '#33251b', printColor: '#ecdcbc' },
        hands: { metal: SATIN_BRONZE, secondsColor: '#ecdcbc' },
        lume: { color: '#e6c98c' },
        strap: { color: '#9c875e' },
        accents: { print: '#d8b07a' },
      },
    },
  ],
  pilot: [
    standard,
    // A blue sunburst dial printed in white, on black riveted leather, as
    // the pilots' watch of the children's book came.
    {
      id: 'blue',
      earnedBy: 'chronometer',
      changes: {
        dial: { color: '#1b3a7a', finish: 'sunburst' },
        strap: { color: '#151516' },
        accents: { print: '#dfe5ee' },
      },
    },
    // 18k red gold over a brown sunburst dial, gold hands and cream print,
    // on dark brown riveted leather, as the big pilot's watch came in its
    // aviator-writer edition.
    {
      id: 'brownGold',
      earnedBy: 'observatory',
      changes: {
        case: { metal: ROSE_GOLD, accentMetal: POLISHED_ROSE_GOLD },
        dial: { color: '#5a361d', finish: 'sunburst', printColor: '#f0e4cc' },
        hands: { metal: SATIN_ROSE_GOLD, secondsColor: '#f0e4cc' },
        lume: { color: '#efe1bd' },
        strap: { color: '#3a2316' },
        accents: { print: '#e2b994' },
      },
    },
  ],
  digital: [
    standard,
    // Red resin all over, a red dial, case, guard and strap, as the
    // eight-sided digital came in its brightest colour.
    {
      id: 'red',
      earnedBy: 'chronometer',
      changes: {
        case: { metal: { color: '#a8161f', roughness: 0.6 } },
        bezel: { insertColor: '#a8161f', printColor: '#f1f1ee' },
        dial: { color: '#8f1119', printColor: '#f4f1ec' },
        strap: { color: '#a8161f' },
        accents: { print: '#f4f1ec' },
      },
    },
    // Steel plated in gold all over, the guard and a bracelet too, gold
    // hands and batons over a black dial, the windows negative: light
    // segments on black.
    {
      id: 'gold',
      earnedBy: 'observatory',
      changes: {
        case: {
          composite: null,
          metal: GOLD_PLATE,
          accentMetal: POLISHED_YELLOW_GOLD,
        },
        bezel: { insertColor: '#c9a14e', printColor: '#2b2110' },
        dial: {
          printColor: '#e2c27a',
          registerColor: '#0e0f10',
          registerPrint: '#ece2c6',
        },
        hands: { metal: SATIN_YELLOW_GOLD, secondsColor: '#ecd28f' },
        strap: { type: 'oyster' },
        accents: { print: '#e2c27a' },
      },
    },
  ],
};

/** A watch's variant by id, if it has one. */
export function variantOf(
  watch: WatchId,
  id: string
): WatchVariant | undefined {
  return VARIANTS[watch].find(variant => variant.id === id);
}

/** `spec` made of metal, when `metal` says so and it wasn't already. */
function withoutComposite(spec: CaseSpec, metal: boolean): CaseSpec {
  if (!metal) return spec;
  const { composite, ...rest } = spec;
  return composite ? rest : spec;
}

function apply(spec: WatchSpec, { changes }: WatchVariant): WatchSpec {
  const { gmt, tourbillon } = spec.complications;
  return {
    ...spec,
    case: {
      ...withoutComposite(spec.case, changes.case?.composite === null),
      ...(changes.case?.composite && { composite: changes.case.composite }),
      metal: { ...spec.case.metal, ...changes.case?.metal },
      accentMetal: changes.case?.accentMetal ?? spec.case.accentMetal,
    },
    // Colour fields only; the tests hold every variant to its watch's
    // shape, so a change can't add a field the bezel or strap lacks.
    bezel: { ...spec.bezel, ...changes.bezel },
    dial: { ...spec.dial, ...changes.dial },
    hands: { ...spec.hands, ...changes.hands },
    lume: { ...spec.lume, ...changes.lume },
    strap: !changes.strap
      ? spec.strap
      : 'type' in changes.strap
        ? changes.strap
        : { ...spec.strap, ...changes.strap },
    complications: {
      ...spec.complications,
      ...(gmt &&
        changes.complications?.gmt && {
          gmt: { ...gmt, ...changes.complications.gmt },
        }),
      ...(tourbillon &&
        changes.complications?.tourbillon && {
          tourbillon: { ...tourbillon, ...changes.complications.tourbillon },
        }),
    } satisfies ComplicationsSpec,
    accents: { ...spec.accents, ...changes.accents },
  };
}

const cache = new WeakMap<WatchSpec, Map<string, WatchSpec>>();

/**
 * `spec` in variant `id` (the standard for an unknown id). The same inputs
 * always give the same object, since the scene keys its materials and
 * geometry on the spec.
 */
export function withVariant(spec: WatchSpec, id: string): WatchSpec {
  const variant = variantOf(spec.id, id);
  if (!variant || variant.id === STANDARD) return spec;
  let made = cache.get(spec);
  if (!made) {
    made = new Map();
    cache.set(spec, made);
  }
  let shown = made.get(variant.id);
  if (!shown) {
    shown = apply(spec, variant);
    made.set(variant.id, shown);
  }
  return shown;
}
