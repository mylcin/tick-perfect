import { isWatchId } from '../../src/watches/index.js';
import type { Deps } from '../deps.js';
import { ApiError, json } from '../http.js';
import { tidyUp } from '../housekeeping.js';
import { identify } from '../profiles.js';
import { liveSeason, liveSeasons, seasonById, seasonJson } from '../seasons.js';
import { readSettings } from '../settings.js';
import { standingOn } from './rounds.js';

// What anyone may read: the rules every watch is played by now, and the
// boards.

/**
 * GET /api/config: the live seasons, their rules and the switches. Every
 * page asks for it (the CDN answers most), so it also tidies up.
 */
export async function config(deps: Deps): Promise<Response> {
  const [seasons, settings] = await Promise.all([
    liveSeasons(deps),
    readSettings(deps),
    tidyUp(deps).catch((error: unknown) => {
      console.error('Could not tidy up', error);
    }),
  ]);
  return json(
    {
      leaderboard: settings['leaderboard.enabled'],
      submissions: settings['submissions.enabled'],
      announcement: settings.announcement,
      seasons: [...seasons.values()].map(season => ({
        ...seasonJson(season),
        rules: season.ruleset.rules,
      })),
    },
    { cache: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' }
  );
}

const MAX_ROWS = 100;

/** Which board a query names: a watch's live season, a season or a Daily. */
async function boardFor(url: URL, deps: Deps) {
  const watch = url.searchParams.get('watch');
  const season = url.searchParams.get('season');
  const daily = url.searchParams.get('daily');
  if (watch !== null) {
    if (!isWatchId(watch)) throw new ApiError(400, 'badWatch', 'Unknown watch');
    const live = await liveSeason(deps, watch);
    return { board: `season:${String(live.id)}`, season: seasonJson(live) };
  }
  // Ids and numbers fit in Postgres's int.
  if (season !== null && /^\d{1,9}$/.test(season)) {
    const found = await seasonById(deps, Number(season));
    if (!found) throw new ApiError(404, 'noSeason', 'No such season');
    return { board: `season:${season}`, season: seasonJson(found) };
  }
  if (daily !== null && /^\d{1,9}$/.test(daily)) {
    return { board: `daily:${daily}`, season: null };
  }
  throw new ApiError(400, 'badBoard', 'Name a watch, a season or a Daily');
}

/** GET /api/leaderboard: a board's top scores, and the caller's place. */
export async function leaderboard(
  request: Request,
  url: URL,
  deps: Deps
): Promise<Response> {
  const settings = await readSettings(deps);
  if (!settings['leaderboard.enabled']) {
    throw new ApiError(503, 'closed', 'The leaderboard is closed for now');
  }
  const { board, season } = await boardFor(url, deps);
  const asked = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isInteger(asked)
    ? Math.min(Math.max(asked, 1), MAX_ROWS)
    : 50;
  const identity = await identify(request, deps);
  const rows = await deps.sql.query<{
    user_id: string;
    display_name: string;
    score: number;
  }>(
    `select b.user_id, p.display_name, b.score
     from game.best_scores b join game.profiles p on p.id = b.user_id
     where b.board = $1 and p.banned_at is null
     order by b.score desc, b.achieved_at asc
     limit $2`,
    [board, limit]
  );
  const me = identity ? await standingOn(deps, board, identity.id) : null;
  // Never cached, for anyone: a board a minute old still shows a name its
  // player has changed, or an account they have just deleted.
  return json({
    board,
    season,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      name: row.display_name,
      score: row.score,
      you: row.user_id === identity?.id,
    })),
    you: me,
  });
}
