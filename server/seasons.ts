import { checkRules, type GameRules } from '../src/game/index.js';
import { WATCH_ORDER, WATCHES, type WatchId } from '../src/watches/index.js';
import { hashOf } from './canonical.js';
import type { Deps } from './deps.js';
import { ApiError } from './http.js';

// Every watch plays by a rule set, and every rule set has a board. The
// first version of each watch's rules is the one the game ships with, and
// so is each the game is retuned to; an admin's change is a new version
// too, and publishing either opens a new season.

interface Season {
  readonly id: number;
  readonly watch: WatchId;
  readonly kind: 'standard' | 'event';
  readonly name: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly ruleset: {
    readonly id: number;
    readonly version: number;
    readonly hash: string;
    readonly rules: GameRules;
  };
}

interface SeasonRow {
  id: number;
  watch_id: WatchId;
  kind: 'standard' | 'event';
  name: string | null;
  starts_at: Date;
  ends_at: Date | null;
  ruleset_id: number;
  version: number;
  rules_hash: string;
  rules: unknown;
}

const SEASON_COLUMNS = `
  s.id, s.watch_id, s.kind, s.name, s.starts_at, s.ends_at,
  r.id as ruleset_id, r.version, r.rules_hash, r.rules`;

function toSeason(row: SeasonRow): Season {
  const check = checkRules(row.rules);
  // Stored rules were checked going in; a failure here is a broken database.
  if (!check.ok) {
    throw new ApiError(
      500,
      'badRules',
      `Ruleset ${String(row.ruleset_id)}: ${check.errors.join('; ')}`
    );
  }
  return {
    id: row.id,
    watch: row.watch_id,
    kind: row.kind,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    ruleset: {
      id: row.ruleset_id,
      version: row.version,
      hash: row.rules_hash,
      rules: check.rules,
    },
  };
}

/** How a rule set the game shipped with is noted, set by no admin. */
const SHIPPED = 'As the game ships';

/** Each watch's shipped rules' hash, worked out once per instance. */
const shippedHashes = new Map<WatchId, Promise<string>>();

function shippedHash(watch: WatchId): Promise<string> {
  let hash = shippedHashes.get(watch);
  if (!hash) {
    hash = hashOf(WATCHES[watch].rules);
    shippedHashes.set(watch, hash);
  }
  return hash;
}

/**
 * Plays every watch by the rules the game ships with, unless an admin has
 * published others: a watch without a current season gets one, and a
 * season on the game's own rules moves to a fresh board when a deploy
 * retunes them. Safe to run any number of times, at once.
 */
export async function ensureSeasons(deps: Deps): Promise<void> {
  const rows = await deps.sql.query<{
    watch_id: string;
    rules_hash: string;
    shipped: boolean;
  }>(
    `select s.watch_id, r.rules_hash,
       r.created_by is null and r.note = $1 as shipped
     from game.seasons s join game.rulesets r on r.id = s.ruleset_id
     where s.kind = 'standard' and s.ends_at is null`,
    [SHIPPED]
  );
  const current = new Map(rows.map(row => [row.watch_id, row]));
  for (const watch of WATCH_ORDER) {
    const { rules } = WATCHES[watch];
    const hash = await shippedHash(watch);
    const season = current.get(watch);
    if (season && (!season.shipped || season.rules_hash === hash)) continue;
    await deps.sql.transaction(async sql => {
      // These rules, as shipped before (a rollback) or as a new version.
      await sql.query(
        `insert into game.rulesets (watch_id, version, rules, rules_hash, note)
         select $1, coalesce(max(version), 0) + 1, $2::jsonb, $3, $4
         from game.rulesets where watch_id = $1
         having not exists (
           select 1 from game.rulesets
           where watch_id = $1 and rules_hash = $3
             and note = $4 and created_by is null
         )
         on conflict (watch_id, version) do nothing`,
        [watch, JSON.stringify(rules), hash, SHIPPED]
      );
      if (season) {
        // Only while it is still on the game's old rules: another request
        // may have moved it on already.
        await sql.query(
          `update game.seasons s
           set ends_at = greatest($2, s.starts_at + interval '1 millisecond')
           from game.rulesets r
           where r.id = s.ruleset_id and s.watch_id = $1
             and s.kind = 'standard' and s.ends_at is null
             and r.rules_hash <> $3 and r.created_by is null and r.note = $4`,
          [watch, deps.now(), hash, SHIPPED]
        );
      }
      await sql.query(
        `insert into game.seasons (watch_id, ruleset_id, kind, starts_at)
         select $1, id, 'standard', $2 from game.rulesets
         where watch_id = $1 and rules_hash = $3
           and note = $4 and created_by is null
         order by version desc limit 1
         on conflict (watch_id) where kind = 'standard' and ends_at is null
         do nothing`,
        [watch, deps.now(), hash, SHIPPED]
      );
    });
  }
}

/**
 * The season each watch is played in right now: an event while one runs,
 * otherwise its standard season.
 */
export async function liveSeasons(deps: Deps): Promise<Map<WatchId, Season>> {
  await ensureSeasons(deps);
  const rows = await deps.sql.query<SeasonRow>(
    `select ${SEASON_COLUMNS}
     from game.seasons s join game.rulesets r on r.id = s.ruleset_id
     where (s.kind = 'standard' and s.ends_at is null)
        or (s.kind = 'event' and s.starts_at <= $1 and s.ends_at > $1)
     order by s.kind = 'event' desc, s.starts_at desc`,
    [deps.now()]
  );
  const live = new Map<WatchId, Season>();
  for (const row of rows) {
    if (!live.has(row.watch_id)) live.set(row.watch_id, toSeason(row));
  }
  return live;
}

export async function liveSeason(deps: Deps, watch: WatchId): Promise<Season> {
  const season = (await liveSeasons(deps)).get(watch);
  if (!season) throw new ApiError(500, 'noSeason', `No season for ${watch}`);
  return season;
}

export async function seasonById(
  deps: Deps,
  id: number
): Promise<Season | null> {
  const [row] = await deps.sql.query<SeasonRow>(
    `select ${SEASON_COLUMNS}
     from game.seasons s join game.rulesets r on r.id = s.ruleset_id
     where s.id = $1`,
    [id]
  );
  return row ? toSeason(row) : null;
}

/** The rules a ruleset holds, checked. */
export async function rulesById(
  deps: Deps,
  id: number
): Promise<GameRules | null> {
  const [row] = await deps.sql.query<{ rules: unknown }>(
    'select rules from game.rulesets where id = $1',
    [id]
  );
  if (!row) return null;
  const check = checkRules(row.rules);
  return check.ok ? check.rules : null;
}

/** How a season looks to the page. */
export function seasonJson(season: Season) {
  return {
    id: season.id,
    watch: season.watch,
    kind: season.kind,
    name: season.name,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt?.toISOString() ?? null,
    ruleset: {
      id: season.ruleset.id,
      version: season.ruleset.version,
      hash: season.ruleset.hash,
    },
  };
}
