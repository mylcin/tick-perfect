import { useCallback, useEffect, useRef, useState } from 'react';

import { audio } from '../audio';
import { Button, FOCUS, IconButton } from '../components/buttons';
import { CertificatePips } from '../components/certificate-pips';
import { LevelMeter } from '../components/level-meter';
import { WithEnglishNames } from '../components/english';
import {
  CasebackIcon,
  CloseIcon,
  HelpIcon,
  LeaderboardIcon,
  SettingsIcon,
  TimegrapherIcon,
} from '../components/icons';
import { ReserveGauge } from '../components/reserve-gauge';
import { isSpace } from '../hooks/use-game-keys';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { useToday } from '../hooks/use-today';
import type { Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { ONLINE } from '../online';
import { askToKeepProgress, useAppState, useStorageWorks } from '../state/app';
import { certificateFor } from '../state/certificates';
import { engravedOn, ENGRAVINGS } from '../state/engravings';
import { challengeRules } from '../state/challenge';
import { dailyWatch } from '../state/daily';
import { shouldSuggestHomeScreen, type Device } from '../state/keep-progress';
import { modeForChallenge, modeWatch, type RoundMode } from '../state/modes';
import { bestScore, isUnlocked } from '../state/progress';
import { RESERVE_DAYS, reserveOn } from '../state/reserve';
import { useSession } from '../state/session';
import { announce } from '../utils/announcer';
import { ENDLESS_WATCH, WATCH_ORDER, WATCHES, type WatchId } from '../watches';
import { useTextTop } from './use-text-top';
import {
  displayName,
  lockedText,
  unlockSteps,
  sceneFailureText,
  watchSummary,
} from './watch-status';
import { CasebackPanel } from './caseback-panel';
import { VariantPicker } from './variant-picker';
import { WatchStrip } from './watch-strip';

/** Arrow keys and Home/End step through the collection. */
const STEPS: Readonly<Record<string, (index: number) => number>> = {
  ArrowLeft: index => index - 1,
  ArrowUp: index => index - 1,
  ArrowRight: index => index + 1,
  ArrowDown: index => index + 1,
  Home: () => 0,
  End: () => WATCH_ORDER.length - 1,
};

/** Controls that take Space themselves; the strip's cards play instead. */
const PRESSES_SPACE =
  'button, input, textarea, select, a[href], [role="radio"]';

/**
 * Whether index.html drew this title before the scripts arrived: if so it
 * stays put as React takes over, instead of rising in again.
 */
function drawnByShell(): boolean {
  return document.getElementById('root')?.hasAttribute('data-shell') ?? false;
}

/**
 * The collection: the watch on show turning in the studio while the
 * attract-mode bot plays its rule, what it does and what it has earned, and
 * the strip of every watch. The button (or Space, unless another control
 * has focus) plays the watch on show once it is unlocked. The watch itself
 * is only there to be looked at: pressing it does nothing, so it never
 * seems to want dragging.
 *
 * Under the button, today's Daily with the power reserve; above it all, a
 * friend's challenge when a link brought one. When the watch can't be
 * drawn, it says why and offers a reload.
 */
export function TitleScreen() {
  const t = useT();
  const scene = useSession(state => state.scene);
  const sceneFailure = useSession(state => state.sceneFailure);
  const watch = useSession(state => state.watch);
  const play = useSession(state => state.play);
  const playMode = useSession(state => state.playMode);
  const challenge = useSession(state => state.challenge);
  const invalidChallenge = useSession(state => state.invalidChallenge);
  const dismissChallenge = useSession(state => state.dismissChallenge);
  const focus = useSession(state => state.focus);
  const setSettingsOpen = useSession(state => state.setSettingsOpen);
  const settingsOpen = useSession(state => state.settingsOpen);
  const setTimegrapherOpen = useSession(state => state.setTimegrapherOpen);
  const setLeaderboardOpen = useSession(state => state.setLeaderboardOpen);
  const setHelpOpen = useSession(state => state.setHelpOpen);
  const timegrapherOpen = useSession(state => state.timegrapherOpen);
  const helpOpen = useSession(state => state.helpOpen);
  const leaderboardOpen = useSession(state => state.leaderboardOpen);
  const progress = useAppState(state => state.progress);
  const select = useAppState(state => state.select);
  const variants = useAppState(state => state.variants);
  const chooseVariant = useAppState(state => state.chooseVariant);
  const daily = useAppState(state => state.daily);
  const reserve = useAppState(state => state.reserve);
  const timing = useAppState(state => state.timing);
  const engravings = useAppState(state => state.engravings);
  const caseback = useSession(state => state.caseback);
  const setCaseback = useSession(state => state.setCaseback);
  const markTip = useAppState(state => state.markTip);
  const homeScreenHint = useAppState(state =>
    shouldSuggestHomeScreen(state.progress, state.tips, navigator as Device)
  );
  const storageWorks = useStorageWorks();
  const today = useToday();
  const reducedMotionSetting = useAppState(
    state => state.settings.reducedMotion
  );
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = reducedMotionSetting ?? systemReducedMotion;
  const [fromShell] = useState(drawnByShell);
  useEffect(() => {
    document.getElementById('root')?.removeAttribute('data-shell');
  }, []);

  const spec = WATCHES[watch];
  const unlocked = isUnlocked(progress, watch);
  // Only a watch in full turns over; a silhouette has no caseback to show.
  const turned = caseback && unlocked && scene !== 'failed';
  const engravedCount = engravedOn(engravings, watch).length;
  const best = bestScore(progress, watch);
  // The best round kept to race, once one has been played since ghosts.
  const ghost = useAppState(state => state.ghosts.best[watch] ?? null);
  const tier = certificateFor(best);
  // Until a first score anywhere, the line under the name says how the
  // game itself is played.
  const firstTime = unlocked && Object.keys(progress.best).length === 0;
  const locked = unlocked ? null : lockedText(t, watch, progress);
  // A lost watch may come back: wait for it as for one still loading.
  const ready = scene === 'ready';
  const failed = scene === 'failed';
  const todaysBest = daily?.number === today ? daily.best : null;
  const reserveDays = reserveOn(reserve, today);
  const dailyName = WATCHES[dailyWatch(today)].name;
  const dailyLabel = [
    t.daily.button(today, dailyName),
    todaysBest === null ? '' : t.daily.todaysBest(todaysBest),
    t.daily.reserveOf(reserveDays, RESERVE_DAYS),
  ]
    .filter(Boolean)
    .join(' ');
  const playButton = useRef<HTMLButtonElement>(null);
  const column = useRef<HTMLDivElement>(null);
  useTextTop(column);

  // Moving through the collection turns the crown a detent. (Heard once
  // a gesture has woken the sound; browsing alone never asks for it.)
  const browse = useCallback(
    (next: WatchId) => {
      if (next !== watch) audio.play('crown');
      focus(next);
    },
    [watch, focus]
  );

  const start = useCallback(() => {
    if (!ready) return;
    if (locked !== null) {
      announce(t.announce.locked(locked));
      return;
    }
    // The press that starts the game is the gesture that allows sound,
    // and lets the browser ask about keeping the save.
    audio.unlock();
    askToKeepProgress();
    select(watch);
    play();
  }, [ready, locked, t, select, watch, play]);

  /**
   * A Daily or a challenge, on its own watch. Everyone plays the Daily,
   * on a watch the collection hasn't opened too (its rounds count towards
   * the Daily alone); a challenge waits until the watch is open.
   */
  const startMode = (mode: RoundMode) => {
    if (!ready) return;
    const modeOn = mode.kind === 'challenge' ? modeWatch(mode) : null;
    if (modeOn && !isUnlocked(progress, modeOn)) {
      announce(t.announce.locked(lockedText(t, modeOn, progress)));
      return;
    }
    audio.unlock();
    askToKeepProgress();
    playMode(mode);
  };
  const dismiss = () => {
    dismissChallenge();
    playButton.current?.focus();
  };

  // Space is the game's key here too, unless it is pressing a focused
  // control (the Daily, a challenge, a swatch); the arrows browse the
  // collection. Settings, the timegrapher, the leaderboard and How to play
  // have the keyboard while they're open.
  useEffect(() => {
    if (settingsOpen || timegrapherOpen || leaderboardOpen || helpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const step = STEPS[event.key];
      if (step) {
        event.preventDefault();
        const index = WATCH_ORDER.indexOf(watch);
        const next =
          WATCH_ORDER[
            Math.min(Math.max(step(index), 0), WATCH_ORDER.length - 1)
          ] ?? watch;
        browse(next);
        // On the strip, the card taking focus says it all; from anywhere
        // else, say which watch is on show now.
        const strip = document.querySelector('[data-testid="watch-list"]');
        if (next !== watch && !strip?.contains(document.activeElement)) {
          announce(`${watchSummary(t, next, progress)}. ${t.rules[next]}`);
        }
        return;
      }
      if (!isSpace(event) || event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest(PRESSES_SPACE);
      const onStrip = target?.closest('[data-testid="watch-list"]');
      if (control && control !== playButton.current && !onStrip) return;
      event.preventDefault();
      start();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    settingsOpen,
    timegrapherOpen,
    leaderboardOpen,
    helpOpen,
    start,
    browse,
    watch,
    t,
    progress,
  ]);

  return (
    <section
      aria-labelledby="title-heading"
      className="absolute inset-0 flex flex-col items-center justify-between px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] short:pt-[max(1rem,env(safe-area-inset-top))] short:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {/* Over the strap's top end, so it has a soft pool of the backdrop's
          colour of its own. index.html draws the same header first. */}
      <header
        className={`shade-halo relative z-10 text-center wide:self-start wide:pl-[8%] wide:text-left ${
          fromShell ? '' : 'animate-rise'
        }`}
      >
        {/* The name is English in every language (and stays "TICK", not
            "TİCK", when Turkish rules uppercase it). */}
        <h1
          id="title-heading"
          lang="en"
          className="text-sm font-medium tracking-[0.5em] text-ink uppercase"
        >
          Tick Perfect
        </h1>
        {/* Kept between the corner buttons: on a narrow phone it wraps.
            index.html leaves it out, so it fades in under the name. */}
        <p className="mt-2 max-w-[calc(100vw-7.5rem)] animate-fade text-xs tracking-wide text-ink-3 wide:max-w-none short:hidden compact:hidden">
          {t.title.tagline}
        </p>
        <LevelMeter
          t={t}
          points={progress.points}
          className="mt-2 animate-fade wide:justify-start"
        />
      </header>

      {/* The corner buttons fade in, as index.html leaves them out too. */}
      <IconButton
        label={t.title.settings}
        data-testid="settings-open"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 animate-fade"
        onClick={() => {
          setSettingsOpen(true);
        }}
      >
        <SettingsIcon />
      </IconButton>
      {/* Under Settings: beside it, it would crowd the name on a phone. */}
      <IconButton
        label={t.timegrapher.title}
        data-testid="timegrapher-open"
        className="absolute top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] right-[max(1rem,env(safe-area-inset-right))] z-10 animate-fade"
        onClick={() => {
          setTimegrapherOpen(true);
        }}
      >
        <TimegrapherIcon />
      </IconButton>
      {ONLINE && (
        <IconButton
          label={t.leaderboard.title}
          data-testid="leaderboard-open"
          className="absolute top-[calc(max(1rem,env(safe-area-inset-top))+6.5rem)] right-[max(1rem,env(safe-area-inset-right))] z-10 animate-fade"
          onClick={() => {
            setLeaderboardOpen(true);
          }}
        >
          <LeaderboardIcon />
        </IconButton>
      )}
      {/* In the other top corner, which the name leaves free on every
          screen: a fourth button in the stack would reach the challenge
          card on a small phone. */}
      <IconButton
        label={t.title.help}
        data-testid="help-open"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-10 animate-fade"
        onClick={() => {
          setHelpOpen(true);
        }}
      >
        <HelpIcon />
      </IconButton>

      {/* Under the watch, on a shade of its own; the framing keeps the
          dial above wherever it starts. To its right on a wide screen,
          centred on its own height, clear of the corner buttons (on a
          tablet held sideways its top reaches them). On a phone held
          sideways it stays on screen too, scrolling if it must. */}
      <div
        ref={column}
        className="relative flex w-full max-w-lg animate-rise flex-col items-center gap-3 [animation-delay:120ms] wide:absolute wide:top-1/2 wide:right-0 wide:w-[44%] wide:max-w-none wide:-translate-y-1/2 wide:pr-[calc(max(1rem,env(safe-area-inset-right))+3.75rem)] short:top-0 short:bottom-0 short:w-1/2 short:translate-y-0 short:justify-center-safe short:gap-2 short:overflow-y-auto short:py-3 short:pr-[calc(max(1rem,env(safe-area-inset-right))+3.75rem)] upright:shade-under"
      >
        {challenge && !failed && (
          <ChallengeCard
            t={t}
            watch={challenge.watch}
            score={challenge.score}
            rules={challengeRules(challenge)}
            ready={ready}
            locked={!isUnlocked(progress, challenge.watch)}
            onPlay={() => {
              startMode(modeForChallenge(challenge, today));
            }}
            onDismiss={dismiss}
          />
        )}
        {invalidChallenge && (
          <div
            role="status"
            data-testid="challenge-invalid"
            className={`flex w-full max-w-sm items-center gap-2 rounded-2xl border border-ink/15 bg-surface/90 py-1 pr-1 pl-4 short:max-w-none ${CLEAR_OF_CORNER}`}
          >
            <p className="min-w-0 flex-1 py-1 text-xs text-ink-2">
              {t.challenge.invalid}
            </p>
            <IconButton
              label={t.challenge.dismiss}
              className="shrink-0"
              onClick={dismiss}
            >
              <CloseIcon />
            </IconButton>
          </div>
        )}
        <div className="text-center">
          <h2
            lang="en"
            className="text-lg font-light tracking-[0.25em] text-ink uppercase short:text-base compact:text-sm compact:tracking-[0.2em]"
          >
            {spec.name}
            {watch === ENDLESS_WATCH && ' '}
            {/* On a line of its own in the narrow column beside the watch. */}
            {watch === ENDLESS_WATCH && (
              <span className="ml-2 align-middle text-[0.6rem] tracking-[0.3em] text-accent wide:mt-1 wide:ml-0 wide:block">
                {t.collection.endless}
              </span>
            )}
          </h2>
          <p
            data-testid="title-rule"
            data-first={firstTime}
            hidden={turned}
            className={`mx-auto mt-1 max-w-xs text-xs text-balance text-ink-3 short:hidden compact:text-[0.7rem] ${
              challenge || invalidChallenge ? 'compact:hidden' : ''
            }`}
          >
            <WithEnglishNames>
              {firstTime ? t.title.firstRule : t.rules[watch]}
            </WithEnglishNames>
          </p>
          {unlocked ? (
            <>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                <p
                  data-testid="title-best"
                  className="flex items-center gap-2 text-xs tracking-[0.3em] text-ink-3 uppercase"
                >
                  {t.title.best(best)}
                  <CertificatePips
                    tier={tier}
                    label={
                      tier ? t.certificates[tier] : t.collection.noCertificate
                    }
                  />
                </p>
                {/* Beside the certificates, the rest a watch can earn: its
                    caseback's engravings, shown by turning it over. */}
                {!failed && (
                  <button
                    type="button"
                    data-testid="caseback-toggle"
                    data-turned={turned}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-[0.65rem] tracking-[0.15em] whitespace-nowrap uppercase transition-colors [&_svg]:size-4 ${
                      turned
                        ? 'border-ink/40 bg-ink/10 text-ink'
                        : 'border-ink/15 text-ink-2 hover:border-ink/30 hover:text-ink'
                    } ${FOCUS}`}
                    onClick={() => {
                      audio.play('crown');
                      setCaseback(!turned);
                    }}
                  >
                    <CasebackIcon />
                    {turned ? t.engravings.hide : t.engravings.show}
                    {!turned && (
                      <span className="text-ink-3 tabular-nums">
                        {engravedCount}/{ENGRAVINGS.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
              {!failed &&
                (turned ? (
                  <CasebackPanel
                    t={t}
                    watch={watch}
                    name={spec.name}
                    engravings={engravings}
                    context={{ progress, reserve, timing }}
                  />
                ) : (
                  <VariantPicker
                    t={t}
                    watch={watch}
                    progress={progress}
                    choices={variants}
                    onChoose={variant => {
                      audio.play('crown');
                      chooseVariant(watch, variant);
                    }}
                  />
                ))}
            </>
          ) : (
            <div
              data-testid="watch-requirement"
              className="mx-auto mt-2 max-w-xs text-xs text-ink-2"
            >
              <p className="sr-only">
                <WithEnglishNames>{locked ?? ''}</WithEnglishNames>
              </p>
              <ul aria-hidden="true" className="flex flex-col gap-0.5">
                {unlockSteps(t, watch, progress).map(step => (
                  <li
                    key={step.kind}
                    data-testid="unlock-step"
                    data-step={step.kind}
                    data-done={step.done}
                    className={`flex items-baseline justify-center gap-1.5 text-balance ${
                      step.done ? 'text-ink-3' : ''
                    }`}
                  >
                    {/* Done is told by the mark's shape, not its colour. */}
                    <span className={step.done ? 'text-accent' : 'text-ink-3'}>
                      {step.done ? '✓' : '○'}
                    </span>
                    <span>
                      <WithEnglishNames>{step.text}</WithEnglishNames>
                      {!step.done && (
                        <span className="text-ink-3 tabular-nums">
                          {' '}
                          · {step.progress}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {failed ? (
          <>
            <p
              role="alert"
              data-testid="title-unsupported"
              data-failure={sceneFailure ?? 'webgl'}
              className="max-w-xs text-center text-sm text-balance text-ink-2"
            >
              {sceneFailureText(t, sceneFailure)}
            </p>
            <Button
              variant="primary"
              data-testid="title-reload"
              className="min-w-56"
              onClick={() => {
                window.location.reload();
              }}
            >
              {t.title.reload}
            </Button>
          </>
        ) : (
          <Button
            ref={playButton}
            variant="primary"
            autoFocus
            aria-disabled={!ready || !unlocked}
            className="min-w-56 aria-disabled:cursor-not-allowed!"
            onClick={start}
          >
            {!ready
              ? t.title.loading
              : unlocked
                ? t.title.play
                : t.collection.locked}
          </Button>
        )}
        {/* Practice on the watch on show (slowly until it is certified),
            or its best round again, against that round's ghost. */}
        {!failed && unlocked && (
          <div className="-my-2 flex items-center gap-1 short:-my-1">
            <Button
              variant="quiet"
              aria-disabled={!ready}
              className="min-h-10! px-4! text-xs! tracking-[0.12em]! uppercase"
              onClick={() => {
                startMode({
                  kind: 'practice',
                  pace: tier === null ? 'slow' : 'normal',
                });
              }}
            >
              {t.practice.open}
            </Button>
            {ghost && (
              <Button
                variant="quiet"
                aria-disabled={!ready}
                className="min-h-10! px-4! text-xs! tracking-[0.12em]! uppercase"
                onClick={() => {
                  startMode({
                    kind: 'ghost',
                    seed: ghost.seed,
                    toBeat: ghost.score,
                  });
                }}
              >
                {t.ghost.open}
              </Button>
            )}
          </div>
        )}
        {!failed && (
          <div className="flex flex-col items-center gap-1">
            <Button
              aria-disabled={!ready}
              data-testid="daily-play"
              className="min-h-11! gap-2.5! px-4! text-[0.7rem]! tracking-[0.12em]! uppercase"
              onClick={() => {
                startMode({ kind: 'daily', number: today });
              }}
            >
              {/* Heard as one sentence; the parts beside it are for the eye. */}
              <span className="sr-only">
                <WithEnglishNames>{dailyLabel}</WithEnglishNames>
              </span>
              <span aria-hidden="true" lang="en">
                {t.daily.name(today)} · {dailyName}
              </span>
              {todaysBest !== null && (
                <span
                  aria-hidden="true"
                  data-testid="daily-best"
                  className="text-ink-3 tabular-nums max-[23.5rem]:hidden short:hidden compact:hidden"
                >
                  {t.daily.best(todaysBest)}
                </span>
              )}
              <ReserveGauge days={reserveDays} />
            </Button>
            {daily === null && (
              <p
                data-testid="daily-intro"
                className="text-center text-[0.7rem] text-ink-3 short:hidden compact:hidden"
              >
                {t.daily.intro}
              </p>
            )}
          </div>
        )}

        {!storageWorks && (
          <p
            role="status"
            data-testid="storage-warning"
            className="max-w-xs text-center text-[0.7rem] text-balance text-ink-3"
          >
            {t.storage.notSaved}
          </p>
        )}
        {storageWorks && homeScreenHint && (
          <div
            data-testid="home-screen-hint"
            className="flex w-full max-w-sm items-center gap-2 rounded-2xl border border-ink/15 bg-surface/90 py-1 pr-1 pl-4 short:max-w-none"
          >
            <p className="min-w-0 flex-1 py-1 text-xs text-ink-2">
              {t.homeScreen.hint}
            </p>
            <IconButton
              label={t.homeScreen.dismiss}
              data-testid="home-screen-hint-dismiss"
              className="shrink-0"
              onClick={() => {
                markTip('homeScreen');
                playButton.current?.focus();
              }}
            >
              <CloseIcon />
            </IconButton>
          </div>
        )}

        <WatchStrip
          t={t}
          progress={progress}
          variants={variants}
          focused={watch}
          reducedMotion={reducedMotion}
          onFocus={browse}
        />
        {!failed && (
          <p className="hidden text-xs text-ink-3 pointer-fine:block short:hidden">
            {t.title.keyHint}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * A friend's challenge: the watch it is on, on a line of its own so a
 * narrow phone never cuts it short, then the score to beat, and a note
 * when it was set on other rules than the watch plays by here.
 */
/**
 * On the smallest phones held upright the column starts high enough to
 * meet the corner buttons, so a card at its top keeps to their left.
 */
const CLEAR_OF_CORNER =
  'tiny:w-[calc(100%-max(1rem,env(safe-area-inset-right))-1.75rem)] tiny:self-start';

function ChallengeCard({
  t,
  watch,
  score,
  rules,
  ready,
  locked,
  onPlay,
  onDismiss,
}: {
  t: Dictionary;
  watch: WatchId;
  score: number;
  rules: ReturnType<typeof challengeRules>;
  ready: boolean;
  /** Its watch isn't open yet, so it can't be played. */
  locked: boolean;
  onPlay: () => void;
  onDismiss: () => void;
}) {
  const name = displayName(t, watch);
  const note = locked
    ? t.challenge.locked(name)
    : rules === 'same'
      ? null
      : rules === 'earlier'
        ? t.challenge.earlierRules
        : t.challenge.laterRules;
  return (
    <div
      role="group"
      aria-labelledby="challenge-name"
      aria-describedby={note ? 'challenge-rules' : undefined}
      data-testid="challenge-card"
      data-watch={watch}
      data-rules={rules}
      // In a narrow column the buttons wrap under the text.
      className={`flex w-full max-w-sm flex-wrap items-center justify-end gap-x-2 rounded-2xl border border-accent/40 bg-surface/90 py-1 pr-1 pl-4 short:max-w-none ${CLEAR_OF_CORNER}`}
    >
      <span id="challenge-name" className="sr-only">
        <WithEnglishNames>{t.challenge.card(name, score)}</WithEnglishNames>
      </span>
      {/* Read as text too: swiping on a phone often skips a group's name. */}
      <p
        className={`flex min-w-24 flex-1 basis-24 flex-col pt-1 text-xs tracking-[0.08em] ${
          note ? '' : 'pb-1'
        }`}
      >
        <span lang="en" className="break-words text-accent">
          {name}
        </span>
        <span className="text-ink-2 tabular-nums">
          {t.challenge.title} ·{' '}
          <span className="whitespace-nowrap">{t.challenge.beat(score)}</span>
        </span>
      </p>
      {/* Read after the score, shown under the buttons: one tight line
          across the card, so even a small phone keeps it clear of the
          corner buttons. */}
      {note && (
        <p
          id="challenge-rules"
          data-testid="challenge-rules-note"
          data-note={locked ? 'locked' : rules}
          className="order-last basis-full pr-3 pb-0.5 text-[0.7rem] leading-3.5 text-ink-3"
        >
          {note}
        </p>
      )}
      <Button
        aria-disabled={!ready || locked}
        data-locked={locked}
        className="min-h-11! px-4! aria-disabled:cursor-not-allowed!"
        onClick={onPlay}
      >
        {t.challenge.play}
      </Button>
      <IconButton
        label={t.challenge.dismiss}
        className="shrink-0"
        onClick={onDismiss}
      >
        <CloseIcon />
      </IconButton>
    </div>
  );
}
