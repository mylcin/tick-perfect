import { lazy, Suspense, useEffect, useMemo } from 'react';

import { audio } from './audio';
import { Announcer } from './components/announcer';
import { ErrorBoundary } from './components/error-boundary';
import { useAttractMode } from './hooks/use-attract-mode';
import { usePrefersReducedMotion } from './hooks/use-prefers-reduced-motion';
import { useResolvedTheme } from './hooks/use-resolved-theme';
import { useSceneRecovery } from './hooks/use-scene-recovery';
import { usePageTheme, useStudioPool } from './hooks/use-studio';
import { useViewport } from './hooks/use-viewport';
import { online, ONLINE, useOnline } from './online';
import { GameScreen } from './screens/game-screen';
import { HelpDialog } from './screens/help-dialog';
import { LeaderboardDialog } from './screens/leaderboard-dialog';
import { SettingsDialog } from './screens/settings-dialog';
import { TimegrapherDialog } from './screens/timegrapher-dialog';
import { TitleScreen } from './screens/title-screen';
import { appStore, useAppState } from './state/app';
import { cloudSaveOf } from './state/app-store';
import { certificateFor } from './state/certificates';
import { engravedOn, type EngravingId } from './state/engravings';
import { createGameController } from './state/game-controller';
import { bestScore, isUnlocked } from './state/progress';
import { sessionStore, useSession } from './state/session';
import { shownSpec, shownVariant } from './state/variants';
import { framingFor } from './three/camera';
import { RESTING, type PoseSource } from './three/pose';
import type { RigMode } from './three/rig';
import { sceneFailureOf } from './three/scene-failure';
import type { Backdrop } from './three/studio';
import { STUDIO_HDRI } from './three/studio-hdri';
import { THUMBNAIL_RADIUS, thumbnailUrl } from './three/thumbnails';
import { createObservable } from './utils/observable';
import { STANDARD, WATCHES, type VariantId, type WatchId } from './watches';

// The 3D scene (Three.js and friends) loads as its own chunk, so the page
// paints before the heavier code arrives. The studio HDRI starts
// downloading as soon as it can, while the scene is still being built.
const WatchScene = lazy(async () => {
  const [scene, geometry, hdri] = await Promise.all([
    import('./three/watch-scene'),
    import('./three/geometry/cache'),
    import('./three/use-hdri'),
  ]);
  hdri.preloadHdri(STUDIO_HDRI);
  // The watch's geometry is the slowest part of the scene to build, so it
  // gets a task of its own: the page can paint and take input in between.
  await nextTask();
  geometry.watchGeometry(WATCHES[sessionStore.getState().watch]);
  await nextTask();
  return { default: scene.WatchScene };
});

