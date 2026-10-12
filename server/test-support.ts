import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { SignJWT } from 'jose';

import { supabaseVerifier } from './auth.js';
import type { Sql } from './db.js';
import type { Deps } from './deps.js';

// For the API's tests: a real Postgres (PGlite, in memory) with the
// migrations applied over a stand-in for Supabase's auth schema, and
// access tokens signed the way Supabase signs them.

const MIGRATIONS = path.resolve(
  import.meta.dirname,
  '..',
  'supabase',
  'migrations'
);
const PROJECT = 'https://test.supabase.co';
const SECRET = 'a-test-secret-at-least-thirty-two-bytes-long';

function wrap(db: Pick<PGlite, 'query'>, root: PGlite | null): Sql {
  return {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      return (await db.query<Row>(text, [...params])).rows;
    },
    transaction<Result>(work: (sql: Sql) => Promise<Result>) {
      return root
        ? root.transaction<Result>(tx => work(wrap(tx, null)))
        : work(wrap(db, null));
    },
  };
}

/**
 * How long a hook may take to make a test database. Under a second as a
 * rule, but every test file starts its own Postgres in WebAssembly at
 * once, and on a busy machine that has passed the usual 15 s.
 */
export const DATABASE_HOOK_MS = 60_000;

/** A fresh database, migrated, as Supabase would have it. */
export async function testDatabase(): Promise<{ db: PGlite; sql: Sql }> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
  `);
  // In order, as `supabase db push` applies them.
  const files = readdirSync(MIGRATIONS)
    .filter(file => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  return {
    db,
    sql: wrap(db, db),
  };
}

interface TestClock {
  now: Date;
  /** Moves the clock on. */
  advance: (ms: number) => void;
}

export function testDeps(
  sql: Sql,
  overrides: Partial<Deps> = {}
): Deps & { clock: TestClock; deleted: string[] } {
  const clock: TestClock = {
    now: new Date('2026-10-10T12:00:00Z'),
    advance(ms) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
  };
  const deleted: string[] = [];
  let seed = 1234;
  return {
    sql,
    verify: supabaseVerifier({ url: PROJECT, secret: SECRET }),
    now: () => clock.now,
    alert: null,
    version: 'test',
    randomSeed: () => (seed = (seed * 48271) % 2147483647),
    async deleteAccount(id) {
      deleted.push(id);
      await sql.query('delete from auth.users where id = $1', [id]);
    },
    clock,
    deleted,
    ...overrides,
  };
}

let users = 0;

/**
 * A player signed in with a provider: their auth user, and a token for
 * them. `role` is granted in SQL, as it is in production.
 */
export async function signIn(
  deps: Deps,
  {
    name = 'Ada Lovelace',
    avatar = 'https://avatars.example/ada.png',
    role,
  }: { name?: string; avatar?: string; role?: 'admin' | 'super_admin' } = {}
): Promise<{ id: string; token: string }> {
  users += 1;
  const id = `00000000-0000-4000-8000-${String(users).padStart(12, '0')}`;
  await deps.sql.query('insert into auth.users (id) values ($1)', [id]);
  const token = await tokenFor(id, { full_name: name, avatar_url: avatar });
  if (role) {
    // The profile is made on first sight; make it now to grant the role.
    await deps.sql.query(
      `insert into game.profiles (id, display_name, role) values ($1, $2, $3)`,
      [id, name, role]
    );
  }
  return { id, token };
}

/** A token as Supabase Auth would sign it for `id`. */
export function tokenFor(
  id: string,
  metadata: Record<string, unknown> = {},
  {
    issuer = `${PROJECT}/auth/v1`,
    audience = 'authenticated',
    secret = SECRET,
    expires = '1h',
  } = {}
): Promise<string> {
  return new SignJWT({ user_metadata: metadata, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(new TextEncoder().encode(secret));
}

/** A request to the API, as the page would send it. */
export function apiRequest(
  method: string,
  route: string,
  { token, body }: { token?: string; body?: unknown } = {}
): Request {
  return new Request(`https://tick-perfect.test/api${route}`, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
      'x-forwarded-for': '203.0.113.7',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}
