import { expect, type Page } from '@playwright/test';

import { centerTime, type GameState, type Segment } from '../src/game';
import { SAVE_KEY, SAVE_VERSION } from '../src/state/saved';
import { WATCH_ORDER } from '../src/watches/ids';

// Software WebGL is slow; the scene can take a few seconds to appear.
export const SCENE_TIMEOUT = 60_000;
/**
 * The watch alone is about 40 draw calls a frame; post-processing adds
 * fewer than 20 on its own, so anything above this means the watch is drawn.
 */
const WATCH_DRAWS_PER_FRAME = 35;

/**
 * Counts WebGL draw calls and animation frames from the first script on, so
 * a test can wait until the watch is really being drawn rather than until a
 * canvas exists.
 */
export async function countDraws(page: Page) {
  await page.addInitScript(() => {
    const counter = window as unknown as { __draws: number; __frames: number };
    counter.__draws = 0;
    counter.__frames = 0;
    const tick = () => {
      counter.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const prototype = WebGL2RenderingContext.prototype;
    for (const name of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ] as const) {
      const original = Object.getOwnPropertyDescriptor(prototype, name)
        ?.value as (...args: unknown[]) => void;
      Object.defineProperty(prototype, name, {
        value(this: WebGL2RenderingContext, ...args: unknown[]) {
          counter.__draws++;
          original.apply(this, args);
        },
      });
    }
  });
}

const counts = (page: Page) =>
  page.evaluate(() => {
    const { __draws, __frames } = window as unknown as {
      __draws: number;
      __frames: number;
    };
    return { draws: __draws, frames: __frames };
  });

/**
 * Average draw calls per frame over the next few frames. Waits for at least
 * two: a software-rendered page under load can take longer than half a
 * second per frame, and an empty sample says nothing.
 */
async function drawsPerFrame(page: Page) {
  const start = await counts(page);
  let end = start;
  for (let waited = 0; waited < 8000; waited += 250) {
    await page.waitForTimeout(250);
    end = await counts(page);
    if (end.frames - start.frames >= 2 && waited >= 250) break;
  }
  return (end.draws - start.draws) / Math.max(1, end.frames - start.frames);
}

export async function waitForWatch(page: Page) {
  await expect
    .poll(() => drawsPerFrame(page), { timeout: SCENE_TIMEOUT, intervals: [0] })
    .toBeGreaterThan(WATCH_DRAWS_PER_FRAME);
}

/** Page errors plus WebGL and shader errors reported on the console. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** The read-only hook the e2e build puts on `window`. */
interface TestHooks {
  readonly snapshot: () => { readonly state: GameState };
}

/** The game state, read through the e2e build's hook. */
export function gameState(page: Page): Promise<GameState> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __tickPerfect: TestHooks }
      ).__tickPerfect.snapshot().state
  );
}

/**
 * Waits for a phase. Polls often: a round can end within a second, so a
 * slow poll could miss the moment it was playing.
 */
export async function waitForPhase(page: Page, phase: GameState['phase']) {
  await expect
    .poll(async () => (await gameState(page)).phase, {
      timeout: 20_000,
      intervals: [25],
    })
    .toBe(phase);
}

/** The current round's seed, which every new round changes. */
export async function roundSeed(page: Page): Promise<number | null> {
  const state = await gameState(page);
  return state.phase === 'idle' ? null : state.round.seed;
}

/** The round's hits so far; fails when no round has started. */
export async function hits(page: Page): Promise<number> {
  const state = await gameState(page);
  if (state.phase === 'idle') throw new Error('No round has started');
  return state.round.hits;
}

/** Waits until the title screen can start a game, then starts one. */
export async function startGame(page: Page) {
  await page
    .getByRole('button', { name: 'Tap to Play' })
    .click({ timeout: SCENE_TIMEOUT });
  await waitForPhase(page, 'playing');
}

