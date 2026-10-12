import { beforeEach, describe, expect, it } from 'vitest';

import {
  checkRules,
  simulateRound,
  type GameRules,
} from '../src/game/index.js';
import { DIVER_RULES } from '../src/game/index.js';
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
let player: { id: string; token: string };
let admin: { id: string; token: string };
let owner: { id: string; token: string };

beforeEach(async () => {
  deps = testDeps((await testDatabase()).sql);
  player = await signIn(deps, { name: 'Player' });
  admin = await signIn(deps, { name: 'Moderator', role: 'admin' });
  owner = await signIn(deps, { name: 'Owner', role: 'super_admin' });
  // The player has been seen, so they have a profile.
  await handle(apiRequest('GET', '/me', { token: player.token }), deps);
}, DATABASE_HOOK_MS);

const call = (
  method: string,
  route: string,
  token: string,
  payload?: unknown
) => handle(apiRequest(method, route, { token, body: payload }), deps);

/** The Diver's rules a little easier: a wider final window. */
const easier: GameRules = {
  ...DIVER_RULES,
  difficulty: {
    ...DIVER_RULES.difficulty,
    hitWindowMs: { start: 130, limit: 30, rate: 0.06 },
  },
};

describe('who may do what', () => {
  it('keeps players out of the admin API', async () => {
    expect((await call('GET', '/admin/overview', player.token)).status).toBe(
      403
    );
    expect(
      (await handle(apiRequest('GET', '/admin/overview'), deps)).status
    ).toBe(401);
  });

  it('lets admins moderate and draft, but only super admins publish', async () => {
    expect((await call('GET', '/admin/overview', admin.token)).status).toBe(
      200
    );
    const created = await call('POST', '/admin/rulesets', admin.token, {
      watch: 'diver',
      rules: easier,
    });
    expect(created.status).toBe(201);
    const { id } = await body<{ id: number }>(created);
    expect(
      (
        await call('POST', '/admin/seasons', admin.token, {
          watch: 'diver',
          rulesetId: id,
        })
      ).status
    ).toBe(403);
    expect(
      (
        await call('PUT', '/admin/settings', admin.token, {
          key: 'announcement',
          value: 'Hi',
        })
      ).status
    ).toBe(403);
    expect((await call('GET', '/admin/audit', admin.token)).status).toBe(403);
  });

  it('refuses a banned player everywhere', async () => {
    await call('POST', `/admin/users/${player.id}/ban`, admin.token, {
      banned: true,
    });
    expect((await call('GET', '/me', player.token)).status).toBe(403);
  });
});

describe('rule sets', () => {
  it('previews how players would score, without saving', async () => {
    const response = await call(
      'POST',
      '/admin/rulesets/preview',
      admin.token,
      {
        rules: easier,
      }
    );
    const { preview } = await body<{
      preview: { sigma: number; median: number }[];
    }>(response);
    expect(preview.map(row => row.sigma)).toEqual([12, 18, 25, 35, 45]);
    // Steadier players score higher.
    expect(preview[0]?.median).toBeGreaterThan(preview[4]?.median ?? Infinity);
  });

  it('says what is wrong with rules that don’t check out', async () => {
    const response = await call(
      'POST',
      '/admin/rulesets/preview',
      admin.token,
      {
        rules: { ...easier, timing: { ...easier.timing, inputGraceMs: -5 } },
      }
    );
    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: {
        code: 'badRules',
        message: expect.stringContaining('timing.inputGraceMs') as string,
      },
    });
  });

  it('refuses rules the engine can’t play', async () => {
    const response = await call(
      'POST',
      '/admin/rulesets/preview',
      admin.token,
      {
        rules: {
          ...easier,
          // A ring turning faster than the hand can never be caught.
          ring: { turns: 'always', direction: 1 },
          difficulty: {
            ...easier.difficulty,
            ringSpeed: { start: 150, limit: 150, rate: 0.1 },
          },
        },
      }
    );
    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: { code: 'unplayable' },
    });
  });

  it('numbers each new version and lists them', async () => {
    for (const note of ['first', 'second']) {
      await call('POST', '/admin/rulesets', admin.token, {
        watch: 'diver',
        rules: easier,
        note,
      });
    }
    const { rulesets } = await body<{
      rulesets: { version: number; note: string }[];
    }>(await call('GET', '/admin/rulesets?watch=diver', admin.token));
    // Version 1 is the game's own, made with the first season.
    expect(rulesets.map(row => [row.version, row.note])).toEqual([
      [3, 'second'],
      [2, 'first'],
      [1, 'As the game ships'],
    ]);
  });
});

