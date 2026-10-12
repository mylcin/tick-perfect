import { useEffect, useMemo, useRef } from 'react';
import { Color, type BufferGeometry, type Group, type Mesh } from 'three';

import {
  FLASH_STYLES,
  flashStrength,
  GATE_COVER,
  gateCover,
  gatePulse,
} from '../feedback';
import { arcBand } from '../geometry/build';
import {
  createTargetGeometry,
  disposeAll,
  type WatchGeometry,
} from '../geometry/parts';
import { watchAngleToRotation, type TrackLayout } from '../layout';
import {
  setGateCover,
  setGateLineGlow,
  setHitFlash,
  setSpanOpacity,
  setTargetOpacity,
  SPAN_OPACITY,
  type WatchMaterials,
} from '../materials';
import { useWatchFrame } from '../watch-frame';

const PERFECT_FLASH = new Color('#fff1d6');
/** The hatch's stripes per band width, so they stay fine on any target. */
const HATCH_REPEAT = 22;
/** Sits on the band's inner edge, joining a chronograph pair's marks. */
const SPAN_INSET = { inner: 0.024, outer: 0.008 } as const;

/** The flash band: a little wider and taller than the target it lights. */
function flashBand(track: TrackLayout, width: number): BufferGeometry {
  return arcBand(track.inner - 0.03, track.outer + 0.05, width + 2);
}

/**
 * Everything drawn on the target ring: the target (band, Perfect core and
 * edge brackets), a chronograph pair's stop mark and span, the part a GMT
 * gate covers and its line, and the flash where a target was just hit. It
 * lives inside the ring's group, so it turns with the bezel or the dial.
 */