/** Resolves in a later task, after the browser has had its turn. */
function nextTask(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

const markSceneReady = () => {
  sessionStore.getState().setScene('ready');
};
const markSceneFailed = (error: unknown) => {
  sessionStore.getState().setScene('failed', sceneFailureOf(error));
};

/** A locked watch holds still: no game, no score. */
const resting = {
  pose: (() => RESTING) satisfies PoseSource,
  score: createObservable(0),
};

export function App() {
  const screen = useSession(state => state.screen);
  const resultShown = useSession(state => state.resultShown);
  const roundMode = useSession(state => state.mode);
  const watch = useSession(state => state.watch);
  // In the variant the player picked, wherever it is drawn.
  const spec = useAppState(state =>
    shownSpec(state.progress, state.variants, watch)
  );
  const variant = useAppState(
    state => shownVariant(state.progress, state.variants, watch).id
  );
  const unlocked = useAppState(state => isUnlocked(state.progress, spec.id));
  const certificate = useAppState(state =>
    certificateFor(bestScore(state.progress, spec.id))
  );
  // As one string, so the selector's answer stays the same between saves.
  const engravedNames = useAppState(state =>
    engravedOn(state.engravings, spec.id).join(' ')
  );
  const engraved = useMemo(
    () => (engravedNames ? (engravedNames.split(' ') as EngravingId[]) : []),
    [engravedNames]
  );
  const turned = useSession(state => state.caseback) && unlocked;
  const settings = useAppState(state => state.settings);
  const scene = useSession(state => state.scene);
  const recovery = useSceneRecovery(sessionStore.getState().setScene);
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = settings.reducedMotion ?? systemReducedMotion;
  const theme = useResolvedTheme(settings.theme);
  // Night puts the lights out in either theme's studio.
  const backdrop: Backdrop = settings.night ? 'night' : theme;
  usePageTheme(settings.theme, settings.night);

  // The server's rules for this watch, when it has them: an admin can tune
  // a watch without a deploy. Taken only between rounds (below).
  const liveRules = useOnline(
    state => state.adopted?.seasons[spec.id]?.rules ?? null
  );
  const rules = liveRules ?? spec.rules;
  const playedSpec = useMemo(
    () => (rules === spec.rules ? spec : { ...spec, rules }),
    [spec, rules]
  );
  const attract = useAttractMode(rules);
  const player = useMemo(() => createGameController(rules), [rules]);

  useEffect(() => {
    online.connectProgress(
      () => cloudSaveOf(appStore.getState()),
      saved => {
        appStore.getState().mergeSaved(saved);
      }
    );
    online.start();
  }, []);
  const latestConfig = useOnline(state => state.config);
  useEffect(() => {
    if (screen !== 'game') online.adoptRules();
  }, [screen, latestConfig]);

  useEffect(() => {
    audio.setEnabled(settings.sound);
  }, [settings.sound]);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.language;
    root.dataset['motion'] = reducedMotion ? 'reduced' : 'full';
  }, [settings.language, reducedMotion]);
  useEffect(() => {
    // End-to-end tests (and dev tools) read the round to time key presses.
    if (!import.meta.env.DEV && import.meta.env.MODE !== 'e2e') return;
    Object.assign(window, {
      __tickPerfect: {
        snapshot: player.snapshot,
        focus: sessionStore.getState().focus,
        scene: () => {
          const { scene, sceneFailure } = sessionStore.getState();
          return { status: scene, failure: sceneFailure };
        },
      },
    });
  }, [player]);

  const playing = screen === 'game';
  // A Daily is played on its watch even before the collection opens it,
  // and a challenge still under way on one that isn't (a save restored in
  // another tab) goes on: both are drawn in full while they're played.
  const shownInFull = unlocked || (playing && roundMode.kind !== 'collection');
  const mode: RigMode = playing
    ? resultShown
      ? 'result'
      : 'play'
    : 'showcase';
  // The demo round on the title is decoration: with animations off the
  // watch rests instead (a game still moves only as its rules need).
  const source = playing
    ? player
    : unlocked && !reducedMotion
      ? attract
      : resting;

  return (
    // Clipped, not hidden: the text's shade reaches past the screen's sides,
    // and a scroll box that wide would let centring a card scroll it away.
    <main className="relative h-dvh overflow-clip">
      <StudioPool mode={mode} />
      {!playing && (
        <ScenePoster
          watch={spec.id}
          variant={unlocked ? variant : STANDARD}
          silhouette={!shownInFull}
          shown={scene === 'loading' || scene === 'lost'}
        />
      )}
      {/* Decorative: the game reports everything it shows in the page. It
          fades in once the watch is drawn, over the poster, as a lens pulls
          focus. The mask fades the strap out at the top and bottom of tall
          screens into whatever studio is behind it. */}
      <div
        className={`absolute inset-0 mask-[linear-gradient(to_bottom,transparent_0%,black_22%,black_78%,transparent_100%)] transition-opacity duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
          scene === 'ready' ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      >
        <ErrorBoundary fallback={null} onError={markSceneFailed}>
          <Suspense fallback={null}>
            <WatchScene
              key={recovery.generation}
              spec={spec}
              pose={source.pose}
              score={source.score}
              mode={mode}
              backdrop={backdrop}
              reducedMotion={reducedMotion}
              batterySaver={settings.batterySaver}
              appearance={shownInFull ? 'full' : 'silhouette'}
              certificate={certificate}
              engraved={engraved}
              turned={turned}
              onReady={markSceneReady}
              onLost={recovery.onLost}
              onRestored={recovery.onRestored}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {playing ? (
        // A fresh screen per watch, so moving on to a newly unlocked one
        // starts clean.
        <GameScreen key={spec.id} controller={player} spec={playedSpec} />
      ) : (
        <TitleScreen />
      )}
      <SettingsDialog />
      <TimegrapherDialog />
      <HelpDialog />
      {ONLINE && <LeaderboardDialog />}
      <Announcer />
    </main>
  );
}

/** Keeps the backdrop's pool of light behind the watch. */
function StudioPool({ mode }: { mode: RigMode }) {
  useStudioPool(mode);
  return null;
}

/**
 * The watch's thumbnail where the 3D watch appears, while that loads or
 * comes back after the GPU took it away: the screen's subject is there,
 * out of focus, and the real watch comes into focus over it. The blur hides
 * that the picture's pose and hands aren't the live watch's, and the round
 * mask fades the strap's cut ends. It eases in only after a moment, so a
 * quick load never shows it at all.
 */
function ScenePoster({
  watch,
  variant,
  silhouette,
  shown,
}: {
  watch: WatchId;
  variant: VariantId;
  silhouette: boolean;
  shown: boolean;
}) {
  const viewport = useViewport();
  // Framed as the rig frames the watch: above the title's measured column.
  const textTop = useSession(state => state.textTop);
  const { box, radius } = framingFor('showcase', viewport, textTop);
  // The scene fits `radius` in the box; the thumbnail frames less.
  const size =
    (Math.min(
      (box.right - box.left) * viewport.width,
      (box.bottom - box.top) * viewport.height
    ) *
      THUMBNAIL_RADIUS) /
    radius;
  return (
    <img
      src={thumbnailUrl(watch, variant)}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      data-testid="scene-poster"
      // From nothing as it mounts (starting:), it eases in after a moment;
      // gone before then, it never shows. It leaves slower than the watch
      // arrives, so the two never look like a double exposure.
      className={`pointer-events-none absolute -translate-1/2 mask-[radial-gradient(closest-side,black_72%,transparent)] blur-[12px] transition-opacity starting:opacity-0 ${
        shown
          ? 'opacity-55 delay-300 duration-500 ease-in-out'
          : 'opacity-0 delay-100 duration-600 ease-out'
      } ${silhouette ? 'brightness-0' : 'brightness-(--thumbnail-brightness)'}`}
      style={{
        left: `${String(((box.left + box.right) / 2) * 100)}%`,
        top: `${String(((box.top + box.bottom) / 2) * 100)}%`,
        width: size,
        height: size,
      }}
    />
  );
}
