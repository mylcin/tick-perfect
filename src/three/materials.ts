import {
  AdditiveBlending,
  Color,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  type Material,
  type Texture,
} from 'three';

import type { CertificateTier } from '../state/certificates';
import { moonPhase } from '../utils/moon-phase';
import type { MetalSpec, MovementSpec, WatchSpec } from '../watches';
import { shade } from './canvas';
import { cloneComposite, compositeMaterial } from './composite';
import { createDisplay, type DisplayContent } from './lcd';
import { createCrackTexture } from './crack';
import { GATE_COVER, type GateCover } from './feedback';
import {
  createChapterPrint,
  createDialPrint,
  hobnailNormalMap,
  insertLumeMask,
  insertPrint,
} from './prints';
import {
  createDateWheel,
  dialFalloff,
  hatchTexture,
  cloudTexture,
  moonTexture,
  sunburstAnisotropy,
  weaveTexture,
} from './textures';

/** Everything the watch is made of, built once per spec. */
export interface WatchMaterials {
  readonly caseMetal: MeshPhysicalMaterial;
  readonly polishedMetal: MeshPhysicalMaterial;
  readonly handMetal: MeshPhysicalMaterial;
  readonly dial: MeshPhysicalMaterial;
  readonly dialPrint: MeshStandardMaterial;
  /** The chapter ring at the dial's edge, printed. */
  readonly chapter: MeshStandardMaterial;
  /** An analog-digital's windows, painted live; null on another dial. */
  readonly display: MeshStandardMaterial | null;
  readonly rehaut: MeshStandardMaterial;
  readonly insert: MeshPhysicalMaterial;
  /** The hobnail bezel: polished metal with a pyramid normal map. */
  readonly hobnail: MeshPhysicalMaterial;
  readonly lume: MeshStandardMaterial;
  readonly secondsHand: MeshPhysicalMaterial;
  /** A contrasting tip on the seconds hand. */
  readonly secondsTip: MeshPhysicalMaterial;
  readonly target: MeshStandardMaterial;
  readonly targetCore: MeshStandardMaterial;
  /** The span between a chronograph pair's marks. */
  readonly span: MeshBasicMaterial;
  /** Darkens the part of the target a GMT gate covers. */
  readonly gateShade: MeshBasicMaterial;
  /** Stripes over that part, so it reads without colour. */
  readonly hatch: MeshBasicMaterial;
  /** The line where a gate's covered part meets the open one. */
  readonly gateLine: MeshBasicMaterial;
  readonly gmtHand: MeshPhysicalMaterial;
  readonly gmtOutline: MeshStandardMaterial;
  readonly subdialHand: MeshStandardMaterial;
  readonly moonDisc: MeshStandardMaterial;
  /** The tourbillon cage's bridge. */
  readonly bridge: MeshPhysicalMaterial;
  /** A skeleton movement: base plate, bridges, wheels and jewels. */
  readonly movementPlate: MeshPhysicalMaterial;
  readonly movementBridge: MeshPhysicalMaterial;
  readonly movementGear: MeshPhysicalMaterial;
  readonly jewel: MeshPhysicalMaterial;
  readonly crystal: MeshStandardMaterial;
  /** The cyclops lens over the date. */
  readonly cyclops: MeshStandardMaterial;
  readonly strap: MeshPhysicalMaterial;
  readonly dateWheel: MeshStandardMaterial;
  /** The flash where a target was hit; additive, faded by the frame loop. */
  readonly hitFlash: MeshBasicMaterial;
  /** Cracks in the crystal after a miss; additive, faded in on a miss. */
  readonly crack: MeshBasicMaterial;
  /** The cloud a Pilot's hand is lost in; faded in by the frame loop. */
  readonly cloud: MeshBasicMaterial;
  /** Where a raced ghost's hand is: the seconds hand's colour, faint. */
  readonly ghostHand: MeshBasicMaterial;
  /**
   * The metals and lume again, for instanced meshes (hour markers, bracelet
   * links). three.js builds an instanced mesh its own shader program, so a
   * material drawn both ways would re-pick its program at every switch.
   */
  readonly instanced: InstancedMaterials;
  /** Paints a number on the date wheel. */
  readonly showDate: (value: number) => void;
  /** Paints what a digital's windows show; does nothing on another. */
  readonly showDisplay: (content: DisplayContent) => void;
  /**
   * Lights a digital's windows: the night's backlight, and a flash on a
   * countdown's beat; either kept as it was when not given.
   */
  readonly lightDisplay: (light: {
    readonly night?: number;
    readonly flash?: number;
  }) => void;
  /** Paints the crack pattern for a seed. */
  readonly drawCrack: (seed: number) => void;
  /** Repaints the dial with the certificate the watch has earned. */
  readonly printCertificate: (certificate: CertificateTier | null) => void;
  readonly dispose: () => void;
}

