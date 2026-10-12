import type { Deps } from '../deps.js';
import { ApiError, json, objectBody, readJson } from '../http.js';
import { cleanName, requireProfile } from '../profiles.js';

// The signed-in player's own account: their profile, the progress that
// follows them between devices, and the way out.

/** Saved progress is small; anything larger is not ours. */
const PROGRESS_LIMIT_BYTES = 64 * 1024;

export async function getMe(request: Request, deps: Deps): Promise<Response> {
  const profile = await requireProfile(request, deps);
  const bests = await deps.sql.query<{ board: string; score: number }>(
    'select board, score from game.best_scores where user_id = $1',
    [profile.id]
  );
  return json({ profile, bests });
}

/** PATCH /api/me: a new display name. */
export async function renameMe(
  request: Request,
  deps: Deps
): Promise<Response> {
  const profile = await requireProfile(request, deps);
  const body = objectBody(await readJson(request, 1024));
  const name = body['displayName'];
  if (typeof name !== 'string') {
    throw new ApiError(400, 'badName', 'A name is 2 to 24 characters');
  }
  const clean = cleanName(name, profile.id);
  if (clean !== name.trim().replace(/\s+/g, ' ')) {
    throw new ApiError(400, 'badName', 'A name is 2 to 24 characters');
  }
  await deps.sql.query(
    'update game.profiles set display_name = $2 where id = $1',
    [profile.id, clean]
  );
  return json({ profile: { ...profile, displayName: clean } });
}

/**
 * DELETE /api/me: the account and everything stored with it. The admins'
 * log keeps what they did, but no longer which account it was done to.
 */
export async function deleteMe(
  request: Request,
  deps: Deps
): Promise<Response> {
  const profile = await requireProfile(request, deps);
  await deps.deleteAccount(profile.id);
  await deps.sql.query(
    `update game.audit_log set target = 'deleted account' where target = $1`,
    [profile.id]
  );
  return new Response(null, { status: 204 });
}

export async function getProgress(
  request: Request,
  deps: Deps
): Promise<Response> {
  const profile = await requireProfile(request, deps);
  const [row] = await deps.sql.query<{ data: unknown; updated_at: Date }>(
    'select data, updated_at from game.user_progress where user_id = $1',
    [profile.id]
  );
  return json({
    data: row?.data ?? null,
    updatedAt: row?.updated_at.toISOString() ?? null,
  });
}

/** PUT /api/me/progress: the page's merged progress, kept as it is sent. */
export async function putProgress(
  request: Request,
  deps: Deps
): Promise<Response> {
  const profile = await requireProfile(request, deps);
  const body = objectBody(await readJson(request, PROGRESS_LIMIT_BYTES));
  const data = objectBody(body['data']);
  const now = deps.now();
  await deps.sql.query(
    `insert into game.user_progress (user_id, data, updated_at)
     values ($1, $2::jsonb, $3)
     on conflict (user_id) do update
       set data = excluded.data, updated_at = excluded.updated_at`,
    [profile.id, JSON.stringify(data), now]
  );
  return json({ updatedAt: now.toISOString() });
}
