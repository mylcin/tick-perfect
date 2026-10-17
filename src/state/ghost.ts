import {
  MAX_LOGGED_ACTIONS,
  replayRound,
  type GameRules,
  type ReplayResult,
  type RoundLog,
} from '../game';

// A ghost is a round kept to race: its seed, its score and the moments of
// its taps in played time (pauses taken out). Played through the engine on
// the same seed it is that round again, tap for tap, so racing it means
// meeting the same first target and seeing where its hand went from there.
// Kept on this device only: the best round on each watch, and today's best
// Daily.

export interface GhostRun {
  readonly seed: number;
  readonly score: number;
  /** Each tap, in ms of play after the start; ascending. */
  readonly taps: readonly number[];
}

/** The day's best Daily round, kept to race on its retries. */
export interface DailyGhost extends GhostRun {
  readonly number: number;
  readonly watch: string;
}

export interface Ghosts {
  /** Each watch's best collection round. */
  readonly best: Readonly<Record<string, GhostRun>>;
  readonly daily: DailyGhost | null;
}

export const NO_GHOSTS: Ghosts = { best: {}, daily: null };

/** The ghost of the round `log` played, which scored `score`. */
export function ghostOf(log: RoundLog, score: number): GhostRun {
  const taps: number[] = [];
  let paused = 0;
  let pausedAt: number | null = null;
  for (const [kind, time] of log.actions) {
    if (kind === 'pause') {
      pausedAt = time;
    } else if (kind === 'resume') {
      paused += time - (pausedAt ?? time);
      pausedAt = null;
    } else {
      taps.push(time - log.start - paused);
    }
  }
  return { seed: log.seed, score, taps };
}

/** The ghost as a log the engine replays, from moment 0. */
export function ghostLog(ghost: GhostRun): RoundLog {
  return {
    seed: ghost.seed,
    start: 0,
    actions: ghost.taps.map(time => ['tap', time] as const),
  };
}

/**
 * The ghost played through `rules`, or null if it no longer plays as it
 * did (the rules changed since): a ghost that scores otherwise isn't the
 * round it was.
 */
export function checkGhost(
  rules: GameRules,
  ghost: GhostRun
): ReplayResult | null {
  const result = replayRound(rules, ghostLog(ghost));
  return 'rejected' in result || result.score !== ghost.score ? null : result;
}

/** The better of two ghosts: the higher score, the first on a tie. */
function better<T extends GhostRun>(a: T | undefined, b: T): T {
  return a && a.score >= b.score ? a : b;
}

/** Two tabs' ghosts together: each watch's better one, the later Daily's. */
export function mergeGhosts(a: Ghosts, b: Ghosts): Ghosts {
  const best: Record<string, GhostRun> = { ...a.best };
  for (const [watch, ghost] of Object.entries(b.best)) {
    best[watch] = better(best[watch], ghost);
  }
  const daily = !a.daily
    ? b.daily
    : !b.daily
      ? a.daily
      : a.daily.number === b.daily.number
        ? better(a.daily, b.daily)
        : a.daily.number > b.daily.number
          ? a.daily
          : b.daily;
  return { best, daily };
}

const WATCH = /^[a-z][A-Za-z0-9]{0,31}$/;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A saved ghost, if it is one: a seed, a score and ascending taps. */
export function restoreGhost(saved: unknown): GhostRun | null {
  if (typeof saved !== 'object' || saved === null) return null;
  const { seed, score, taps } = saved as Readonly<Record<string, unknown>>;
  if (
    !isCount(seed) ||
    seed > 0xffffffff ||
    !isCount(score) ||
    !Array.isArray(taps) ||
    taps.length > MAX_LOGGED_ACTIONS
  ) {
    return null;
  }
  let last = 0;
  for (const tap of taps as unknown[]) {
    if (typeof tap !== 'number' || !Number.isFinite(tap) || tap < last) {
      return null;
    }
    last = tap;
  }
  return { seed, score, taps: taps as number[] };
}

/** Saved ghosts read back: the valid ones, at most one a known-looking watch. */
export function restoreGhosts(saved: unknown): Ghosts {
  if (typeof saved !== 'object' || saved === null) return NO_GHOSTS;
  const { best, daily } = saved as Readonly<Record<string, unknown>>;
  const ghosts: Record<string, GhostRun> = {};
  if (typeof best === 'object' && best !== null && !Array.isArray(best)) {
    for (const [watch, value] of Object.entries(best).slice(0, 32)) {
      const ghost = restoreGhost(value);
      if (WATCH.test(watch) && ghost) ghosts[watch] = ghost;
    }
  }
  const dailyGhost = restoreGhost(daily);
  const { number, watch } = (daily ?? {}) as Readonly<Record<string, unknown>>;
  return {
    best: ghosts,
    daily:
      dailyGhost &&
      isCount(number) &&
      number >= 1 &&
      typeof watch === 'string' &&
      WATCH.test(watch)
        ? { ...dailyGhost, number, watch }
        : null,
  };
}
