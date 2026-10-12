import { describe, expect, it, vi } from 'vitest';

import { DIVER_RULES, GMT_RULES, type GameRules } from '../game';
import { ApiFailure, type ApiOptions } from './api';
import type { Auth } from './auth';
import { createOnline, parseConfig, type OnlineDeps } from './online';

const CONFIG = { supabaseUrl: 'https://p.supabase.co', supabaseKey: 'pk' };
const PROFILE = {
  id: 'u1',
  displayName: 'Ada',
  role: 'player',
};

function serverConfig(rules: GameRules = DIVER_RULES) {
  return {
    leaderboard: true,
    submissions: true,
    announcement: null,
    seasons: [
      {
        id: 7,
        watch: 'diver',
        kind: 'standard',
        name: null,
        endsAt: null,
        rules,
      },
    ],
  };
}

/** An API that answers by route; `calls` records what was asked. */
function fakeApi(answers: Record<string, unknown>) {
  const calls: { route: string; options: ApiOptions }[] = [];
  const call = <T>(route: string, options: ApiOptions = {}): Promise<T> => {
    calls.push({ route, options });
    const key = `${options.method ?? 'GET'} ${route.split('?')[0] ?? ''}`;
    const answer = answers[key];
    if (answer instanceof ApiFailure) return Promise.reject(answer);
    if (answer === undefined) {
      return Promise.reject(new ApiFailure(404, 'notFound', key));
    }
    return Promise.resolve(answer as T);
  };
  return { call, calls };
}

function fakeAuth(signedIn: boolean): Auth & { listeners: (() => void)[] } {
  const listeners: (() => void)[] = [];
  return {
    listeners,
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    token: () => Promise.resolve(signedIn ? 'token-1' : null),
    onChange: listener => {
      listeners.push(() => {
        listener(signedIn);
      });
      return () => undefined;
    },
  };
}

