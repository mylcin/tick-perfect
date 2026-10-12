import { supabaseVerifier, type VerifyToken } from './auth.js';
import { connect, type Sql } from './db.js';

/** Everything the API reaches outside itself, so tests can stand in. */
export interface Deps {
  readonly sql: Sql;
  readonly verify: VerifyToken;
  readonly now: () => Date;
  /** A fresh 32-bit seed for a ranked round. */
  readonly randomSeed: () => number;
  /** Removes a player's sign-in account (their data goes with it). */
  readonly deleteAccount: (id: string) => Promise<void>;
  /** Tells whoever runs the game that something is wrong, if anyone listens. */
  readonly alert: ((text: string) => Promise<void>) | null;
  /** The deployed commit, to tell reports from different builds apart. */
  readonly version: string | null;
}

interface ServerEnv {
  readonly DATABASE_URL?: string | undefined;
  readonly SUPABASE_URL?: string | undefined;
  readonly SUPABASE_JWT_SECRET?: string | undefined;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  /** Slack- or Discord-style incoming webhook for alerts. */
  readonly ALERT_WEBHOOK_URL?: string | undefined;
  /** Set by Vercel on every deployment. */
  readonly VERCEL_GIT_COMMIT_SHA?: string | undefined;
}

/** Whether the server has what it needs to run. */
export function isConfigured(
  env: ServerEnv
): env is ServerEnv & { DATABASE_URL: string; SUPABASE_URL: string } {
  return Boolean(env.DATABASE_URL && env.SUPABASE_URL);
}

/** An alert webhook gets this long before the request moves on. */
const ALERT_TIMEOUT_MS = 3000;

/**
 * Posts `text` to an incoming webhook. The body carries it as both `text`
 * (Slack and most others) and `content` (Discord).
 */
function webhookAlert(url: string): (text: string) => Promise<void> {
  return async text => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`The alert webhook answered ${String(response.status)}`);
    }
  };
}

/**
 * The real dependencies, from the environment. Deleting an account needs
 * the service role key: without it, or when Supabase refuses, deleting
 * fails rather than leave the sign-in (and its email address) behind.
 */
export function depsFromEnv(
  env: ServerEnv & { DATABASE_URL: string; SUPABASE_URL: string }
): Deps {
  const sql = connect(env.DATABASE_URL);
  const authUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    sql,
    verify: supabaseVerifier({
      url: env.SUPABASE_URL,
      secret: env.SUPABASE_JWT_SECRET,
    }),
    now: () => new Date(),
    alert: env.ALERT_WEBHOOK_URL ? webhookAlert(env.ALERT_WEBHOOK_URL) : null,
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
    // The game's own rows go with the sign-in (on delete cascade).
    async deleteAccount(id) {
      if (!serviceKey) {
        throw new Error(
          'SUPABASE_SERVICE_ROLE_KEY is not set, so sign-ins can’t be deleted'
        );
      }
      const response = await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `Supabase refused to delete a sign-in: ${String(response.status)}`
        );
      }
      // A sign-in already gone leaves no profile behind either.
      await sql.query('delete from game.profiles where id = $1', [id]);
    },
  };
}
