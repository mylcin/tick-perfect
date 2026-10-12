import type { Sql } from './db.js';
import { ApiError } from './http.js';

interface Limit {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * No window is longer, so any window that started this long ago is over.
 * Keys can hold network addresses, which are kept no longer than this.
 */
export const LONGEST_WINDOW_MS = 60 * 60 * 1000;

/**
 * Counts one request against `key` in the current window, and refuses it
 * (429) once the window has had `limit`. Windows are fixed slices of the
 * clock. Every call also clears the windows that are over, for every key.
 */
export async function spend(
  sql: Sql,
  key: string,
  { limit, windowMs }: Limit,
  now: Date
): Promise<void> {
  if (windowMs <= 0 || windowMs > LONGEST_WINDOW_MS) {
    throw new RangeError(`A rate-limit window is at most an hour: ${key}`);
  }
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await sql.query<{ hits: number }>(
    `insert into game.rate_limits as r (key, window_start, hits)
     values ($1, $2, 1)
     on conflict (key, window_start) do update set hits = r.hits + 1
     returning hits`,
    [key, start]
  );
  await sql.query('delete from game.rate_limits where window_start <= $1', [
    new Date(now.getTime() - LONGEST_WINDOW_MS),
  ]);
  if ((row?.hits ?? 0) > limit) {
    throw new ApiError(429, 'tooMany', 'Too many requests; try again soon');
  }
}
