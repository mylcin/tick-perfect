import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleGeometry, MathUtils, type Group, type Mesh } from 'three';

import { firstTargetWidth } from '../game';
import type { CertificateTier } from '../state/certificates';
import type { EngravingId } from '../state/engravings';
import type { Observable } from '../utils/observable';
import type { WatchSpec } from '../watches';
import { casebackMaterial } from './caseback';
import { crackOpacity, easeAngle, shakeAt } from './feedback';
import { afterNextFrame, holdGeometry, watchGeometry } from './geometry/cache';
import {
  CHAPTER,
  clockAngles,
  dateWindowCentre,
  LAYOUT,
  SHOWROOM_TIME,
  slotFor,
  trackFor,
  watchAngleToRotation,
} from './layout';
import {
  createSilhouetteMaterials,
  createWatchMaterials,
  setCrackOpacity,
  setLume,
} from './materials';
import { CloudCover } from './parts/cloud-cover';
import { Cyclops } from './parts/cyclops';
import { Display } from './parts/display';
import { GhostMark } from './parts/ghost-mark';
import { GmtHand } from './parts/gmt-hand';
import { Markers } from './parts/markers';
import { Pushers } from './parts/pushers';
import { CounterHand, DateHand, SmallSecondsHand } from './parts/registers';
import { Bracelet, Strap } from './parts/strap';
import { TargetMarks } from './parts/target-marks';
import { TourbillonCage } from './parts/tourbillon-cage';
import type { PoseSource } from './pose';
import {
  createFrameBus,
  FrameBusContext,
  type WatchFrame,
} from './watch-frame';

type FrameParts = { -readonly [Key in keyof WatchFrame]: WatchFrame[Key] };

const CLOCK_REFRESH_MS = 250;
const LUME_DAMPING = 3;
/** How quickly free hands settle at their resting angle. */
const HAND_EASING = 7;
/** The crack sits in the crystal, above the hands. */
const CRACK_HEIGHT = 0.1;
/** Frames drawn with every effect visible, so their shaders compile early. */
const WARM_UP_FRAMES = 2;
const STILL = { offset: 0, twist: 0 } as const;
const NONE_ENGRAVED: readonly EngravingId[] = [];
/** As the watch rocks about its 12–6 axis, it rolls this much as well. */
const SWAY_ROLL = 0.3;
/** How quickly a sway cut short settles back to rest (about 0.25 s). */
const SWAY_SETTLING = 12;
/** How far a hack pulls the crown out, and how fast it moves (about 60 ms). */
const CROWN_PULL = 0.07;
/**
 * The winding stem the crown rides out on: thinner than the crown's tube,
 * from inside the case to inside the crown pushed home, so it shows only
 * across the gap a pulled crown leaves.
 */
const STEM = { radius: 0.024, inside: 0.02, beyond: 0.012 } as const;
const CROWN_SPEED = 50;
/**
 * Hand heights above the dial, from the hour hand up, each clear of the
 * one below (a GMT hand rides between minutes and seconds).
 */
const HAND_Z = { hour: 0.026, minute: 0.044, seconds: 0.079 } as const;
/** A skeleton's date window stands on a bridge, above the movement. */
const SKELETON_DATE_Z = 0.004;

export type WatchAppearance = 'full' | 'silhouette';

interface WatchModelProps {
  readonly spec: WatchSpec;
  readonly pose: PoseSource;
  /** Shown in the date window; updates without re-rendering the scene. */
  readonly score: Observable<number>;
  readonly night: boolean;
  readonly reducedMotion: boolean;
  /** A locked watch is a dark silhouette. */
  readonly appearance?: WatchAppearance;
  /** Printed on the dial once earned. */
  readonly certificate?: CertificateTier | null;
  /** Engraved on the caseback, in caseback order. */
  readonly engraved?: readonly EngravingId[];
  /** Turned over to show the caseback. */
  readonly turned?: boolean;
  /**
   * Ten past ten and nothing moving, as in a catalogue: for silhouettes
   * and thumbnails.
   */
  readonly showroom?: boolean;
}

