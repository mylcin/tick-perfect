import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { audio } from '../audio';
import {
  online,
  type RankedMode,
  type Ticket,
  type TicketRequest,
} from '../online';
import { nearMiss, type HitQuality, type MissReason } from '../game';
import { VIBRATIONS } from '../feedback/cues';
import { vibrate } from '../feedback/haptics';
import { useGameFeedback } from '../hooks/use-game-feedback';
import { useGameKeys } from '../hooks/use-game-keys';
import { useGameLoop } from '../hooks/use-game-loop';
import { useMilestoneLit } from '../hooks/use-milestone-lit';
import { usePauseWhenHidden } from '../hooks/use-pause-when-hidden';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { useStreakDrain } from '../hooks/use-streak-drain';
import { useTips } from '../hooks/use-tips';
import type { Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { appStore, askToKeepProgress, useAppState } from '../state/app';
import { UNLOCK_SCORE } from '../state/certificates';
import type { GameController } from '../state/game-controller';
import {
  beatStatus,
  fixedSeed,
  scoreToBeat,
  type RoundMode,
} from '../state/modes';
import { bestScore } from '../state/progress';
import { goalAfter, roundShareText } from '../state/results';
import { sessionStore, useSession } from '../state/session';
import { engravingOf } from '../state/engravings';
import { roundStats } from '../state/timegrapher';
import { newlyEarnedVariants } from '../state/variants';
import { announce } from '../utils/announcer';
import { inputTime } from '../utils/input-time';
import { whenVisible } from '../utils/when-visible';
import type { WatchId, WatchSpec } from '../watches';
import { GameHud } from './game-hud';
import {
  GameOverDialog,
  type RoundOutcome,
  type RoundResult,
} from './game-over-dialog';
import type { Standing } from './milestones';
import { PauseDialog } from './pause-dialog';
import { rewardOf } from './reward';

/** Lets the camera settle on the dial before the first round starts. */
const READY_MS = 650;
/** Long enough to see the crack before the results slide in. */
const RESULT_DELAY_MS = 750;
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 450;
/** Fewer hits than this say too little about a round's timing to show. */
const TIMING_MIN_HITS = 3;

/** Sent with each ranked round, for telling builds apart in the logs. */
const CLIENT_VERSION = String(import.meta.env['VITE_APP_VERSION'] ?? 'dev');

/** What a mode's rounds count for on the boards, if anything. */
function rankedModeOf(mode: RoundMode): RankedMode | null {
  switch (mode.kind) {
    case 'collection':
      return { kind: 'collection' };
    case 'daily':
      return { kind: 'daily', number: mode.number };
    case 'challenge':
      return null;
  }
}

/** A fresh seed per round; the seed is kept, so any round can be replayed. */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Saves a finished round as its mode counts it (a challenge saves nothing)
 * and says how it counted.
 */
function recordRound(
  mode: RoundMode,
  watch: WatchId,
  score: number,
  qualities: readonly HitQuality[]
): RoundOutcome {
  const app = appStore.getState();
  const toBeat = scoreToBeat(mode);
  const beat = toBeat === null ? null : beatStatus(score, toBeat);
  switch (mode.kind) {
    case 'collection': {
      const record = app.recordScore(watch, score);
      const { progress } = appStore.getState();
      return {
        kind: 'collection',
        ...record,
        goal: goalAfter(progress, watch, score),
        variants: newlyEarnedVariants(app.progress, progress, watch).map(
          variant => variant.id
        ),
      };
    }
    case 'daily':
      return {
        kind: 'daily',
        number: mode.number,
        daily: app.recordDaily(mode.number, score, qualities),
        beat,
      };
    case 'challenge':
      return {
        kind: 'challenge',
        beat: beatStatus(score, mode.challenge.score),
      };
  }
}

/**
 * What screen readers hear the moment a round ends: only how it was
 * missed. The score and all it earned are read with the results, as focus
 * moves into them, so nothing is said twice or cut off half way.
 */
function missAnnouncement(
  t: Dictionary,
  reason: MissReason,
  missed: ReturnType<typeof nearMiss>
): string {
  return missed
    ? t.gameOver[missed.side](missed.ms)
    : t.gameOver.reasons[reason];
}

/** The score in the HUD's corner, by mode. */
function standingFor(
  mode: RoundMode,
  collectionBest: number,
  todaysBest: number
): Standing {
  const toBeat = scoreToBeat(mode);
  if (toBeat !== null) return { kind: 'toBeat', score: toBeat };
  return mode.kind === 'daily'
    ? { kind: 'today', score: todaysBest }
    : { kind: 'best', score: collectionBest };
}

export function GameScreen({
  controller,
  spec,
}: {
  controller: GameController;
  spec: WatchSpec;
}) {
  const t = useT();
  const { state, lastHit } = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot
  );
  const mode = useSession(session => session.mode);
  const scene = useSession(session => session.scene);
  const sceneFailure = useSession(session => session.sceneFailure);
  const best = useAppState(app => bestScore(app.progress, spec.id));
  const todaysBest = useAppState(app =>
    mode.kind === 'daily' && app.daily?.number === mode.number
      ? app.daily.best
      : 0
  );
  // Until a watch is Adjusted, its rule is spelt out as the round starts
  // and as each twist arrives (on its Daily or a challenge, too).
  const learning = best < UNLOCK_SCORE;
  const standing = standingFor(mode, best, todaysBest);
  const reducedMotionSetting = useAppState(app => app.settings.reducedMotion);
  const systemReducedMotion = usePrefersReducedMotion();
  const still = reducedMotionSetting ?? systemReducedMotion;
  const showTitle = useSession(session => session.showTitle);
  const focus = useSession(session => session.focus);
  const select = useAppState(app => app.select);
  const setResultShown = useSession(session => session.setResultShown);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Counts the rounds asked for; each one starts after the ready beat. */
  const [roundsAsked, setRoundsAsked] = useState(0);
  const countingDown = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  // Focus starts on the play area, wherever it was before (the title's
  // button, or the results of the watch before), so it never drops to the
  // page itself.
  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    countingDown.current = countdown !== null;
  }, [countdown]);

  // A ranked round's seed comes from the server, asked for as the beat
  // before each round starts; if it isn't back in time, or was dealt for
  // other rules, the round is played as it would be offline.
  const ticketRequest = useRef<TicketRequest | null>(null);
  const ranked = useRef<Ticket | null>(null);

  // A Daily or a challenge replays its own seed, on every retry too.
  const startRound = useCallback(() => {
    const ticket = ticketRequest.current?.ready() ?? null;
    ranked.current =
      online.ticketFits(ticket, controller.rules) && ticket.watch === spec.id
        ? ticket
        : null;
    online.clearSubmission();
    controller.dispatch({
      type: 'start',
      time: performance.now(),
      seed: ranked.current?.seed ?? fixedSeed(mode) ?? randomSeed(),
    });
  }, [controller, mode, spec.id]);

  const playTicks = useGameFeedback(
    controller,
    spec.id,
    t,
    learning ? t.rules[spec.id] : null,
    standing
  );
  useGameLoop(controller, playTicks);
  const tip = useTips(controller, t, learning);
  const passed = useMilestoneLit(controller, standing);
  const drain = useStreakDrain(controller, still);

  // A miss saves the score at once; the results follow the crack.
  useEffect(
    () =>
      controller.subscribe(events => {
        for (const event of events) {
          if (event.type === 'started' || event.type === 'exited') {
            setResult(null);
            setResultVisible(false);
          }
          const { state: over, qualities, errors } = controller.snapshot();
          if (event.type === 'miss' && over.phase === 'gameOver') {
            const outcome = recordRound(mode, spec.id, event.score, qualities);
            // Timing measures skill, not score: every mode counts it.
            appStore.getState().recordTiming(spec.id, errors, qualities);
            // So do the engravings, with the score and timing saved.
            const engraved = appStore
              .getState()
              .engrave(spec.id, { errors, bestStreak: over.round.bestStreak })
              .map(engravingOf)
              .filter(id => id !== null);
            const ticket = ranked.current;
            const log = controller.log();
            ranked.current = null;
            if (ticket && log) {
              void online.submit(ticket, log, event.score, CLIENT_VERSION);
            }
            online.progressChanged();
            setResult({
              score: event.score,
              reason: event.reason,
              nearMiss: nearMiss(over),
              timing:
                errors.length >= TIMING_MIN_HITS ? roundStats(errors) : null,
              outcome,
              engraved,
              share: roundShareText({
                mode,
                watch: spec.id,
                watchName: spec.name,
                seed: over.round.seed,
                score: event.score,
                qualities,
                daily: appStore.getState().daily,
              }),
            });
            announce(missAnnouncement(t, event.reason, nearMiss(over)), true);
          }
        }
      }),
    [controller, mode, spec, t]
  );
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      setResultVisible(true);
    }, RESULT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [result]);
  useEffect(() => {
    setResultShown(resultVisible);
  }, [resultVisible, setResultShown]);
  // What the round earned rings in as the results arrive, and not before
  // the player can see them: a hidden tab waits until it is looked at.
  const reward =
    resultVisible && result ? rewardOf(result.outcome, result.engraved) : null;
  const rewardSound = reward?.sound ?? null;
  const rewardVibrates = reward?.vibrate ?? false;
  useEffect(() => {
    if (!rewardSound) return;
    return whenVisible(() => {
      audio.play(rewardSound);
      if (rewardVibrates && appStore.getState().settings.vibration) {
        vibrate(VIBRATIONS.unlock);
      }
    });
  }, [rewardSound, rewardVibrates]);

  const tap = useCallback(
    (timeStamp: number) => {
      controller.dispatch({
        type: 'tap',
        time: inputTime(timeStamp, performance.now()),
      });
      // Keeps the audio context awake; a no-op once it runs.
      audio.unlock();
    },
    [controller]
  );
  const pause = useCallback(() => {
    setCountdown(null);
    controller.dispatch({ type: 'pause', time: performance.now() });
  }, [controller]);
  // Pausing again during the countdown stops it and shows the menu.
  const canPause = useCallback(
    () =>
      controller.snapshot().state.phase === 'playing' || countingDown.current,
    [controller]
  );
  useGameKeys(controller, { tap, pause, canPause });
  usePauseWhenHidden(pause);
  // Without the watch on screen a round can't go on: it waits, paused,
  // until the watch is back.
  useEffect(
    () =>
      sessionStore.subscribe(session => {
        if (session.scene !== 'ready' && canPause()) pause();
      }),
    [canPause, pause]
  );

  // Every round, the first and each retry, starts after a short beat: the
  // camera settles on the dial and the hands ease home to 12 first.
  useEffect(() => {
    const rankedMode = rankedModeOf(mode);
    ticketRequest.current = rankedMode
      ? online.requestTicket(spec.id, rankedMode)
      : null;
    const timer = setTimeout(() => {
      startRound();
      // Looked away while the camera settled, or the watch is away? Start
      // paused.
      if (
        document.visibilityState === 'hidden' ||
        !document.hasFocus() ||
        sessionStore.getState().scene !== 'ready'
      ) {
        pause();
      }
    }, READY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [roundsAsked, startRound, pause, mode, spec.id]);
  // Leaving the screen ends the round.
  useEffect(
    () => () => {
      controller.dispatch({ type: 'exit' });
    },
    [controller]
  );

  // Resuming counts down first, so the hand never moves before the player
  // is looking at it again; screen readers hear it start. (From an effect,
  // so the pause dialog has closed and the page can be heard again.)
  const countingFrom = countdown === COUNTDOWN_FROM;
  useEffect(() => {
    if (countingFrom) announce(t.pause.countdown);
  }, [countingFrom, t]);
  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      setCountdown(null);
      controller.dispatch({ type: 'resume', time: performance.now() });
    }, COUNTDOWN_STEP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [countdown, controller]);

  /** Clears the board (results, crack, hands) and asks for a new round. */
  const playAgain = () => {
    audio.unlock();
    askToKeepProgress();
    setCountdown(null);
    controller.dispatch({ type: 'exit' });
    setRoundsAsked(count => count + 1);
  };
  /** Straight on to a watch the round just unlocked. */
  const playWatch = (watch: WatchId) => {
    audio.unlock();
    askToKeepProgress();
    select(watch);
    focus(watch);
  };

  return (
    <section aria-labelledby="game-heading" className="absolute inset-0">
      <h1 id="game-heading" lang="en" className="sr-only">
        {t.game.heading(spec.name)}
      </h1>

      {/* The whole screen is the button. Pointer down, not click: a tap
          counts the moment the finger lands. Screen readers activate it
          with a click that no pointer started (detail 0), so that counts
          too; a pointer's own click never does. */}
      <div
        ref={surface}
        role="button"
        tabIndex={-1}
        aria-label={t.game.surface}
        data-testid="game-surface"
        className="absolute inset-0 touch-none outline-none select-none [-webkit-touch-callout:none]"
        onPointerDown={event => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          tap(event.nativeEvent.timeStamp);
        }}
        onClick={event => {
          if (event.detail === 0) tap(event.nativeEvent.timeStamp);
        }}
        onContextMenu={event => {
          event.preventDefault();
        }}
      />

      <GameHud
        t={t}
        state={state}
        lastHit={lastHit}
        rules={controller.rules}
        standing={standing}
        twistHints={learning}
        tip={tip}
        passed={passed}
        drain={drain}
        canPause={state.phase === 'playing' || countdown !== null}
        onPause={pause}
      />

      {/* On the dial's centre, where play frames it (src/three/camera.ts),
          on a disc of the backdrop's colour so the hands and prints don't
          run through the digit. */}
      {countdown !== null && (
        <div
          data-testid="countdown"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[44%] grid -translate-y-1/2 place-items-center short:top-1/2"
        >
          <span className="grid size-24 place-items-center rounded-full bg-studio/75">
            <span
              key={countdown}
              className="animate-count text-6xl font-light text-ink tabular-nums"
            >
              {countdown}
            </span>
          </span>
        </div>
      )}

      <PauseDialog
        t={t}
        open={state.phase === 'paused' && countdown === null}
        scene={scene}
        sceneFailure={sceneFailure}
        score={state.phase === 'paused' ? state.round.score : 0}
        onResume={() => {
          setCountdown(COUNTDOWN_FROM);
        }}
        onRestart={playAgain}
        onMenu={showTitle}
      />
      <GameOverDialog
        t={t}
        result={resultVisible ? result : null}
        onRetry={playAgain}
        onPlayWatch={playWatch}
        onMenu={() => {
          askToKeepProgress();
          showTitle();
        }}
      />
    </section>
  );
}