/** The current round's sweep start and the page's clock, read together. */
function readRound(page: Page) {
  return page.evaluate(() => {
    const { state } = (
      window as unknown as { __tickPerfect: TestHooks }
    ).__tickPerfect.snapshot();
    return state.phase === 'playing'
      ? { segment: state.round.segment, now: performance.now() }
      : null;
  });
}

/**
 * Presses at `at` on the page's clock: a real Space key press on desktop.
 * On touch devices a real tap can sit queued behind software-rendered
 * frames for half a second, far longer than any phone would, so the page
 * itself waits for the moment and fires the pointerdown a finger would.
 * (`tapScreen` checks real touches reach the play area.)
 */
async function pressAt(page: Page, at: number, now: number, touch: boolean) {
  if (touch) {
    // Hand over well before the moment; the page then holds its thread
    // until the moment itself, so no frame can delay the press.
    await page.waitForTimeout(Math.max(0, at - now - 600));
    await page.evaluate(moment => {
      while (performance.now() < moment) {
        // Waiting for the moment.
      }
      document.querySelector('[data-testid="game-surface"]')?.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'touch',
          isPrimary: true,
          bubbles: true,
        })
      );
    }, at);
    return;
  }
  // Aimed a touch early, so the key reaches the page about on time.
  await page.waitForTimeout(Math.max(0, at - now - 15));
  await page.keyboard.press('Space');
}

/** Presses the moment the hand reaches the target's centre. */
export async function pressOnTarget(page: Page, touch: boolean) {
  const round = await readRound(page);
  if (!round) throw new Error('No round is being played');
  await pressAt(page, centerTime(round.segment) - 5, round.now, touch);
}

/** Presses well before the first target: an early miss. */
export async function pressEarly(page: Page, touch: boolean) {
  const round = await readRound(page);
  if (!round) throw new Error('No round is being played');
  // Past the start press's bounce, well before the first target can open
  // (at least 400 ms in).
  await pressAt(page, round.segment.startTime + 120, round.now, touch);
}

/** Taps the middle of the screen with a real finger. */
export async function tapScreen(page: Page) {
  const viewport = page.viewportSize();
  await page.touchscreen.tap(
    (viewport?.width ?? 400) / 2,
    (viewport?.height ?? 800) / 2
  );
}

