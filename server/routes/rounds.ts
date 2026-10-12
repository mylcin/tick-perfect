import {
  dailyNumber,
  dailySeed,
  MAX_LOGGED_ACTIONS,
  replayRound,
  type LoggedAction,
  type RoundLog,
} from '../../src/game/index.js';
import { dailyWatch } from '../../src/state/daily.js';
import { isWatchId, type WatchId } from '../../src/watches/index.js';
import type { Deps } from '../deps.js';
import { ApiError, json, objectBody, readJson } from '../http.js';
import { requireProfile, type Profile } from '../profiles.js';
import { spend } from '../rate-limit.js';
import { liveSeason, rulesById, seasonJson } from '../seasons.js';
import { readSettings } from '../settings.js';

// A ranked round in two calls. The page asks for one as the player starts:
// the server picks the seed, so no one can pick an easy round, and notes
// when. When it ends, the page sends back every tap; the server plays them
// through the same engine, and only the score that replay gives counts.

/** How long a round may take to come back, starts and pauses included. */
const ROUND_LIFETIME_MS = 6 * 60 * 60 * 1000;
/** A log can't cover more time than passed on the server, give or take. */
const CLOCK_SLACK_MS = 2000;
/**
 * Timing steadier than this, over this many hits, is a script's; such a
 * round waits for an admin rather than going straight on the board.
 */
const BOT_SPREAD_MS = 3;
const BOT_MIN_HITS = 20;
/** Room for a log of MAX_LOGGED_ACTIONS, each time at full precision. */
const SUBMIT_LIMIT_BYTES = 128 * 1024;

const START_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };
const START_LIMIT_BY_ADDRESS = { limit: 300, windowMs: 10 * 60 * 1000 };
const SUBMIT_LIMIT = { limit: 120, windowMs: 10 * 60 * 1000 };

async function requireOpen(deps: Deps): Promise<void> {
  const settings = await readSettings(deps);
  if (!settings['leaderboard.enabled'] || !settings['submissions.enabled']) {
    throw new ApiError(503, 'closed', 'The leaderboard is closed for now');
  }
}

/** Today's Daily number by the server's calendar (UTC). */
function serverDaily(now: Date): number {
  return dailyNumber({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  });
}