describe('seasons', () => {
  async function publish(payload: Record<string, unknown>) {
    const created = await call('POST', '/admin/rulesets', admin.token, {
      watch: 'diver',
      rules: easier,
    });
    const { id } = await body<{ id: number }>(created);
    return call('POST', '/admin/seasons', owner.token, {
      watch: 'diver',
      rulesetId: id,
      ...payload,
    });
  }

  async function diverSeason() {
    const config = await body<{
      seasons: { watch: string; id: number; kind: string; rules: GameRules }[];
    }>(await handle(apiRequest('GET', '/config'), deps));
    return config.seasons.find(season => season.watch === 'diver');
  }

  it('plays new rules on a fresh board from the moment they are published', async () => {
    const before = await diverSeason();
    expect((await publish({ name: 'Season 2' })).status).toBe(201);
    const after = await diverSeason();
    expect(after?.id).not.toBe(before?.id);
    expect(after?.rules).toEqual(easier);
  });

  it('runs an event between two times, then goes back', async () => {
    const standard = await diverSeason();
    const startsAt = new Date(deps.clock.now.getTime() + 60_000).toISOString();
    const endsAt = new Date(deps.clock.now.getTime() + 3_600_000).toISOString();
    expect(
      (await publish({ kind: 'event', name: 'Weekend', startsAt, endsAt }))
        .status
    ).toBe(201);
    expect((await diverSeason())?.kind).toBe('standard');
    deps.clock.advance(120_000);
    expect((await diverSeason())?.kind).toBe('event');
    deps.clock.advance(3_600_000);
    expect((await diverSeason())?.id).toBe(standard?.id);
  });

  /** The Diver's versions, newest first: [version, note]. */
  async function diverVersions() {
    const { rulesets } = await body<{
      rulesets: { version: number; note: string }[];
    }>(await call('GET', '/admin/rulesets?watch=diver', admin.token));
    return rulesets.map(row => [row.version, row.note]);
  }

  /** As if the season's rules were the ones an older deploy shipped. */
  const shippedBefore = (version: number, hash = 'an older deploy') =>
    deps.sql.query(
      `update game.rulesets set rules_hash = $2
       where watch_id = 'diver' and version = $1`,
      [version, hash]
    );

  it('moves a season on the game’s own rules to the rules a deploy retuned', async () => {
    const config = async () =>
      body<{ seasons: { watch: string; id: number }[] }>(
        await handle(apiRequest('GET', '/config'), deps)
      );
    const before = await config();
    await shippedBefore(1);
    const after = await config();
    const id = (seasons: { watch: string; id: number }[], watch: string) =>
      seasons.find(season => season.watch === watch)?.id;
    expect(id(after.seasons, 'diver')).not.toBe(id(before.seasons, 'diver'));
    expect(id(after.seasons, 'gmt')).toBe(id(before.seasons, 'gmt'));
    expect((await diverSeason())?.rules).toEqual(DIVER_RULES);
    expect(await diverVersions()).toEqual([
      [2, 'As the game ships'],
      [1, 'As the game ships'],
    ]);
    // Once moved, it stays.
    expect(id((await config()).seasons, 'diver')).toBe(
      id(after.seasons, 'diver')
    );
  });

  it('goes back to rules shipped before, with no copy of them', async () => {
    await diverSeason();
    const [{ rules_hash: real } = { rules_hash: '' }] = await deps.sql.query<{
      rules_hash: string;
    }>(`select rules_hash from game.rulesets where watch_id = 'diver'`);
    await shippedBefore(1);
    await diverSeason();
    // A rollback: version 1's rules are the game's again.
    await shippedBefore(2, 'a later deploy');
    await shippedBefore(1, real);
    await diverSeason();
    expect(await diverVersions()).toHaveLength(2);
    const [live] = await deps.sql.query<{ version: number }>(
      `select r.version from game.seasons s
       join game.rulesets r on r.id = s.ruleset_id
       where s.watch_id = 'diver' and s.kind = 'standard' and s.ends_at is null`
    );
    expect(live?.version).toBe(1);
  });

  it('leaves the rules an admin published, whatever the game ships', async () => {
    expect((await publish({ name: 'Season 2' })).status).toBe(201);
    await shippedBefore(1);
    expect((await diverSeason())?.rules).toEqual(easier);
  });

  it('refuses an event that ends before it starts', async () => {
    const at = deps.clock.now.toISOString();
    expect(
      (await publish({ kind: 'event', startsAt: at, endsAt: at })).status
    ).toBe(400);
  });
});

