import { beforeEach, describe, expect, it } from 'vitest';

import { depsFromEnv } from './deps.js';
import { handle } from './router.js';
import {
  apiRequest,
  DATABASE_HOOK_MS,
  signIn,
  testDatabase,
  testDeps,
} from './test-support.js';

type Deps = ReturnType<typeof testDeps>;

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

let deps: Deps;
beforeEach(async () => {
  deps = testDeps((await testDatabase()).sql);
}, DATABASE_HOOK_MS);

const call = (
  method: string,
  route: string,
  token: string,
  payload?: unknown
) => handle(apiRequest(method, route, { token, body: payload }), deps);

describe('/me', () => {
  it('makes a profile from the provider’s name on first sight, and nothing more', async () => {
    const { id, token } = await signIn(deps, { name: '  Grace\u0007 Hopper ' });
    const { profile } = await body<{ profile: Record<string, unknown> }>(
      await call('GET', '/me', token)
    );
    expect(profile).toEqual({
      id,
      displayName: 'Grace Hopper',
      role: 'player',
      banned: false,
    });
  });

  it('renames, within 2 to 24 plain characters', async () => {
    const { token } = await signIn(deps);
    expect(
      (await call('PATCH', '/me', token, { displayName: 'Tick Tock' })).status
    ).toBe(200);
    for (const bad of ['A', 'x'.repeat(25), 'Bell\u0000', 42]) {
      expect(
        (await call('PATCH', '/me', token, { displayName: bad })).status
      ).toBe(400);
    }
    const { profile } = await body<{ profile: { displayName: string } }>(
      await call('GET', '/me', token)
    );
    expect(profile.displayName).toBe('Tick Tock');
  });

  it('keeps progress for another device', async () => {
    const { token } = await signIn(deps);
    expect(await body(await call('GET', '/me/progress', token))).toEqual({
      data: null,
      updatedAt: null,
    });
    const data = { best: { diver: 41 }, unlocked: ['diver', 'chronograph'] };
    expect((await call('PUT', '/me/progress', token, { data })).status).toBe(
      200
    );
    expect(await body(await call('GET', '/me/progress', token))).toMatchObject({
      data,
    });
    expect(
      (await call('PUT', '/me/progress', token, { data: [1, 2] })).status
    ).toBe(400);
  });

  it('refuses progress too large to be real', async () => {
    const { token } = await signIn(deps);
    const data = { junk: 'x'.repeat(70_000) };
    expect((await call('PUT', '/me/progress', token, { data })).status).toBe(
      413
    );
  });

  it('deletes the account and everything with it', async () => {
    const { id, token } = await signIn(deps);
    await call('GET', '/me', token);
    expect((await call('DELETE', '/me', token)).status).toBe(204);
    expect(deps.deleted).toEqual([id]);
    const rows = await deps.sql.query(
      'select id from game.profiles where id = $1',
      [id]
    );
    expect(rows).toEqual([]);
  });

  it('leaves the admins’ log saying what was done, not to whom', async () => {
    const { id, token } = await signIn(deps);
    await call('GET', '/me', token);
    await deps.sql.query(
      `insert into game.audit_log (action, target) values ('user.ban', $1)`,
      [id]
    );
    expect((await call('DELETE', '/me', token)).status).toBe(204);
    expect(
      await deps.sql.query('select action, target from game.audit_log')
    ).toEqual([{ action: 'user.ban', target: 'deleted account' }]);
  });
});

describe('deleting a sign-in for real', () => {
  const env = {
    DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
    SUPABASE_URL: 'https://project.supabase.co',
  };

  it('fails, rather than leave the sign-in behind, without the service key', async () => {
    await expect(
      depsFromEnv(env).deleteAccount('00000000-0000-4000-8000-000000000001')
    ).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('fails when Supabase refuses', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response(null, { status: 401 }));
    try {
      await expect(
        depsFromEnv({
          ...env,
          SUPABASE_SERVICE_ROLE_KEY: 'stale',
        }).deleteAccount('00000000-0000-4000-8000-000000000001')
      ).rejects.toThrow('401');
    } finally {
      globalThis.fetch = real;
    }
  });
});