function online(
  answers: Record<string, unknown>,
  {
    signedIn = true,
    hadSession = true,
    config = CONFIG,
  }: {
    signedIn?: boolean;
    hadSession?: boolean;
    config?: OnlineDeps['config'];
  } = {}
) {
  const api = fakeApi(answers);
  const auth = fakeAuth(signedIn);
  const created = createOnline({
    config,
    call: api.call,
    loadAuth: () => Promise.resolve(auth),
    hadSession: () => hadSession,
    now: () => 0,
  });
  return { online: created, api, auth };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('createOnline', () => {
  it('stays off in a build without a project', () => {
    const { online: off, api } = online({}, { config: null });
    off.start();
    expect(off.store.getState().status).toBe('off');
    expect(api.calls).toEqual([]);
    expect(
      off.requestTicket('diver', { kind: 'collection' }).ready()
    ).toBeNull();
  });

  it('plays by the server’s rules once they arrive', async () => {
    const { online: on } = online(
      { 'GET /config': serverConfig(GMT_RULES) },
      { hadSession: false }
    );
    on.start();
    await settle();
    expect(on.store.getState().status).toBe('signedOut');
    expect(on.rulesFor('diver')).toEqual(GMT_RULES);
    expect(on.rulesFor('gmt')).toBeNull();
  });

  it('takes newer rules only when told it is between rounds', async () => {
    const { online: on } = online(
      { 'GET /config': serverConfig() },
      { hadSession: false }
    );
    on.start();
    await settle();
    const newer = parseConfig(serverConfig(GMT_RULES));
    on.store.setState({ config: newer });
    expect(on.rulesFor('diver')).toEqual(DIVER_RULES);
    on.adoptRules();
    expect(on.rulesFor('diver')).toEqual(GMT_RULES);
  });

  it('keeps the game’s own rules when the API is away', async () => {
    const { online: on } = online({}, { hadSession: false });
    on.start();
    await settle();
    expect(on.rulesFor('diver')).toBeNull();
  });

  it('signs a returning player in, and syncs their progress both ways', async () => {
    const saved = { progress: { best: { diver: 9 } } };
    const { online: on, api } = online({
      'GET /config': serverConfig(),
      'GET /me': { profile: PROFILE },
      'GET /me/progress': { data: saved },
      'PUT /me/progress': { updatedAt: 'now' },
    });
    const merged: unknown[] = [];
    on.connectProgress(
      () => ({ progress: { best: { diver: 12 } } }),
      data => merged.push(data)
    );
    on.start();
    await vi.waitFor(() => {
      expect(on.store.getState().status).toBe('signedIn');
    });
    await vi.waitFor(() => {
      expect(
        api.calls.map(call => `${call.options.method ?? 'GET'} ${call.route}`)
      ).toContain('PUT /me/progress');
    });
    expect(on.store.getState().profile).toEqual(PROFILE);
    expect(merged).toEqual([saved]);
    expect(api.calls.at(-1)?.options.body).toEqual({
      data: { progress: { best: { diver: 12 } } },
    });
  });

  it('carries on as a guest when the profile can’t be read', async () => {
    const { online: on } = online({ 'GET /config': serverConfig() });
    on.start();
    await vi.waitFor(() => {
      expect(on.store.getState().status).toBe('signedOut');
    });
  });

  it('asks for a ticket only for a signed-in player with the boards open', async () => {
    const ticket = {
      id: 'r1',
      watch: 'diver',
      seed: 5,
      daily: null,
      rules: DIVER_RULES,
    };
    const { online: on, api } = online({
      'GET /config': serverConfig(),
      'GET /me': { profile: PROFILE },
      'POST /rounds': ticket,
    });
    expect(
      on.requestTicket('diver', { kind: 'collection' }).ready()
    ).toBeNull();
    on.start();
    await vi.waitFor(() => {
      expect(on.store.getState().status).toBe('signedIn');
    });
    const request = on.requestTicket('diver', { kind: 'daily', number: 4 });
    await vi.waitFor(() => {
      expect(request.ready()).toEqual(ticket);
    });
    expect(api.calls.at(-1)?.options.body).toEqual({
      watch: 'diver',
      daily: 4,
    });
    expect(on.ticketFits(request.ready(), DIVER_RULES)).toBe(true);
    expect(on.ticketFits(request.ready(), GMT_RULES)).toBe(false);
  });

  it('keeps what became of a ranked round', async () => {
    const ticket = {
      id: 'r1',
      watch: 'diver' as const,
      seed: 5,
      daily: null,
      rules: DIVER_RULES,
    };
    const log = { seed: 5, start: 0, actions: [] };
    const { online: on } = online({
      'POST /rounds/r1': { status: 'verified', score: 12, best: 20, rank: 3 },
      'POST /rounds/r2': { status: 'rejected', reason: 'mismatch' },
      'POST /rounds/r3': new ApiFailure(409, 'alreadyIn', 'in'),
    });
    await on.submit(ticket, log, 12, 'test');
    expect(on.store.getState().submission).toEqual({
      round: 'r1',
      state: 'verified',
      score: 12,
      best: 20,
      rank: 3,
    });
    await on.submit({ ...ticket, id: 'r2' }, log, 12, 'test');
    expect(on.store.getState().submission).toEqual({
      round: 'r2',
      state: 'rejected',
      reason: 'mismatch',
    });
    await on.submit({ ...ticket, id: 'r3' }, log, 12, 'test');
    expect(on.store.getState().submission).toMatchObject({
      state: 'rejected',
      reason: 'alreadyIn',
    });
    await on.submit({ ...ticket, id: 'r4' }, log, 12, 'test');
    expect(on.store.getState().submission).toEqual({
      round: 'r4',
      state: 'failed',
    });
  });

  it('loads sign-in again after its code failed to arrive', async () => {
    const auth = fakeAuth(false);
    const loadAuth = vi
      .fn<OnlineDeps['loadAuth']>()
      .mockRejectedValueOnce(
        new TypeError('Failed to fetch dynamically imported module')
      )
      .mockResolvedValue(auth);
    const on = createOnline({
      config: CONFIG,
      call: fakeApi({ 'GET /config': serverConfig() }).call,
      loadAuth,
      hadSession: () => true,
      now: () => 0,
    });
    // A returning player's session can't load: a guest for now.
    on.start();
    await vi.waitFor(() => {
      expect(on.store.getState().status).toBe('signedOut');
    });
    await on.signIn('google');
    expect(loadAuth).toHaveBeenCalledTimes(2);
    expect(auth.signIn).toHaveBeenCalledWith('google');
  });

  it('signs in through the provider, and out again', async () => {
    const { online: on, auth } = online(
      { 'GET /config': serverConfig() },
      { hadSession: false }
    );
    await on.signIn('github');
    expect(auth.signIn).toHaveBeenCalledWith('github');
    await on.signOut();
    expect(auth.signOut).toHaveBeenCalled();
    expect(on.store.getState().status).toBe('signedOut');
  });
});

describe('parseConfig', () => {
  it('leaves out seasons it can’t trust', () => {
    const config = parseConfig({
      leaderboard: true,
      submissions: false,
      announcement: 7,
      seasons: [
        { id: 1, watch: 'diver', rules: DIVER_RULES },
        { id: 2, watch: 'sundial', rules: DIVER_RULES },
        { id: 3, watch: 'gmt', rules: { broken: true } },
      ],
    });
    expect(Object.keys(config?.seasons ?? {})).toEqual(['diver']);
    expect(config).toMatchObject({
      leaderboard: true,
      submissions: false,
      announcement: null,
    });
    expect(parseConfig(null)).toBeNull();
  });
});