export interface InstancedMaterials {
  readonly caseMetal: MeshPhysicalMaterial;
  readonly polishedMetal: MeshPhysicalMaterial;
  readonly handMetal: MeshPhysicalMaterial;
  readonly lume: MeshStandardMaterial;
}

/** Copies of the materials instanced meshes use; they share any textures. */
function instancedCopies(materials: InstancedMaterials): InstancedMaterials {
  return {
    caseMetal: cloneComposite(materials.caseMetal),
    polishedMetal: materials.polishedMetal.clone(),
    handMetal: materials.handMetal.clone(),
    lume: materials.lume.clone(),
  };
}

/**
 * How brightly the target glows, before tone mapping. The band stays below
 * the bloom threshold so it reads as its colour; only the Perfect core
 * blooms.
 */
const TARGET_GLOW = 0.55;
const TARGET_CORE_GLOW = 2;
/** The span is a faint guide until the pair starts, then lights up. */
export const SPAN_OPACITY = { waiting: 0.28, running: 0.85 } as const;
/**
 * A gate line's colour and brightness: a light neutral, which reads on any
 * target colour over any insert (the GMT hand's red would vanish on a red
 * bezel half), just under the bloom threshold so its edges stay crisp.
 */
const GATE_LINE_COLOR = new Color('#f6f2ea');
const GATE_LINE_GLOW = 1.15;

/** A skeleton's finish when its spec gives none. */
const DEFAULT_MOVEMENT: MovementSpec = {
  plate: '#22252a',
  bridges: { color: '#9da3aa', roughness: 0.3, brushing: 0.7 },
  gears: { color: '#d9b26a', roughness: 0.22, brushing: 0.3 },
};

function metal(spec: MetalSpec): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: spec.color,
    metalness: 1,
    roughness: spec.roughness,
    // Lathe UVs run around the axis, so the grain follows the turning.
    anisotropy: spec.brushing,
    clearcoat: spec.brushing > 0 ? 0 : 0.4,
    clearcoatRoughness: 0.05,
  });
}

function dialMaterial(
  spec: WatchSpec,
  track: <T extends Texture>(texture: T) => T
): MeshPhysicalMaterial {
  const { color, finish } = spec.dial;
  switch (finish) {
    case 'gloss':
      // Deep lacquer: a glassy clear coat over a dark base.
      return new MeshPhysicalMaterial({
        color,
        metalness: 0,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      });
    case 'matte':
      return new MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.82 });
    case 'opaline':
      // A soft satin grain that glows faintly at grazing angles.
      return new MeshPhysicalMaterial({
        color,
        map: track(dialFalloff()),
        metalness: 0.15,
        roughness: 0.5,
        sheen: 0.25,
        sheenRoughness: 0.6,
        sheenColor: new Color(shade(color, 0.35)),
      });
    case 'sunburst':
      // Brushed metal under tinted lacquer: the radial grain throws a band
      // of light across the dial that sweeps as the watch tilts.
      return new MeshPhysicalMaterial({
        color: shade(color, 0.1),
        map: track(dialFalloff()),
        metalness: 1,
        roughness: 0.34,
        anisotropy: 1,
        anisotropyMap: track(sunburstAnisotropy(0.9)),
        clearcoat: 0.5,
        clearcoatRoughness: 0.08,
      });
  }
}