export function WatchModel({
  spec,
  pose,
  score,
  night,
  reducedMotion,
  appearance = 'full',
  certificate = null,
  engraved = NONE_ENGRAVED,
  turned = false,
  showroom: alwaysShowroom = false,
}: WatchModelProps) {
  const silhouette = appearance === 'silhouette';
  const showroom = silhouette || alwaysShowroom;
  const materials = useMemo(
    () =>
      silhouette ? createSilhouetteMaterials() : createWatchMaterials(spec),
    [spec, silhouette]
  );
  // A variant only recolours: the geometry is the watch's own, built once.
  // Keyed on the strap's type: a bracelet is geometry of its own.
  const strapType = spec.strap.type;
  const geometry = useMemo(
    () => watchGeometry(spec),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shape only
    [spec.id, strapType]
  );
  useEffect(() => holdGeometry(geometry), [geometry]);
  // Disposed once the replacement has drawn, so the shader programs both
  // use are reused rather than compiled again.
  useEffect(
    () => () => {
      afterNextFrame(materials.dispose);
    },
    [materials]
  );

  useEffect(() => {
    materials.showDate(score.get());
    return score.subscribe(materials.showDate);
  }, [materials, score]);
  useEffect(() => {
    materials.printCertificate(certificate);
  }, [materials, certificate]);
  // The engraving is painted and uploaded only once this watch is turned
  // over (and kept while it is on show): played or browsed face up, its
  // back never shows, and a large texture would stall the first frame of
  // every watch picked.
  const [engravingFor, setEngravingFor] = useState<string | null>(null);
  if (turned && engravingFor !== spec.id) setEngravingFor(spec.id);
  const engrave = engravingFor === spec.id && !silhouette;
  // Keyed on the names, so a new array of the same ones keeps the texture.
  const engravedKey = engraved.join(' ');
  const caseback = useMemo(
    () =>
      !engrave
        ? null
        : casebackMaterial(
            spec,
            geometry.caseback.radius,
            engravedKey ? (engravedKey.split(' ') as EngravingId[]) : []
          ),
    [spec, engrave, geometry, engravedKey]
  );
  useEffect(
    () => () => {
      if (caseback) afterNextFrame(caseback.dispose);
    },
    [caseback]
  );

  const bus = useMemo(() => createFrameBus(), []);
  const hourHand = useRef<Group>(null);
  const minuteHand = useRef<Group>(null);
  const secondsHand = useRef<Group>(null);
  const bezel = useRef<Group>(null);
  const chapter = useRef<Group>(null);
  const crack = useRef<Mesh>(null);
  const shake = useRef<Group>(null);
  const crown = useRef<Mesh>(null);

  const crackGeometry = useMemo(
    () => new CircleGeometry(LAYOUT.crystalRadius, 96),
    []
  );
  useEffect(
    () => () => {
      crackGeometry.dispose();
    },
    [crackGeometry]
  );

  const onChapter = spec.targetTrack === 'chapter';
  const track = trackFor(spec);
  const { gmt, moon, tourbillon, chronograph } = spec.complications;
  const skeleton = spec.dial.style === 'skeleton';
  const gmtRest =
    spec.rules.twists.find(twist => twist.kind === 'gmt')?.hand.restAngle ?? 0;
  const datePosition = dateWindowCentre(spec);
  const clouded = spec.rules.twists.some(twist => twist.kind === 'cloud');
  const hacks = spec.rules.twists.some(twist => twist.kind === 'hack');
  // A resin guard has no polished steel round it.
  const bezelTrim =
    spec.case.composite?.kind === 'resin'
      ? materials.caseMetal
      : materials.polishedMetal;

  const frame = useRef({
    /** The track the ring angle belongs to; another one starts from 0. */
    onChapter,
    frames: 0,
    clockCheckedAt: -Infinity,
    lume: night ? spec.lume.night : spec.lume.day,
    seconds: 0,
    ring: 0,
    /** The game's sway last frame, and what is left of one cut short. */
    sway: 0,
    swayLeft: 0,
    /** How far the crown is out, towards CROWN_PULL while hacked. */
    crown: 0,
    crackSeed: null as number | null,
    parts: null as FrameParts | null,
  });

  // A new watch's effects compile in its own warm-up frames, not mid-round.
  useEffect(() => {
    frame.current.frames = 0;
  }, [materials]);

  useFrame((_, delta) => {
    const now = performance.now();
    const state = frame.current;
    const current = pose(now);
    const warmingUp = state.frames < WARM_UP_FRAMES;
    state.frames += 1;
    if (state.onChapter !== onChapter) {
      state.onChapter = onChapter;
      state.ring = 0;
    }

    // In a round the hands are exactly where the game has them; outside one
    // they glide to rest instead of jumping (unless animations are off).
    if (current.eased && !warmingUp && !reducedMotion) {
      state.seconds = easeAngle(
        state.seconds,
        current.seconds,
        HAND_EASING,
        delta
      );
      state.ring = easeAngle(state.ring, current.ring, HAND_EASING, delta);
    } else {
      state.seconds = current.seconds;
      state.ring = current.ring;
    }
    if (secondsHand.current) {
      secondsHand.current.rotation.z = watchAngleToRotation(state.seconds);
    }
    // Both every frame: the same groups carry on to the next watch, which
    // may turn the other one.
    const ringRotation = watchAngleToRotation(state.ring);
    if (chapter.current) {
      chapter.current.rotation.z = onChapter ? ringRotation : 0;
    }
    if (bezel.current) bezel.current.rotation.z = onChapter ? 0 : ringRotation;

    if (now - state.clockCheckedAt > CLOCK_REFRESH_MS) {
      state.clockCheckedAt = now;
      const date = new Date();
      const { hour, minute } = clockAngles(
        showroom
          ? SHOWROOM_TIME
          : {
              hours: date.getHours(),
              minutes: date.getMinutes(),
              seconds: date.getSeconds(),
            }
      );
      if (hourHand.current) {
        hourHand.current.rotation.z = watchAngleToRotation(hour);
      }
      if (minuteHand.current) {
        minuteHand.current.rotation.z = watchAngleToRotation(minute);
      }
    }

    const cracked = current.crack;
    if (crack.current) {
      crack.current.visible = cracked !== null || warmingUp;
      if (cracked) {
        if (cracked.seed !== state.crackSeed) {
          materials.drawCrack(cracked.seed);
          state.crackSeed = cracked.seed;
        }
        crack.current.rotation.z = watchAngleToRotation(cracked.angle);
        setCrackOpacity(materials, crackOpacity(cracked.age));
      } else {
        setCrackOpacity(materials, 0);
      }
    }
    // The whole watch rocks on the wrist as the game has it. A sweep that
    // ends mid-sway leaves the rest to ease home, and a later sway starts
    // from there. It is the game's own motion, so it plays even with
    // animations turned off.
    if (current.sway === null) state.swayLeft += state.sway;
    state.sway = current.sway ?? 0;
    state.swayLeft = warmingUp
      ? 0
      : MathUtils.damp(state.swayLeft, 0, SWAY_SETTLING, delta);
    const sway = MathUtils.degToRad(state.sway + state.swayLeft);
    if (shake.current) {
      const jolt = cracked ? shakeAt(cracked.age, reducedMotion) : STILL;
      shake.current.position.x = jolt.offset;
      shake.current.rotation.y = sway;
      shake.current.rotation.z = jolt.twist + SWAY_ROLL * sway;
    }

    // A hack pulls the crown out while the hand stands, as setting a real
    // one to the second does: the game's own motion, so it always plays.
    state.crown = MathUtils.damp(
      state.crown,
      current.hacked ? CROWN_PULL : 0,
      CROWN_SPEED,
      delta
    );
    if (crown.current) {
      crown.current.position.x = spec.case.radius + state.crown;
    }

    const lumeGoal = night ? spec.lume.night : spec.lume.day;
    state.lume = reducedMotion
      ? lumeGoal
      : MathUtils.damp(state.lume, lumeGoal, LUME_DAMPING, delta);
    const nightShare =
      (state.lume - spec.lume.day) / (spec.lume.night - spec.lume.day);
    setLume(materials, state.lume, MathUtils.clamp(nightShare, 0, 1));

    // One frame object, refilled every frame.
    state.parts ??= { pose: current, now, delta, reducedMotion, warmingUp };
    const parts = state.parts;
    parts.pose = current;
    parts.now = now;
    parts.delta = delta;
    parts.reducedMotion = reducedMotion;
    parts.warmingUp = warmingUp;
    bus.run(parts);
  });

  const m = materials;
  const g = geometry;
  const targetMarks = !silhouette && (
    <TargetMarks
      track={track}
      geometry={g}
      materials={m}
      targetColor={spec.accents.target}
      firstWidth={firstTargetWidth(spec.rules)}
    />
  );
  const bezelParts = g.bezel;

  return (
    <FrameBusContext.Provider value={bus}>
      <group ref={shake}>
        {/* Case, lugs, crown, pushers and the strap or bracelet */}
        <mesh geometry={g.case.body} material={m.caseMetal} />
        {g.caseback.plate && (
          <mesh geometry={g.caseback.plate} material={m.caseMetal} />
        )}
        {caseback && (
          <mesh geometry={g.caseback.geometry} material={caseback.material} />
        )}
        {g.case.lugs && <mesh geometry={g.case.lugs} material={m.caseMetal} />}
        {hacks && (
          <mesh
            material={m.polishedMetal}
            position={[
              spec.case.radius + (CROWN_PULL + STEM.beyond - STEM.inside) / 2,
              0,
              g.crownZ,
            ]}
            rotation-z={Math.PI / 2}
          >
            <cylinderGeometry
              args={[
                STEM.radius,
                STEM.radius,
                CROWN_PULL + STEM.beyond + STEM.inside,
                20,
              ]}
            />
          </mesh>
        )}
        {g.crown && (
          <mesh
            ref={crown}
            geometry={g.crown}
            material={m.polishedMetal}
            position={[spec.case.radius, 0, g.crownZ]}
          />
        )}
        {g.crownGuard && (
          <mesh geometry={g.crownGuard} material={m.caseMetal} />
        )}
        {g.pusher && (
          <Pushers
            geometry={g.pusher}
            materials={m}
            caseRadius={spec.case.radius}
            axisZ={g.crownZ}
            style={spec.case.pushers}
          />
        )}
        {g.strap ? (
          <Bracelet
            geometry={g.strap.geometry}
            links={g.strap.links}
            polishedCentre={spec.strap.type === 'jubilee'}
            materials={m}
          />
        ) : (
          <Strap
            anchor={g.case.strap}
            materials={m}
            riveted={spec.strap.type === 'riveted'}
          />
        )}

        {/* Bezel: turns with the target ring on bezel-track watches */}
        <group ref={bezel}>
          <mesh
            geometry={bezelParts.body}
            material={spec.bezel.type === 'hobnail' ? m.hobnail : m.caseMetal}
          />
          {bezelParts.edge && (
            <mesh geometry={bezelParts.edge} material={bezelTrim} />
          )}
          {bezelParts.insert && (
            <mesh geometry={bezelParts.insert} material={m.insert} />
          )}
          {bezelParts.screws && (
            <mesh geometry={bezelParts.screws} material={m.polishedMetal} />
          )}
          {!onChapter && targetMarks}
        </group>
        <mesh geometry={bezelParts.wall} material={bezelTrim} />

        {/* The dial, or the movement where a skeleton has none */}
        {g.dial && (
          <>
            <mesh geometry={g.dial} material={m.dial} />
            <mesh
              geometry={g.dial}
              material={m.dialPrint}
              position-z={0.0005}
            />
          </>
        )}
        {g.movement && (
          <>
            <mesh geometry={g.movement.plate} material={m.movementPlate} />
            <mesh geometry={g.movement.gears} material={m.movementGear} />
            <mesh geometry={g.movement.bridges} material={m.movementBridge} />
            <mesh geometry={g.movement.jewels} material={m.jewel} />
          </>
        )}
        {g.slotRims && (
          <mesh geometry={g.slotRims} material={m.polishedMetal} />
        )}
        <Markers kinds={g.markers} materials={m} />
        {moon && g.moonDisc && (
          <mesh
            geometry={g.moonDisc}
            material={m.moonDisc}
            position={[
              slotFor(spec, moon.slot).x,
              slotFor(spec, moon.slot).y,
              0.003,
            ]}
          />
        )}
        {tourbillon && g.cage && (
          <TourbillonCage
            geometry={g.cage}
            materials={m}
            slot={tourbillon.slot}
            still={showroom}
          />
        )}
        {spec.complications.smallSeconds && g.smallSecondsHand && (
          <SmallSecondsHand
            at={slotFor(spec, spec.complications.smallSeconds.slot)}
            hand={g.smallSecondsHand}
            hub={g.registerHub}
            materials={m}
            still={showroom}
          />
        )}
        {chronograph && (
          <CounterHand
            at={slotFor(spec, chronograph.counter)}
            hand={g.registerHand}
            hub={g.registerHub}
            materials={m}
            still={showroom}
          />
        )}
        {g.dateHand && (
          <DateHand
            at={slotFor(spec, 'six')}
            hand={g.dateHand}
            hub={g.registerHub}
            materials={m}
          />
        )}

        {/* The chapter ring: turns with the target on chapter-track watches */}
        <group ref={chapter}>
          {g.chapter && (
            <mesh
              geometry={g.chapter}
              material={m.chapter}
              position-z={CHAPTER.z}
            />
          )}
          {onChapter && targetMarks}
        </group>
        <mesh geometry={g.rehaut} material={m.rehaut} />

        {/* The score, in its date window or round aperture, or on the
            display of a digital */}
        {g.dateWheel && g.dateFrame && (
          <group
            position={[
              datePosition[0],
              datePosition[1],
              skeleton ? SKELETON_DATE_Z : 0,
            ]}
          >
            <mesh
              geometry={g.dateWheel}
              material={m.dateWheel}
              position-z={0.001}
            />
            <mesh geometry={g.dateFrame} material={m.polishedMetal} />
          </group>
        )}
        {g.display && (
          <Display
            geometry={g.display}
            materials={m}
            score={score}
            showroom={showroom}
          />
        )}

        {/* Hands, from the dial up */}
        <group ref={hourHand} position-z={HAND_Z.hour}>
          <mesh geometry={g.hourHand.metal} material={m.handMetal} />
          {g.hourHand.lume && (
            <mesh geometry={g.hourHand.lume} material={m.lume} />
          )}
        </group>
        <group ref={minuteHand} position-z={HAND_Z.minute}>
          <mesh geometry={g.minuteHand.metal} material={m.handMetal} />
          {g.minuteHand.lume && (
            <mesh geometry={g.minuteHand.lume} material={m.lume} />
          )}
        </group>
        {gmt && g.gmtHand && (
          <GmtHand geometry={g.gmtHand} materials={m} restAngle={gmtRest} />
        )}
        <GhostMark materials={m} />
        <group ref={secondsHand} position-z={HAND_Z.seconds}>
          <mesh geometry={g.secondsHand.metal} material={m.secondsHand} />
          {g.secondsHand.lume && (
            <mesh geometry={g.secondsHand.lume} material={m.lume} />
          )}
          {g.secondsHand.tip && (
            <mesh geometry={g.secondsHand.tip} material={m.secondsTip} />
          )}
        </group>
        <mesh geometry={g.hub} material={m.handMetal} position-z={0.062} />
        <mesh geometry={g.hubCap} material={m.secondsHand} position-z={0.096} />
        {clouded && <CloudCover materials={m} />}

        {g.cyclops && (
          <Cyclops
            lens={g.cyclops.lens}
            date={g.cyclops.date}
            materials={m}
            position={datePosition}
          />
        )}
        <mesh
          ref={crack}
          geometry={crackGeometry}
          material={m.crack}
          position-z={CRACK_HEIGHT}
          renderOrder={11}
        />
        {/* A silhouette's opaque crystal goes first, so nothing under it
            is shaded only to be painted over. */}
        <mesh
          geometry={g.crystal}
          material={m.crystal}
          renderOrder={silhouette ? -1 : 10}
        />
      </group>
    </FrameBusContext.Provider>
  );
}