/** POST /api/rounds: a seed for a round about to start. */
export async function startRound(
  request: Request,
  deps: Deps,
  address: string
): Promise<Response> {
  const player = await requireProfile(request, deps);
  const body = objectBody(await readJson(request, 4096));
  await requireOpen(deps);
  const now = deps.now();
  await spend(deps.sql, `start:${player.id}`, START_LIMIT, now);
  await spend(deps.sql, `start@${address}`, START_LIMIT_BY_ADDRESS, now);

  const watch = body['watch'];
  if (!isWatchId(watch)) throw new ApiError(400, 'badWatch', 'Unknown watch');
  const daily = body['daily'];
  let seed: number;
  if (daily === undefined || daily === null) {
    seed = deps.randomSeed();
  } else {
    // Local dates run a day either side of the server's.
    if (
      typeof daily !== 'number' ||
      !Number.isInteger(daily) ||
      Math.abs(daily - serverDaily(now)) > 1
    ) {
      throw new ApiError(400, 'badDaily', 'That Daily is not open');
    }
    if (dailyWatch(daily) !== watch) {
      throw new ApiError(400, 'badWatch', 'That Daily is on another watch');
    }
    seed = dailySeed(daily);
  }

  const season = await liveSeason(deps, watch);
  const expires = new Date(now.getTime() + ROUND_LIFETIME_MS);
  const [row] = await deps.sql.transaction(async sql => {
    // One round at a time: asking for another gives up the last.
    await sql.query(
      `update game.rounds set status = 'abandoned'
       where user_id = $1 and status = 'issued'`,
      [player.id]
    );
    return sql.query<{ id: string }>(
      `insert into game.rounds
         (user_id, watch_id, season_id, daily_number, ruleset_id, seed,
          issued_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        player.id,
        watch,
        typeof daily === 'number' ? null : season.id,
        typeof daily === 'number' ? daily : null,
        season.ruleset.id,
        seed,
        now,
        expires,
      ]
    );
  });
  return json(
    {
      id: row?.id,
      watch,
      seed,
      daily: typeof daily === 'number' ? daily : null,
      season: seasonJson(season),
      rules: season.ruleset.rules,
      expiresAt: expires.toISOString(),
    },
    { status: 201 }
  );
}

const KINDS = new Set(['tap', 'pause', 'resume']);

/** The log in a submission, or an error saying what is wrong with it. */
function parseLog(value: unknown): RoundLog {
  const log = value as Partial<Record<keyof RoundLog, unknown>> | null;
  const actions = log?.actions;
  if (
    typeof log?.seed !== 'number' ||
    typeof log.start !== 'number' ||
    !Array.isArray(actions) ||
    actions.length > MAX_LOGGED_ACTIONS
  ) {
    throw new ApiError(400, 'badLog', 'The round log is malformed');
  }
  for (const action of actions) {
    if (
      !Array.isArray(action) ||
      action.length !== 2 ||
      !KINDS.has(action[0] as string) ||
      typeof action[1] !== 'number'
    ) {
      throw new ApiError(400, 'badLog', 'The round log is malformed');
    }
  }
  return {
    seed: log.seed,
    start: log.start,
    actions: actions as LoggedAction[],
  };
}

function spreadOf(errors: readonly number[]): number {
  if (errors.length === 0) return 0;
  const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  return Math.sqrt(
    errors.reduce((sum, value) => sum + (value - mean) ** 2, 0) / errors.length
  );
}

interface RoundRow {
  id: string;
  user_id: string;
  watch_id: WatchId;
  season_id: number | null;
  daily_number: number | null;
  ruleset_id: number;
  seed: number;
  status: string;
  issued_at: Date;
  expires_at: Date;
}

/** The board a round counts on. */
function boardOf(round: {
  season_id: number | null;
  daily_number: number | null;
}): string {
  return round.daily_number === null
    ? `season:${String(round.season_id)}`
    : `daily:${String(round.daily_number)}`;
}

/** Puts a verified round on its board, if it beats the player's best. */
export async function putOnBoard(
  deps: Deps,
  round: {
    id: string;
    user_id: string;
    season_id: number | null;
    daily_number: number | null;
  },
  score: number,
  at: Date
): Promise<void> {
  await deps.sql.query(
    `insert into game.best_scores (board, user_id, score, round_id, achieved_at)
     values ($1, $2, $3, $4, $5)
     on conflict (board, user_id) do update
       set score = excluded.score,
           round_id = excluded.round_id,
           achieved_at = excluded.achieved_at
       where excluded.score > game.best_scores.score`,
    [boardOf(round), round.user_id, score, round.id, at]
  );
}

/** A player's standing on a board: their best and its rank, if any. */
export async function standingOn(
  deps: Deps,
  board: string,
  userId: string
): Promise<{ score: number; rank: number } | null> {
  const [row] = await deps.sql.query<{ score: number; rank: number }>(
    `select b.score,
       (select count(*) + 1 from game.best_scores o
        join game.profiles p on p.id = o.user_id
        where o.board = b.board and p.banned_at is null
          and (o.score > b.score
               or (o.score = b.score and o.achieved_at < b.achieved_at))
       )::int as rank
     from game.best_scores b
     where b.board = $1 and b.user_id = $2`,
    [board, userId]
  );
  return row ?? null;
}

/** POST /api/rounds/:id: the round's log, replayed and judged. */
export async function submitRound(
  request: Request,
  deps: Deps,
  id: string
): Promise<Response> {
  const player: Profile = await requireProfile(request, deps);
  const body = objectBody(await readJson(request, SUBMIT_LIMIT_BYTES));
  await requireOpen(deps);
  const now = deps.now();
  await spend(deps.sql, `submit:${player.id}`, SUBMIT_LIMIT, now);
  const log = parseLog(body['log']);
  const claimed = body['score'];
  const clientVersion =
    typeof body['clientVersion'] === 'string'
      ? body['clientVersion'].slice(0, 40)
      : null;

  const [round] = await deps.sql.query<RoundRow>(
    `select id, user_id, watch_id, season_id, daily_number, ruleset_id, seed,
       status, issued_at, expires_at
     from game.rounds where id = $1 and user_id = $2`,
    [id, player.id]
  );
  if (!round) throw new ApiError(404, 'noRound', 'No such round');
  if (round.status !== 'issued') {
    throw new ApiError(409, 'alreadyIn', 'That round is already in');
  }
  if (round.expires_at <= now) {
    await deps.sql.query(
      `update game.rounds set status = 'abandoned' where id = $1`,
      [id]
    );
    throw new ApiError(410, 'expired', 'That round has expired');
  }

  // A refused round keeps why, never its log: anyone signed in could
  // otherwise fill the database with logs that were never going to count.
  const reject = async (reason: string) => {
    await deps.sql.query(
      `update game.rounds
       set status = 'rejected', review_note = $2, submitted_at = $3,
           client_version = $4
       where id = $1`,
      [id, reason, now, clientVersion]
    );
    return json({ status: 'rejected', reason });
  };

  if (log.seed !== round.seed) return reject('seed');
  const rules = await rulesById(deps, round.ruleset_id);
  if (!rules) throw new ApiError(500, 'badRules', 'Its rules are unreadable');
  const result = replayRound(rules, log);
  if ('rejected' in result) return reject(result.rejected);
  if (claimed !== result.score) return reject('mismatch');
  if (
    result.elapsedMs >
    now.getTime() - round.issued_at.getTime() + CLOCK_SLACK_MS
  ) {
    return reject('tooSoon');
  }

  const spread = spreadOf(result.errors);
  const status =
    result.hits >= BOT_MIN_HITS && spread < BOT_SPREAD_MS
      ? 'flagged'
      : 'verified';
  await deps.sql.query(
    `update game.rounds
     set status = $2, submitted_at = $3, log = $4::jsonb, score = $5,
         hits = $6, perfects = $7, best_streak = $8, timing_spread = $9,
         client_version = $10
     where id = $1`,
    [
      id,
      status,
      now,
      JSON.stringify(log),
      result.score,
      result.hits,
      result.perfects,
      result.bestStreak,
      spread,
      clientVersion,
    ]
  );
  const board = boardOf(round);
  if (status === 'verified') await putOnBoard(deps, round, result.score, now);
  const standing = await standingOn(deps, board, player.id);
  return json({
    status,
    score: result.score,
    board,
    best: standing?.score ?? null,
    rank: standing?.rank ?? null,
  });
}
