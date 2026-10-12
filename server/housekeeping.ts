import type { Deps } from './deps.js';
import { ERROR_RETENTION_MS } from './errors.js';
import { LONGEST_WINDOW_MS } from './rate-limit.js';

// What the game keeps only for a while, deleted once its time is up:
// rate-limit windows, which hold network addresses, after an hour; error
// reports after 30 days; and of the rounds (docs/BACKEND.md, the privacy
// notice):
// - those never finished (dealt or given up), after a day;
// - those refused, after 30 days;
// - the logs of those on the boards, after 30 days, the score and its
//   statistics staying. A round held for review keeps its log until an
//   admin decides.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Longer than a round may take to come back (six hours). */
export const UNFINISHED_ROUND_MS = DAY_MS;
export const ROUND_LOG_RETENTION_MS = 30 * DAY_MS;

export async function tidyUp(deps: Deps): Promise<void> {
  const now = deps.now().getTime();
  await deps.sql.query(
    'delete from game.rate_limits where window_start <= $1',
    [new Date(now - LONGEST_WINDOW_MS)]
  );
  await deps.sql.query('delete from game.error_reports where hour < $1', [
    new Date(now - ERROR_RETENTION_MS),
  ]);
  await deps.sql.query(
    `delete from game.rounds
     where status in ('issued', 'abandoned') and issued_at < $1`,
    [new Date(now - UNFINISHED_ROUND_MS)]
  );
  await deps.sql.query(
    `delete from game.rounds where status = 'rejected' and issued_at < $1`,
    [new Date(now - ROUND_LOG_RETENTION_MS)]
  );
  await deps.sql.query(
    `update game.rounds set log = null
     where status = 'verified' and log is not null and issued_at < $1`,
    [new Date(now - ROUND_LOG_RETENTION_MS)]
  );
}
