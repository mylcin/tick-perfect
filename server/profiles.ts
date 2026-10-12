import { bearerToken, type Identity } from './auth.js';
import type { Deps } from './deps.js';
import { ApiError } from './http.js';

export type Role = 'player' | 'admin' | 'super_admin';

export interface Profile {
  readonly id: string;
  readonly displayName: string;
  readonly role: Role;
  readonly banned: boolean;
}

const RANK: Readonly<Record<Role, number>> = {
  player: 0,
  admin: 1,
  super_admin: 2,
};

const MAX_NAME = 24;
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
/** Characters as Postgres counts them: code points. */
const lengthOf = (text: string) => text.match(/[\s\S]/gu)?.length ?? 0;

/**
 * A display name made safe to show: control characters out, spaces
 * collapsed, 2 to 24 characters, never cut through the middle of one (an
 * emoji with its modifiers stays whole). Too short a name falls back to
 * one made from the player's id.
 */
export function cleanName(name: string, id: string): string {
  const clean = name
    .replace(/[\p{C}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  let short = '';
  for (const { segment } of graphemes.segment(clean)) {
    if (lengthOf(short + segment) > MAX_NAME) break;
    short += segment;
  }
  short = short.trim();
  return lengthOf(short) >= 2 ? short : `Player ${id.slice(0, 4)}`;
}

interface ProfileRow {
  id: string;
  display_name: string;
  role: Role;
  banned_at: Date | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    banned: row.banned_at !== null,
  };
}

/** The caller's identity, if the request carries a valid token. */
export async function identify(
  request: Request,
  deps: Deps
): Promise<Identity | null> {
  const token = bearerToken(request);
  return token ? deps.verify(token) : null;
}

/** A profile for a signed-in identity, made on first sight. */
async function profileFor(identity: Identity, deps: Deps): Promise<Profile> {
  await deps.sql.query(
    `insert into game.profiles (id, display_name)
     values ($1, $2)
     on conflict (id) do nothing`,
    [identity.id, cleanName(identity.name, identity.id)]
  );
  const [row] = await deps.sql.query<ProfileRow>(
    `select id, display_name, role, banned_at
     from game.profiles where id = $1`,
    [identity.id]
  );
  if (!row) throw new ApiError(401, 'signIn', 'Sign in again');
  return toProfile(row);
}

/**
 * The signed-in, unbanned caller, at least `role`: 401 without a valid
 * token, 403 when banned or not allowed.
 */
export async function requireProfile(
  request: Request,
  deps: Deps,
  role: Role = 'player'
): Promise<Profile> {
  const identity = await identify(request, deps);
  if (!identity) throw new ApiError(401, 'signIn', 'Sign in to do that');
  const profile = await profileFor(identity, deps);
  if (profile.banned)
    throw new ApiError(403, 'banned', 'This account is banned');
  if (RANK[profile.role] < RANK[role]) {
    throw new ApiError(403, 'forbidden', 'Not allowed');
  }
  return profile;
}

/** Records an admin's action. */
export async function audit(
  deps: Deps,
  actor: Profile,
  action: string,
  target: string | null,
  payload: unknown = null
): Promise<void> {
  await deps.sql.query(
    `insert into game.audit_log (actor, action, target, payload, at)
     values ($1, $2, $3, $4::jsonb, $5)`,
    [actor.id, action, target, JSON.stringify(payload), deps.now()]
  );
}