/** Saved progress for a test to start from, written before the app loads. */
export async function seedProgress(
  page: Page,
  progress: {
    best?: Record<string, number>;
    unlocked?: string[];
    /** Every collection round's score so far; the bests' sum if absent. */
    points?: number;
    selected?: string;
    /** Saved timing records by watch, as the timegrapher keeps them. */
    timing?: Record<string, unknown>;
    /** What is engraved on the casebacks, by key. */
    engravings?: Record<string, number>;
  }
) {
  const value = JSON.stringify({
    state: {
      progress: {
        best: progress.best ?? {},
        unlocked: progress.unlocked ?? ['diver'],
        ...(progress.points !== undefined && { points: progress.points }),
      },
      selected: progress.selected ?? 'diver',
      timing: progress.timing,
      engravings: progress.engravings,
    },
    version: SAVE_VERSION,
  });
  await page.addInitScript(
    ([key, saved]) => {
      // Only on the first load, so a reload reads what the app saved.
      if (sessionStorage.getItem('seeded') === null) {
        localStorage.setItem(key, saved);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [SAVE_KEY, value] as const
  );
}

/** Every watch, unlocked. */
export const ALL_UNLOCKED: string[] = [...WATCH_ORDER];

/** The current sweep, read from the page; fails outside a round. */
export async function currentSegment(page: Page): Promise<Segment> {
  const state = await gameState(page);
  if (state.phase !== 'playing') throw new Error(`Not playing: ${state.phase}`);
  return state.round.segment;
}

interface PressPlan {
  /** Degrees past each target's centre to press at; 0 is dead centre. */
  readonly progress?: number;
  readonly touch: boolean;
  /** Presses at most this many times. */
  readonly presses: number;
  /**
   * Stops, without pressing, on the first sweep with this twist (a
   * chronograph pair's start mark, a GMT gate, a hidden target, a sway, a
   * hack, a cloud, a countdown).
   */
  readonly until?:
    'chrono' | 'gmt' | 'moon' | 'sway' | 'hack' | 'cloud' | 'countdown';
}

/**
 * Presses on sweep after sweep, all inside the page: it waits for each new
 * sweep, works out the moment from the game's own numbers and fires the
 * press itself (a Space key or a finger). Nothing waits on a round trip to
 * the test, so even at full speed, on a slow software-rendered page, every
 * press lands within a millisecond. Returns the number of presses made.
 */
export function pressInPage(page: Page, plan: PressPlan): Promise<number> {
  return page.evaluate(async ({ progress = 0, touch, presses, until }) => {
    const HANDOVER_MS = 500;
    const hooks = (window as unknown as { __tickPerfect: TestHooks })
      .__tickPerfect;
    const sleep = (ms: number) =>
      new Promise(resolve => {
        setTimeout(resolve, ms);
      });
    let previous: Segment | null = null;
    /** The next sweep after `previous`, or null once the round is over. */
    const nextSweep = async (): Promise<Segment | null> => {
      for (;;) {
        const { state } = hooks.snapshot();
        if (state.phase === 'gameOver' || state.phase === 'idle') return null;
        if (state.phase === 'playing' && state.round.segment !== previous) {
          return state.round.segment;
        }
        await sleep(2);
      }
    };
    for (let made = 0; made < presses; made++) {
      const segment = await nextSweep();
      if (!segment) return made;
      previous = segment;
      const twist = segment.twist;
      if (
        until &&
        twist?.kind === until &&
        !(twist.kind === 'chrono' && twist.leg === 'stop')
      ) {
        return made;
      }
      const closing = segment.speed - segment.direction * segment.ringVelocity;
      // A hacked hand stands for a while on its way, and the moment with it.
      const held =
        twist?.kind === 'hack' && twist.at < progress ? twist.holdMs : 0;
      const at =
        segment.startTime +
        ((segment.approach + progress) / closing) * 1000 +
        held;
      // Hand over well before the moment, then hold the thread: under
      // software rendering a single frame can outlast a short timer.
      while (performance.now() < at - HANDOVER_MS) await sleep(2);
      while (performance.now() < at) {
        // Waiting for the moment.
      }
      if (touch) {
        document.querySelector('[data-testid="game-surface"]')?.dispatchEvent(
          new PointerEvent('pointerdown', {
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
          })
        );
      } else {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: ' ',
            code: 'Space',
            bubbles: true,
          })
        );
      }
    }
    return presses;
  }, plan);
}

/** Picks a watch on the title screen and starts a round on it. */
export async function playWatch(page: Page, name: string) {
  await page
    .getByRole('radio', { name: new RegExp(`^${name},`) })
    .click({ timeout: SCENE_TIMEOUT });
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    new RegExp(`^${name}`)
  );
  await startGame(page);
}

/**
 * Pins the page's Date (and only Date) to `at`; `setDate` moves it later.
 * Playwright's clock would do it too, but it also takes over
 * performance.now, the timers and requestAnimationFrame, which the game
 * times its rounds by against real input events.
 */
export async function pinDate(page: Page, at: Date) {
  await page.addInitScript(time => {
    const RealDate = Date;
    const pinned = { now: time };
    class PinnedDate extends RealDate {
      constructor(...args: [] | [number, number]) {
        // A date given in full (a time, or year, month, …) is left alone.
        if (args.length === 0) super(pinned.now);
        else super(...args);
      }
      static override now() {
        return pinned.now;
      }
    }
    Object.assign(window, {
      Date: PinnedDate,
      __pinDate: (next: number) => {
        pinned.now = next;
      },
    });
  }, at.getTime());
}

/** Moves a pinned Date on. */
export async function setDate(page: Page, at: Date) {
  await page.evaluate(time => {
    (window as unknown as { __pinDate: (time: number) => void }).__pinDate(
      time
    );
  }, at.getTime());
}