/** A cloud's colour: a pale grey that reads on light and dark dials. */
const CLOUD_COLOR = '#dde2e8';

/** Weave tiles across and along a canvas strap. */
const WEAVE_REPEAT = { across: 12, along: 48 } as const;

function strapMaterial(
  spec: WatchSpec,
  track: <T extends Texture>(texture: T) => T
): MeshPhysicalMaterial {
  const { strap } = spec;
  switch (strap.type) {
    case 'oyster':
    case 'jubilee':
      return metal(spec.case.metal);
    case 'rubber':
      return new MeshPhysicalMaterial({
        color: strap.color,
        roughness: 0.85,
        metalness: 0,
        envMapIntensity: 0.35,
      });
    case 'leather':
    case 'riveted':
      return new MeshPhysicalMaterial({
        color: strap.color,
        roughness: 0.62,
        metalness: 0,
        sheen: 0.4,
        sheenRoughness: 0.5,
        envMapIntensity: 0.35,
      });
    case 'alligator':
      return new MeshPhysicalMaterial({
        color: strap.color,
        roughness: 0.32,
        metalness: 0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.4,
      });
    case 'canvas': {
      const weave = track(weaveTexture());
      weave.repeat.set(WEAVE_REPEAT.across, WEAVE_REPEAT.along);
      return new MeshPhysicalMaterial({
        color: strap.color,
        map: weave,
        roughness: 0.94,
        metalness: 0,
        sheen: 0.5,
        sheenRoughness: 0.8,
        sheenColor: new Color(shade(strap.color, 0.3)),
        envMapIntensity: 0.3,
      });
    }
  }
}

/** An additive layer, invisible until the frame loop raises its opacity. */
/** How much a raced ghost's mark shows: plain to see, never the hand. */
const GHOST_OPACITY = 0.6;

function overlay(map?: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    ...(map && { map }),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
}

/** Wins over the dial print, which is pulled forward the same way. */
const ABOVE_PRINT = { polygonOffset: true, polygonOffsetFactor: -4 } as const;

