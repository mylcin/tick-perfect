import {
  checkRules,
  medianOf,
  simulatedScores,
  type GameRules,
} from '../../src/game/index.js';
import {
  isWatchId,
  WATCH_ORDER,
  type WatchId,
} from '../../src/watches/index.js';
import { hashOf } from '../canonical.js';
import type { Deps } from '../deps.js';
import type { ErrorSource } from '../errors.js';
import { ApiError, json, objectBody, readJson } from '../http.js';
import { audit, requireProfile } from '../profiles.js';
import { ensureSeasons, liveSeasons, seasonJson } from '../seasons.js';
import { isSettingKey, readSettings, SETTINGS } from '../settings.js';
import { putOnBoard } from './rounds.js';

// The admin panel's API. Admins moderate (flagged rounds, bans) and draft
// rule sets; super admins also publish them, run events and flip the
// switches. Every change is written to the audit log.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Simulated players of each steadiness, as balance.test.ts uses them. */
const PREVIEW_SIGMAS = [12, 18, 25, 35, 45] as const;
const PREVIEW_ROUNDS = 60;

/**
 * Checks a rule set and plays it: the typed rules and how simulated players
 * score, or the problems that stop it.
 */
function tryRules(value: unknown): {
  rules: GameRules;
  preview: { sigma: number; median: number; p90: number }[];
} {
  const check = checkRules(value);
  if (!check.ok) throw new ApiError(422, 'badRules', check.errors.join('\n'));
  try {
    const preview = PREVIEW_SIGMAS.map(sigma => {
      const scores = simulatedScores(check.rules, sigma, PREVIEW_ROUNDS);
      return {
        sigma,
        median: medianOf(scores),
        p90: scores[Math.floor(scores.length * 0.9)] ?? 0,
      };
    });
    return { rules: check.rules, preview };
  } catch (error) {
    // The engine refuses some combinations that pass every range check.
    throw new ApiError(
      422,
      'unplayable',
      error instanceof Error ? error.message : 'These rules can’t be played'
    );
  }
}

function watchParam(value: unknown): WatchId {
  if (!isWatchId(value)) throw new ApiError(400, 'badWatch', 'Unknown watch');
  return value;
}

/** GET /api/admin/overview */
export async function overview(
  request: Request,
  deps: Deps
): Promise<Response> {
  const admin = await requireProfile(request, deps, 'admin');
  const [live, flagged, settings, errors] = await Promise.all([
    liveSeasons(deps),
    deps.sql.query<{ count: number }>(
      `select count(*)::int as count from game.rounds where status = 'flagged'`
    ),
    readSettings(deps),
    deps.sql.query<{ source: ErrorSource; count: number }>(
      `select source, sum(count)::int as count from game.error_reports
       where hour >= $1 group by source`,
      [new Date(deps.now().getTime() - DAY_MS)]
    ),
  ]);
  return json({
    you: admin,
    seasons: WATCH_ORDER.flatMap(watch => {
      const season = live.get(watch);
      return season
        ? [{ ...seasonJson(season), rules: season.ruleset.rules }]
        : [];
    }),
    flagged: flagged[0]?.count ?? 0,
    settings,
    // The last day's errors, by where they came from.
    errors: Object.fromEntries(
      (['api', 'page', 'csp'] as const).map(source => [
        source,
        errors.find(row => row.source === source)?.count ?? 0,
      ])
    ),
  });
}

/** GET /api/admin/rulesets?watch= */
export async function listRulesets(
  request: Request,
  url: URL,
  deps: Deps
): Promise<Response> {
  await requireProfile(request, deps, 'admin');
  // Version 1, the game's own rules, always comes first.
  await ensureSeasons(deps);
  const watch = watchParam(url.searchParams.get('watch'));
  const rows = await deps.sql.query<{
    id: number;
    version: number;
    rules_hash: string;
    note: string | null;
    created_at: Date;
    author: string | null;
    rules: unknown;
  }>(
    `select r.id, r.version, r.rules_hash, r.note, r.created_at, r.rules,
       p.display_name as author
     from game.rulesets r left join game.profiles p on p.id = r.created_by
     where r.watch_id = $1 order by r.version desc`,
    [watch]
  );
  return json({
    watch,
    rulesets: rows.map(row => ({
      id: row.id,
      version: row.version,
      hash: row.rules_hash,
      note: row.note,
      createdAt: row.created_at.toISOString(),
      author: row.author,
      rules: row.rules,
    })),
  });
}