describe('settings', () => {
  it('flips a switch for everyone, and writes it down', async () => {
    const response = await call('PUT', '/admin/settings', owner.token, {
      key: 'leaderboard.enabled',
      value: false,
    });
    expect(response.status).toBe(200);
    expect(
      (await handle(apiRequest('GET', '/leaderboard?watch=diver'), deps)).status
    ).toBe(503);
    const { entries } = await body<{
      entries: { action: string; target: string }[];
    }>(await call('GET', '/admin/audit', owner.token));
    expect(entries[0]).toMatchObject({
      action: 'setting.put',
      target: 'leaderboard.enabled',
    });
  });

  it('refuses an unknown switch or a wrong value', async () => {
    expect(
      (
        await call('PUT', '/admin/settings', owner.token, {
          key: 'cheats',
          value: true,
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call('PUT', '/admin/settings', owner.token, {
          key: 'leaderboard.enabled',
          value: 'no',
        })
      ).status
    ).toBe(400);
  });
});

describe('moderation', () => {
  /** A flagged round of Ada's, all Perfects for 30 targets. */
  async function flagged() {
    const ticket = await body<{ id: string; seed: number; rules: GameRules }>(
      await call('POST', '/rounds', player.token, { watch: 'diver' })
    );
    const check = checkRules(ticket.rules);
    if (!check.ok) throw new Error('bad rules');
    const perfect = simulateRound(check.rules, { seed: ticket.seed, sigma: 0 });
    const log = { ...perfect.log, actions: perfect.log.actions.slice(0, 30) };
    deps.clock.advance(10 * 60 * 1000);
    await call('POST', `/rounds/${ticket.id}`, player.token, {
      log,
      score: 162,
    });
    return ticket.id;
  }

  it('lists flagged rounds and lets one onto the board', async () => {
    const id = await flagged();
    const { rounds } = await body<{ rounds: { id: string; score: number }[] }>(
      await call('GET', '/admin/rounds?status=flagged', admin.token)
    );
    expect(rounds.map(round => round.id)).toEqual([id]);
    expect(
      (
        await call('PATCH', `/admin/rounds/${id}`, admin.token, {
          status: 'verified',
        })
      ).status
    ).toBe(200);
    const board = await body<{ entries: { score: number }[] }>(
      await handle(apiRequest('GET', '/leaderboard?watch=diver'), deps)
    );
    expect(board.entries.map(entry => entry.score)).toEqual([162]);
    // Reviewed once only.
    expect(
      (
        await call('PATCH', `/admin/rounds/${id}`, admin.token, {
          status: 'rejected',
        })
      ).status
    ).toBe(404);
  });

  it('hides a banned player from the boards, and lifts the ban', async () => {
    const id = await flagged();
    await call('PATCH', `/admin/rounds/${id}`, admin.token, {
      status: 'verified',
    });
    await call('POST', `/admin/users/${player.id}/ban`, admin.token, {
      banned: true,
    });
    const scores = async () =>
      (
        await body<{ entries: unknown[] }>(
          await handle(apiRequest('GET', '/leaderboard?watch=diver'), deps)
        )
      ).entries.length;
    expect(await scores()).toBe(0);
    await call('POST', `/admin/users/${player.id}/ban`, admin.token, {
      banned: false,
    });
    expect(await scores()).toBe(1);
  });

  it('never bans an admin, or oneself', async () => {
    expect(
      (
        await call('POST', `/admin/users/${owner.id}/ban`, admin.token, {
          banned: true,
        })
      ).status
    ).toBe(404);
    expect(
      (
        await call('POST', `/admin/users/${admin.id}/ban`, admin.token, {
          banned: true,
        })
      ).status
    ).toBe(400);
  });

  it('finds players by name', async () => {
    const { users } = await body<{ users: { name: string }[] }>(
      await call('GET', '/admin/users?q=play', admin.token)
    );
    expect(users.map(user => user.name)).toEqual(['Player']);
  });
});