export function createWatchMaterials(spec: WatchSpec): WatchMaterials {
  const textures: Texture[] = [];
  const track = <T extends Texture>(texture: T) => {
    textures.push(texture);
    return texture;
  };

  const lumeColor = new Color(spec.lume.color);
  const date = createDateWheel(spec);
  track(date.texture);
  const crack = createCrackTexture();
  track(crack.texture);
  const print = createDialPrint(spec);
  track(print.texture);
  const chapterPrint = createChapterPrint(spec);
  track(chapterPrint.texture);
  const { bezel } = spec;
  const { gmt, moon, tourbillon } = spec.complications;
  const hobnailMap =
    bezel.type === 'hobnail' ? track(hobnailNormalMap()) : null;
  if (hobnailMap) {
    hobnailMap.wrapS = RepeatWrapping;
    hobnailMap.wrapT = RepeatWrapping;
  }
  const tip = spec.hands.secondsTip ?? spec.hands.secondsColor;
  const display = spec.dial.style === 'anadigi' ? createDisplay(spec) : null;
  /** What lights a digital's windows now: the night's level, a flash. */
  const light = { night: 0, flash: 0 };
  if (display) {
    track(display.texture);
    track(display.mask);
  }
  const movement = spec.dial.movement ?? DEFAULT_MOVEMENT;

  const materials = {
    caseMetal: spec.case.composite
      ? compositeMaterial(spec.case.metal, spec.case.composite)
      : metal(spec.case.metal),
    polishedMetal: metal(spec.case.accentMetal),
    handMetal: metal(spec.hands.metal),
    dial: dialMaterial(spec, track),
    dialPrint: new MeshStandardMaterial({
      map: print.texture,
      transparent: true,
      roughness: 0.55,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    chapter: new MeshStandardMaterial({
      map: chapterPrint.texture,
      roughness: 0.5,
      metalness: 0,
      ...ABOVE_PRINT,
    }),
    display: display
      ? new MeshStandardMaterial({
          map: display.texture,
          roughness: 0.55,
          metalness: 0,
          emissive: lumeColor,
          emissiveMap: display.mask,
          emissiveIntensity: 0,
          // Clear but for the windows.
          transparent: true,
          ...ABOVE_PRINT,
        })
      : null,
    rehaut: new MeshStandardMaterial({
      color: shade(spec.dial.color, -0.4),
      metalness: 0.3,
      roughness: 0.7,
    }),
    insert:
      'insert' in bezel
        ? new MeshPhysicalMaterial({
            map: track(insertPrint(bezel)),
            // A resin guard's printing is matte, on clear over the resin;
            // a ceramic or aluminium insert shines.
            roughness:
              bezel.type === 'diveTimer'
                ? 0.12
                : bezel.type === 'octagon'
                  ? 0.72
                  : 0.26,
            metalness: bezel.type === 'octagon' ? 0 : 0.1,
            clearcoat: bezel.type === 'octagon' ? 0 : 1,
            transparent: bezel.type === 'octagon',
            clearcoatRoughness: 0.04,
            // Only the pip at 12 glows, on a dive bezel.
            emissive:
              bezel.type === 'diveTimer' ? lumeColor : new Color('#000000'),
            ...(bezel.type === 'diveTimer' && {
              emissiveMap: track(insertLumeMask(bezel)),
            }),
            emissiveIntensity: spec.lume.day,
          })
        : new MeshPhysicalMaterial(),
    hobnail: new MeshPhysicalMaterial({
      color: spec.case.accentMetal.color,
      metalness: 1,
      roughness: 0.26,
      ...(hobnailMap && { normalMap: hobnailMap }),
    }),
    lume: new MeshStandardMaterial({
      color: spec.lume.color,
      roughness: 0.6,
      emissive: lumeColor,
      emissiveIntensity: spec.lume.day,
    }),
    secondsHand: new MeshPhysicalMaterial({
      color: spec.hands.secondsColor,
      roughness: 0.3,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      // Glows with the lume at night: it is the hand the player follows.
      emissive: spec.hands.secondsColor,
      emissiveIntensity: 0,
    }),
    secondsTip: new MeshPhysicalMaterial({
      color: tip,
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 1,
      emissive: tip,
      emissiveIntensity: 0,
    }),
    // Transparent from the start, so a Moonphase target can fade without
    // a shader recompile in the middle of a round.
    target: new MeshStandardMaterial({
      color: spec.accents.target,
      roughness: 0.4,
      emissive: spec.accents.target,
      emissiveIntensity: TARGET_GLOW,
      transparent: true,
    }),
    targetCore: new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.3,
      emissive: '#fff4de',
      emissiveIntensity: TARGET_CORE_GLOW,
      transparent: true,
    }),
    span: new MeshBasicMaterial({
      color: spec.accents.target,
      transparent: true,
      opacity: SPAN_OPACITY.waiting,
      depthWrite: false,
    }),
    gateShade: new MeshBasicMaterial({
      color: '#0b0c0e',
      transparent: true,
      opacity: GATE_COVER.waiting.shade,
      depthWrite: false,
    }),
    hatch: new MeshBasicMaterial({
      map: track(hatchTexture()),
      color: '#0b0c0e',
      transparent: true,
      opacity: GATE_COVER.waiting.stripes,
      depthWrite: false,
    }),
    gateLine: new MeshBasicMaterial({
      color: GATE_LINE_COLOR.clone().multiplyScalar(GATE_LINE_GLOW),
    }),
    gmtHand: new MeshPhysicalMaterial({
      color: gmt?.color ?? '#ffffff',
      roughness: 0.3,
      metalness: gmt?.style === 'hollow' ? 1 : 0.2,
      clearcoat: 1,
      emissive: gmt?.color ?? '#000000',
      emissiveIntensity: 0,
    }),
    gmtOutline: new MeshStandardMaterial({ color: '#050506', roughness: 0.6 }),
    subdialHand: new MeshStandardMaterial({
      color: spec.dial.registerPrint ?? spec.dial.printColor,
      roughness: 0.35,
      metalness: 0.4,
    }),
    moonDisc: new MeshStandardMaterial({
      ...(moon && {
        map: track(moonTexture(moon.sky, moon.moon, moonPhase(Date.now()))),
      }),
      roughness: 0.4,
      metalness: 0.2,
      ...ABOVE_PRINT,
    }),
    bridge: metal({
      color: tourbillon?.bridge ?? '#cccccc',
      roughness: 0.12,
      brushing: 0,
    }),
    movementPlate: new MeshPhysicalMaterial({
      color: movement.plate,
      metalness: 0.9,
      roughness: 0.45,
    }),
    movementBridge: metal(movement.bridges),
    movementGear: metal(movement.gears),
    jewel: new MeshPhysicalMaterial({
      color: '#b3122a',
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1,
      emissive: '#40040c',
    }),
    // Sapphire adds no colour of its own, only reflections: a black surface
    // blended additively shows just the light it mirrors.
    crystal: new MeshStandardMaterial({
      color: '#000000',
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      envMapIntensity: 0.28,
    }),
    cyclops: new MeshStandardMaterial({
      color: '#000000',
      metalness: 0,
      roughness: 0.02,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      envMapIntensity: 0.6,
    }),
    strap: strapMaterial(spec, track),
    dateWheel: new MeshStandardMaterial({
      map: date.texture,
      roughness: 0.5,
      ...ABOVE_PRINT,
    }),
    hitFlash: overlay(),
    crack: overlay(crack.texture),
    cloud: new MeshBasicMaterial({
      color: CLOUD_COLOR,
      map: track(cloudTexture()),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
    ghostHand: new MeshBasicMaterial({
      color: spec.hands.secondsColor,
      transparent: true,
      depthWrite: false,
      opacity: GHOST_OPACITY,
    }),
  };

  const instanced = instancedCopies(materials);

  return {
    ...materials,
    instanced,
    showDate: date.show,
    showDisplay: display ? display.show : () => undefined,
    lightDisplay: ({ night = light.night, flash = light.flash }) => {
      light.night = night;
      light.flash = flash;
      if (materials.display) {
        materials.display.emissiveIntensity = night * BACKLIGHT + flash * FLASH;
      }
    },
    drawCrack: crack.draw,
    printCertificate: certificate => {
      print.paint(certificate);
      chapterPrint.paint(certificate);
    },
    dispose: () => {
      const dispose = (material: Material | null) => {
        material?.dispose();
      };
      Object.values(materials).forEach(dispose);
      Object.values(instanced).forEach(dispose);
      textures.forEach(texture => {
        texture.dispose();
      });
    },
  };
}

/**
 * A locked watch: every part in one dark, glossy metal that only the
 * studio's highlights pick out. Nothing is painted, so it builds at once.
 */
export function createSilhouetteMaterials(): WatchMaterials {
  const shadow = new MeshPhysicalMaterial({
    color: '#0b0c0f',
    metalness: 1,
    roughness: 0.3,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });
  // The strap runs off screen; glossy, its edges would streak across it.
  const strap = new MeshPhysicalMaterial({
    color: '#08090b',
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.25,
  });
  const hidden = overlay();
  const instancedShadow = shadow.clone();
  const noop = () => undefined;
  return {
    caseMetal: shadow,
    polishedMetal: shadow,
    handMetal: shadow,
    dial: shadow,
    dialPrint: shadow,
    chapter: shadow,
    display: null,
    rehaut: shadow,
    insert: shadow,
    hobnail: shadow,
    lume: shadow,
    secondsHand: shadow,
    secondsTip: shadow,
    target: shadow,
    targetCore: shadow,
    span: hidden,
    gateShade: hidden,
    hatch: hidden,
    gateLine: hidden,
    gmtHand: shadow,
    gmtOutline: shadow,
    subdialHand: shadow,
    moonDisc: shadow,
    bridge: shadow,
    movementPlate: shadow,
    movementBridge: shadow,
    movementGear: shadow,
    jewel: shadow,
    crystal: shadow,
    cyclops: shadow,
    strap,
    dateWheel: shadow,
    hitFlash: hidden,
    crack: hidden,
    cloud: hidden,
    ghostHand: hidden,
    instanced: {
      caseMetal: instancedShadow,
      polishedMetal: instancedShadow,
      handMetal: instancedShadow,
      lume: instancedShadow,
    },
    showDate: noop,
    showDisplay: noop,
    lightDisplay: noop,
    drawCrack: noop,
    printCertificate: noop,
    dispose: () => {
      shadow.dispose();
      instancedShadow.dispose();
      strap.dispose();
      hidden.dispose();
    },
  };
}

/** Lights the hit flash; `opacity` 0 hides it. */
export function setHitFlash(
  materials: WatchMaterials,
  color: Color,
  opacity: number
): void {
  materials.hitFlash.color.copy(color);
  materials.hitFlash.opacity = opacity;
}

export function setCrackOpacity(
  materials: WatchMaterials,
  opacity: number
): void {
  materials.crack.opacity = opacity;
}

/** Thickens or clears the cloud over a Pilot's dial. */
export function setCloudOpacity(
  materials: WatchMaterials,
  opacity: number
): void {
  materials.cloud.opacity = opacity;
}

/** Fades the target (a Moonphase target hiding). */
export function setTargetOpacity(
  materials: WatchMaterials,
  opacity: number
): void {
  materials.target.opacity = opacity;
  materials.targetCore.opacity = opacity;
}

/** How dark a gate's covered part is: its shade and its stripes. */
export function setGateCover(
  materials: WatchMaterials,
  cover: GateCover
): void {
  materials.gateShade.opacity = cover.shade;
  materials.hatch.opacity = cover.stripes;
}

/** Lights the gate line; `glow` 1 is its resting brightness. */
export function setGateLineGlow(materials: WatchMaterials, glow: number): void {
  materials.gateLine.color
    .copy(GATE_LINE_COLOR)
    .multiplyScalar(GATE_LINE_GLOW * glow);
}

export function setSpanOpacity(
  materials: WatchMaterials,
  opacity: number
): void {
  materials.span.opacity = opacity;
}

/** Share of the lume strength the seconds and GMT hands glow with. */
const HAND_GLOW = 0.28;
/** A digital's backlight, against the lume it stands in for. */
const BACKLIGHT = 0.35;
/** A countdown's beat lights a digital's windows this bright. */
const FLASH = 0.9;

/** Moves the luminous parts between their day and night strength. */
export function setLume(
  materials: WatchMaterials,
  intensity: number,
  night: number
): void {
  materials.lume.emissiveIntensity = intensity;
  materials.instanced.lume.emissiveIntensity = intensity;
  materials.insert.emissiveIntensity = intensity;
  materials.secondsHand.emissiveIntensity = intensity * night * HAND_GLOW;
  materials.secondsTip.emissiveIntensity = intensity * night * HAND_GLOW;
  materials.gmtHand.emissiveIntensity = intensity * night * HAND_GLOW;
  materials.lightDisplay({ night: intensity });
}