/** POST /api/admin/rulesets/preview: checks and simulates, saves nothing. */
export async function previewRules(
  request: Request,
  deps: Deps
): Promise<Response> {
  await requireProfile(request, deps, 'admin');
  const body = objectBody(await readJson(request, 64 * 1024));
  const { preview } = tryRules(body['rules']);
  return json({ preview });
}

/** POST /api/admin/rulesets: a new version of a watch's rules. */
export async function createRuleset(
  request: Request,
  deps: Deps
): Promise<Response> {
  const admin = await requireProfile(request, deps, 'admin');
  // Version 1, the game's own rules, always comes first.
  await ensureSeasons(deps);
  const body = objectBody(await readJson(request, 64 * 1024));
  const watch = watchParam(body['watch']);
  const note =
    typeof body['note'] === 'string' ? body['note'].slice(0, 500) : null;
  const { rules, preview } = tryRules(body['rules']);
  const hash = await hashOf(rules);
  const [row] = await deps.sql.query<{ id: number; version: number }>(
    `insert into game.rulesets (watch_id, version, rules, rules_hash, note, created_by)
     select $1, coalesce(max(version), 0) + 1, $2::jsonb, $3, $4, $5
     from game.rulesets where watch_id = $1
     returning id, version`,
    [watch, JSON.stringify(rules), hash, note, admin.id]
  );
  await audit(
    deps,
    admin,
    'ruleset.create',
    `${watch}#${String(row?.version)}`,
    {
      note,
    }
  );
  return json(
    { id: row?.id, version: row?.version, hash, preview },
    { status: 201 }
  );
}

/**
 * POST /api/admin/seasons: plays a ruleset from now on. A standard season
 * ends the watch's current one and opens a fresh board; an event runs on
 * its own board between two times.
 */
export async function publishSeason(
  request: Request,
  deps: Deps
): Promise<Response> {
  const admin = await requireProfile(request, deps, 'super_admin');
  // Version 1, the game's own rules, always comes first.
  await ensureSeasons(deps);
  const body = objectBody(await readJson(request, 4096));
  const watch = watchParam(body['watch']);
  const rulesetId = body['rulesetId'];
  if (typeof rulesetId !== 'number' || !Number.isInteger(rulesetId)) {
    throw new ApiError(400, 'badRuleset', 'Name a ruleset by its id');
  }
  const kind = body['kind'] === 'event' ? 'event' : 'standard';
  const name =
    typeof body['name'] === 'string' ? body['name'].trim().slice(0, 60) : null;
  const [ruleset] = await deps.sql.query<{ id: number }>(
    'select id from game.rulesets where id = $1 and watch_id = $2',
    [rulesetId, watch]
  );
  if (!ruleset)
    throw new ApiError(404, 'noRuleset', 'No such ruleset for that watch');
  const now = deps.now();

  let id: number | undefined;
  if (kind === 'standard') {
    id = await deps.sql.transaction(async sql => {
      await sql.query(
        // Never before it began, even when published twice in a moment.
        `update game.seasons
         set ends_at = greatest($2, starts_at + interval '1 millisecond')
         where watch_id = $1 and kind = 'standard' and ends_at is null`,
        [watch, now]
      );
      const [row] = await sql.query<{ id: number }>(
        `insert into game.seasons (watch_id, ruleset_id, kind, name, starts_at, created_by)
         values ($1, $2, 'standard', $3, $4, $5) returning id`,
        [watch, ruleset.id, name, now, admin.id]
      );
      return row?.id;
    });
  } else {
    const startsAt = new Date(String(body['startsAt']));
    const endsAt = new Date(String(body['endsAt']));
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt ||
      endsAt <= now
    ) {
      throw new ApiError(
        400,
        'badTimes',
        'An event needs a start before its end, ending in the future'
      );
    }
    const [row] = await deps.sql.query<{ id: number }>(
      `insert into game.seasons (watch_id, ruleset_id, kind, name, starts_at, ends_at, created_by)
       values ($1, $2, 'event', $3, $4, $5, $6) returning id`,
      [watch, ruleset.id, name, startsAt, endsAt, admin.id]
    );
    id = row?.id;
  }
  await audit(deps, admin, `season.${kind}`, `${watch}:${String(id)}`, {
    rulesetId: ruleset.id,
    name,
  });
  return json({ id }, { status: 201 });
}