export function TargetMarks({
  track,
  geometry,
  materials,
  targetColor,
  firstWidth,
}: {
  track: TrackLayout;
  geometry: WatchGeometry;
  materials: WatchMaterials;
  targetColor: string;
  /** The width the first target will have, for the flash's warm-up. */
  firstWidth: number;
}) {
  const target = useRef<Group>(null);
  const band = useRef<Mesh>(null);
  const core = useRef<Mesh>(null);
  const gate = useRef<Group>(null);
  const shade = useRef<Mesh>(null);
  const hatch = useRef<Mesh>(null);
  const gateTurn = useRef<Group>(null);
  const gateLine = useRef<Group>(null);
  const bracketStart = useRef<Mesh>(null);
  const bracketEnd = useRef<Mesh>(null);
  const startChevron = useRef<Mesh>(null);
  const stopBlock = useRef<Mesh>(null);
  const stop = useRef<Group>(null);
  const stopBand = useRef<Mesh>(null);
  const span = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);

  const accent = useMemo(() => new Color(targetColor), [targetColor]);
  // Replaced by a band of the hit target's width on every hit; this one
  // only lets the flash draw (and compile) before the first.
  const firstFlash = useMemo(
    () => flashBand(track, firstWidth),
    [track, firstWidth]
  );
  // What the bands draw before the first target sets their real shape, so
  // no mesh starts with an empty geometry nobody disposes.
  const placeholders = useMemo(
    () => ({
      ...createTargetGeometry(firstWidth, 1, track),
      cover: arcBand(track.inner, track.outer, firstWidth / 4),
      span: arcBand(
        track.inner - SPAN_INSET.inner,
        track.inner - SPAN_INSET.outer,
        firstWidth
      ),
    }),
    [track, firstWidth]
  );

  const state = useRef({
    width: Number.NaN,
    perfect: Number.NaN,
    target: null as ReturnType<typeof createTargetGeometry> | null,
    coverDegrees: Number.NaN,
    cover: null as BufferGeometry | null,
    spanDegrees: Number.NaN,
    span: null as BufferGeometry | null,
    flashWidth: Number.NaN,
    flash: null as BufferGeometry | null,
    flashColor: new Color(),
  });

  useEffect(
    () => () => {
      const current = state.current;
      disposeAll(current.target);
      current.cover?.dispose();
      current.span?.dispose();
      current.flash?.dispose();
      firstFlash.dispose();
      disposeAll(placeholders);
      // Whatever is drawn next is rebuilt from scratch.
      current.width = Number.NaN;
      current.perfect = Number.NaN;
      current.coverDegrees = Number.NaN;
      current.spanDegrees = Number.NaN;
      current.flashWidth = Number.NaN;
      current.target = null;
      current.cover = null;
      current.span = null;
      current.flash = null;
    },
    [firstFlash, placeholders]
  );

  useWatchFrame(({ pose, warmingUp, reducedMotion }) => {
    const current = state.current;
    const { target: targetPose, chrono, hit } = pose;
    const shown = targetPose !== null && targetPose.visibility > 0;
    if (target.current) target.current.visible = shown;

    if (targetPose && target.current) {
      target.current.rotation.z = watchAngleToRotation(targetPose.mark);
      const rebuild =
        targetPose.width !== current.width ||
        targetPose.perfectWindow !== current.perfect;
      if (rebuild && band.current && core.current) {
        disposeAll(current.target);
        current.target = createTargetGeometry(
          targetPose.width,
          targetPose.perfectWindow,
          track
        );
        band.current.geometry = current.target.band;
        core.current.geometry = current.target.core;
        if (stopBand.current) stopBand.current.geometry = current.target.band;
        current.width = targetPose.width;
        current.perfect = targetPose.perfectWindow;
      }
      const half = targetPose.width / 2;
      if (bracketStart.current) {
        bracketStart.current.rotation.z = watchAngleToRotation(-half);
      }
      if (bracketEnd.current) {
        bracketEnd.current.rotation.z = watchAngleToRotation(half);
      }
      // A hiding target fades out. A gated one stays lit: only the part
      // the GMT hand covers is shaded, below.
      setTargetOpacity(materials, targetPose.visibility);
      if (startChevron.current) {
        startChevron.current.visible = targetPose.role === 'start';
        // The chevron points the way the hand is travelling.
        startChevron.current.scale.x = chrono?.direction ?? 1;
      }
      if (stopBlock.current)
        stopBlock.current.visible = targetPose.role === 'stop';
    }

    // A gate shows the part it covers from the start of the sweep, fixed
    // on the target, where the judge checks it: a tap with the seconds hand
    // on it is blocked. Its line answers the moment the hand crosses it.
    const gatePose = shown ? targetPose.gate : null;
    if (gate.current) {
      gate.current.visible = gatePose !== null || warmingUp;
      if (targetPose)
        gate.current.rotation.z = watchAngleToRotation(targetPose.mark);
    }
    const cover = gatePose
      ? gateCover(gatePose.side, gatePose.crossed, reducedMotion)
      : GATE_COVER.waiting;
    setGateCover(materials, cover);
    if (gatePose && shade.current && hatch.current) {
      const degrees = gatePose.to - gatePose.from;
      if (degrees !== current.coverDegrees && degrees > 0) {
        current.cover?.dispose();
        current.cover = arcBand(track.inner, track.outer, degrees);
        current.coverDegrees = degrees;
        shade.current.geometry = current.cover;
        hatch.current.geometry = current.cover;
      }
      const middle = watchAngleToRotation((gatePose.from + gatePose.to) / 2);
      shade.current.rotation.z = middle;
      hatch.current.rotation.z = middle;
      const covered = degrees > 0 && cover.shade > 0;
      shade.current.visible = covered;
      hatch.current.visible = covered;
    } else {
      if (shade.current) shade.current.visible = warmingUp;
      if (hatch.current) hatch.current.visible = warmingUp;
    }
    const pulse = gatePulse(gatePose?.crossed ?? null, reducedMotion);
    setGateLineGlow(materials, pulse.glow);
    if (gateTurn.current && gatePose) {
      gateTurn.current.rotation.z = watchAngleToRotation(gatePose.edge);
      // The flag points into the open part, towards the mark.
      gateTurn.current.scale.x = gatePose.edge < 0 ? 1 : -1;
    }
    gateLine.current?.scale.set(pulse.scale, pulse.scale, 1);

    // A pair shows its stop mark from the start, joined by the span.
    const pairWaiting = chrono !== null && chrono.elapsed === null;
    if (stop.current) {
      stop.current.visible = pairWaiting || warmingUp;
      if (chrono)
        stop.current.rotation.z = watchAngleToRotation(chrono.stopMark);
    }
    if (span.current) {
      span.current.visible = chrono !== null || warmingUp;
      if (chrono) {
        if (chrono.span !== current.spanDegrees) {
          current.span?.dispose();
          current.span = arcBand(
            track.inner - SPAN_INSET.inner,
            track.inner - SPAN_INSET.outer,
            chrono.span
          );
          current.spanDegrees = chrono.span;
          span.current.geometry = current.span;
        }
        const middle = chrono.startMark + (chrono.direction * chrono.span) / 2;
        span.current.rotation.z = watchAngleToRotation(middle);
        setSpanOpacity(
          materials,
          pairWaiting ? SPAN_OPACITY.waiting : SPAN_OPACITY.running
        );
      }
    }

    const strength = hit ? flashStrength(hit.quality, hit.age) : 0;
    if (flash.current) {
      flash.current.visible = strength > 0 || warmingUp;
      if (hit && strength > 0) {
        if (hit.width !== current.flashWidth) {
          current.flash?.dispose();
          current.flash = flashBand(track, hit.width);
          current.flashWidth = hit.width;
          flash.current.geometry = current.flash;
        }
        const style = FLASH_STYLES[hit.quality];
        flash.current.rotation.z = watchAngleToRotation(hit.mark);
        flash.current.scale.setScalar(
          reducedMotion ? 1 : 1 + style.swell * (1 - strength)
        );
        current.flashColor
          .copy(hit.quality === 'perfect' ? PERFECT_FLASH : accent)
          .multiplyScalar(style.glow);
        setHitFlash(materials, current.flashColor, strength);
      } else {
        setHitFlash(materials, current.flashColor, 0);
      }
    }
  });

  // On a chapter ring the pair's marks sit on the band, so they take the
  // core's bright white to stand out from it.
  const markMaterial = track.marksOnBand
    ? materials.targetCore
    : materials.target;
  const hatchMap = materials.hatch.map;
  useEffect(() => {
    hatchMap?.repeat.set(HATCH_REPEAT, HATCH_REPEAT);
  }, [hatchMap]);

  return (
    <>
      <mesh
        ref={flash}
        geometry={firstFlash}
        material={materials.hitFlash}
        position-z={track.z + 0.002}
        renderOrder={5}
      />
      <mesh
        ref={span}
        geometry={placeholders.span}
        material={materials.span}
        position-z={track.z}
        renderOrder={4}
      />
      <group ref={stop} position-z={track.z}>
        <mesh
          ref={stopBand}
          geometry={placeholders.band}
          material={materials.target}
        />
        <mesh geometry={geometry.stopBlock} material={markMaterial} />
      </group>
      <group ref={gate} position-z={track.z}>
        <mesh
          ref={shade}
          geometry={placeholders.cover}
          material={materials.gateShade}
          position-z={0.002}
          renderOrder={6}
        />
        <mesh
          ref={hatch}
          geometry={placeholders.cover}
          material={materials.hatch}
          position-z={0.003}
          renderOrder={7}
        />
        <group ref={gateTurn}>
          <group
            ref={gateLine}
            position-y={geometry.gateLine.radius}
            position-z={0.004}
          >
            {/* A light bar on the GMT hand's own dark edge. */}
            <mesh
              geometry={geometry.gateLine.edge}
              material={materials.gmtOutline}
            />
            <mesh
              geometry={geometry.gateLine.bar}
              material={materials.gateLine}
            />
          </group>
        </group>
      </group>
      <group ref={target} position-z={track.z}>
        <mesh
          ref={band}
          geometry={placeholders.band}
          material={materials.target}
        />
        {/* Above a gate's line, whose flag tucks under it on a gate that
            leaves little more than the Perfect zone open. */}
        <mesh
          ref={core}
          geometry={placeholders.core}
          material={materials.targetCore}
          position-z={0.009}
        />
        <mesh
          ref={bracketStart}
          geometry={geometry.targetBracket}
          material={materials.target}
        />
        <mesh
          ref={bracketEnd}
          geometry={geometry.targetBracket}
          material={materials.target}
        />
        <mesh
          ref={startChevron}
          geometry={geometry.startChevron}
          material={markMaterial}
        />
        <mesh
          ref={stopBlock}
          geometry={geometry.stopBlock}
          material={markMaterial}
        />
      </group>
    </>
  );
}