/** PUT /api/admin/settings: one switch. */
export async function putSetting(
  request: Request,
  deps: Deps
): Promise<Response> {
  const admin = await requireProfile(request, deps, 'super_admin');
  const body = objectBody(await readJson(request, 4096));
  const key = body['key'];
  const value = body['value'];
  if (
    typeof key !== 'string' ||
    !isSettingKey(key) ||
    !SETTINGS[key].accepts(value)
  ) {
    throw new ApiError(
      400,
      'badSetting',
      'Unknown setting, or a value it doesn’t take'
    );
  }
  await deps.sql.query(
    `insert into game.app_settings (key, value, updated_by, updated_at)
     values ($1, $2::jsonb, $3, $4)
     on conflict (key) do update
       set value = excluded.value, updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), admin.id, deps.now()]
  );
  await audit(deps, admin, 'setting.put', key, { value });
  return json({ settings: await readSettings(deps) });
}

/** GET /api/admin/rounds?status=flagged */
export async function listRounds(
  request: Request,
  url: URL,
  deps: Deps
): Promise<Response> {
  await requireProfile(request, deps, 'admin');
  const status = url.searchParams.get('status') ?? 'flagged';
  if (!['flagged', 'rejected', 'verified'].includes(status)) {
    throw new ApiError(400, 'badStatus', 'Unknown status');
  }
  const rows = await deps.sql.query<{
    id: string;
    watch_id: string;
    score: number | null;
    hits: number | null;
    timing_spread: number | null;
    review_note: string | null;
    submitted_at: Date | null;
    user_id: string;
    display_name: string;
    banned_at: Date | null;
  }>(
    `select r.id, r.watch_id, r.score, r.hits, r.timing_spread, r.review_note,
       r.submitted_at, r.user_id, p.display_name, p.banned_at
     from game.rounds r join game.profiles p on p.id = r.user_id
     where r.status = $1::game.round_status
     order by r.submitted_at desc nulls last limit 100`,
    [status]
  );
  return json({
    rounds: rows.map(row => ({
      id: row.id,
      watch: row.watch_id,
      score: row.score,
      hits: row.hits,
      spread: row.timing_spread,
      note: row.review_note,
      submittedAt: row.submitted_at?.toISOString() ?? null,
      player: {
        id: row.user_id,
        name: row.display_name,
        banned: row.banned_at !== null,
      },
    })),
  });
}

/** PATCH /api/admin/rounds/:id: a flagged round let onto the board, or not. */
export async function reviewRound(
  request: Request,
  deps: Deps,
  id: string
): Promise<Response> {
  const admin = await requireProfile(request, deps, 'admin');
  const body = objectBody(await readJson(request, 4096));
  const verdict = body['status'];
  if (verdict !== 'verified' && verdict !== 'rejected') {
    throw new ApiError(400, 'badStatus', 'Verify or reject');
  }
  const note =
    typeof body['note'] === 'string' ? body['note'].slice(0, 300) : null;
  const [round] = await deps.sql.query<{
    id: string;
    user_id: string;
    season_id: number | null;
    daily_number: number | null;
    score: number | null;
  }>(
    `update game.rounds set status = $2::game.round_status,
       review_note = coalesce($3, review_note), reviewed_by = $4
     where id = $1 and status = 'flagged'
     returning id, user_id, season_id, daily_number, score`,
    [id, verdict, note, admin.id]
  );
  if (!round) throw new ApiError(404, 'noRound', 'No flagged round by that id');
  if (verdict === 'verified' && round.score !== null) {
    await putOnBoard(deps, round, round.score, deps.now());
  }
  await audit(deps, admin, `round.${verdict}`, id, { note });
  return json({ id, status: verdict });
}

/** GET /api/admin/users?q= */
export async function findUsers(
  request: Request,
  url: URL,
  deps: Deps
): Promise<Response> {
  await requireProfile(request, deps, 'admin');
  const query = (url.searchParams.get('q') ?? '').slice(0, 40);
  const rows = await deps.sql.query<{
    id: string;
    display_name: string;
    role: string;
    banned_at: Date | null;
    created_at: Date;
  }>(
    `select id, display_name, role, banned_at, created_at from game.profiles
     where display_name ilike '%' || $1 || '%' or id::text = $1
     order by created_at desc limit 50`,
    [query.replace(/[\\%_]/g, match => `\\${match}`)]
  );
  return json({
    users: rows.map(row => ({
      id: row.id,
      name: row.display_name,
      role: row.role,
      banned: row.banned_at !== null,
      createdAt: row.created_at.toISOString(),
    })),
  });
}

/** POST /api/admin/users/:id/ban: bans or lifts a ban. */
export async function banUser(
  request: Request,
  deps: Deps,
  id: string
): Promise<Response> {
  const admin = await requireProfile(request, deps, 'admin');
  const body = objectBody(await readJson(request, 1024));
  const banned = body['banned'] === true;
  if (id === admin.id)
    throw new ApiError(400, 'self', 'You can’t ban yourself');
  const [row] = await deps.sql.query<{ role: string }>(
    `update game.profiles set banned_at = $2
     where id = $1 and role = 'player' returning role`,
    [id, banned ? deps.now() : null]
  );
  if (!row)
    throw new ApiError(
      404,
      'noPlayer',
      'No player by that id (admins can’t be banned)'
    );
  await audit(deps, admin, banned ? 'user.ban' : 'user.unban', id);
  return json({ id, banned });
}

/** GET /api/admin/audit */
export async function auditLog(
  request: Request,
  deps: Deps
): Promise<Response> {
  await requireProfile(request, deps, 'super_admin');
  const rows = await deps.sql.query<{
    id: number;
    action: string;
    target: string | null;
    payload: unknown;
    at: Date;
    actor: string | null;
  }>(
    `select a.id, a.action, a.target, a.payload, a.at, p.display_name as actor
     from game.audit_log a left join game.profiles p on p.id = a.actor
     order by a.at desc, a.id desc limit 200`
  );
  return json({
    entries: rows.map(row => ({ ...row, at: row.at.toISOString() })),
  });
}

const ERROR_DAYS = [1, 7, 30];

/** GET /api/admin/errors?days=: errors by kind, the latest first. */
export async function listErrors(
  request: Request,
  url: URL,
  deps: Deps
): Promise<Response> {
  await requireProfile(request, deps, 'admin');
  const asked = Number(url.searchParams.get('days') ?? 1);
  const days = ERROR_DAYS.includes(asked) ? asked : 1;
  const rows = await deps.sql.query<{
    fingerprint: string;
    source: ErrorSource;
    count: number;
    first_at: Date;
    last_at: Date;
    message: string;
    detail: unknown;
  }>(
    `select fingerprint, source, sum(count)::int as count,
       min(first_at) as first_at, max(last_at) as last_at,
       (array_agg(message order by last_at desc))[1] as message,
       (array_agg(detail order by last_at desc))[1] as detail
     from game.error_reports where hour >= $1
     group by fingerprint, source
     order by max(last_at) desc limit 100`,
    [new Date(deps.now().getTime() - days * DAY_MS)]
  );
  return json({
    days,
    errors: rows.map(row => ({
      id: row.fingerprint,
      source: row.source,
      count: row.count,
      firstAt: row.first_at.toISOString(),
      lastAt: row.last_at.toISOString(),
      message: row.message,
      detail: row.detail,
    })),
  });
}
