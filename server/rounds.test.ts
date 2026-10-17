import { beforeEach, describe, expect, it } from 'vitest';

import {
  checkRules,
  dailySeed,
  simulateRound,
  type GameRules,
  type RoundLog,
} from '../src/game/index.js';
import { dailyWatch } from '../src/state/daily.js';
import {
  ROUND_LOG_RETENTION_MS,
  tidyUp,
  UNFINISHED_ROUND_MS,
} from './housekeeping.js';
import { handle } from './router.js';
import {
  apiRequest,
  DATABASE_HOOK_MS,
  signIn,
  testDatabase,
  testDeps,
} from './test-support.js';

type Deps = ReturnType<typeof testDeps>;

interface Ticket {
  id: string;
  seed: number;
  rules: GameRules;
  season: { id: number };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

let deps: Deps;
beforeEach(async () => {
  deps = testDeps((await testDatabase()).sql);
}, DATABASE_HOOK_MS);

async function start(
  token: string,
  request: Record<string, unknown> = { watch: 'diver' }
) {
  const response = await handle(
    apiRequest('POST', '/rounds', { token, body: request }),
    deps
  );
  return { response, ticket: await body<Ticket>(response.clone()) };
}

/** Plays the ticket's round as a player of `sigma` and lets its time pass. */
function play(ticket: Ticket, sigma = 25) {
  const check = checkRules(ticket.rules);
  if (!check.ok) throw new Error(check.errors.join());
  const round = simulateRound(check.rules, {
    seed: ticket.seed,
    sigma,
    noise: 7,
  });
  const last = round.log.actions.at(-1)?.[1] ?? round.log.start;
  deps.clock.advance(last - round.log.start + 5000);
  return round;
}

function submit(
  token: string,
  id: string,
  payload: { log: RoundLog; score: number }
) {
  return handle(
    apiRequest('POST', `/rounds/${id}`, { token, body: payload }),
    deps
  );
}

describe('starting a round', () => {
  it('needs a signed-in player', async () => {
    const response = await handle(
      apiRequest('POST', '/rounds', { body: { watch: 'diver' } }),
      deps
    );
    expect(response.status).toBe(401);
  });

  it('hands out a seed, with the rules and season it counts on', async () => {
    const { token } = await signIn(deps);
    const { response, ticket } = await start(token);
    expect(response.status).toBe(201);
    expect(ticket.seed).toBeGreaterThan(0);
    expect(checkRules(ticket.rules).ok).toBe(true);
    expect(ticket.season.id).toBeGreaterThan(0);
  });

  it('gives a Daily its own seed, on its own watch, only around today', async () => {
    const { token } = await signIn(deps);
    // 10 October 2026 is Daily #10.
    const { response, ticket } = await start(token, {
      watch: dailyWatch(10),
      daily: 10,
    });
    expect(response.status).toBe(201);
    expect(ticket.seed).toBe(dailySeed(10));
    expect(
      (await start(token, { watch: dailyWatch(11), daily: 11 })).response.status
    ).toBe(201);
    expect(
      (await start(token, { watch: dailyWatch(13), daily: 13 })).response.status
    ).toBe(400);
    expect(
      (await start(token, { watch: dailyWatch(11), daily: 10 })).response.status
    ).toBe(400);
  });

  it('refuses a watch that doesn’t exist', async () => {
    const { token } = await signIn(deps);
    expect((await start(token, { watch: 'sundial' })).response.status).toBe(
      400
    );
  });

  it('gives up the last round when another is asked for', async () => {
    const { token } = await signIn(deps);
    const first = (await start(token)).ticket;
    await start(token);
    const round = play(first);
    const response = await submit(token, first.id, {
      log: round.log,
      score: round.score,
    });
    expect(response.status).toBe(409);
  });

  it('limits how fast rounds can be asked for', async () => {
    const { token } = await signIn(deps);
    for (let index = 0; index < 60; index++) {
      expect((await start(token)).response.status).toBe(201);
    }
    expect((await start(token)).response.status).toBe(429);
    deps.clock.advance(10 * 60 * 1000);
    expect((await start(token)).response.status).toBe(201);
  });
});

describe('sending a round back', () => {
  it('replays it and puts the score on the board', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const round = play(ticket);
    const response = await submit(token, ticket.id, {
      log: round.log,
      score: round.score,
    });
    expect(await body(response)).toEqual({
      status: 'verified',
      score: round.score,
      board: `season:${String(ticket.season.id)}`,
      best: round.score,
      rank: 1,
    });
  });

  it('refuses a score the taps don’t add up to', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const round = play(ticket);
    const response = await submit(token, ticket.id, {
      log: round.log,
      score: round.score + 50,
    });
    expect(await body(response)).toEqual({
      status: 'rejected',
      reason: 'mismatch',
    });
  });

  it('refuses taps played on another seed', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const round = play(ticket);
    const log = { ...round.log, seed: ticket.seed + 1 };
    expect(
      await body(await submit(token, ticket.id, { log, score: round.score }))
    ).toEqual({
      status: 'rejected',
      reason: 'seed',
    });
  });

  it('refuses a round that took longer than the time that passed', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const check = checkRules(ticket.rules);
    if (!check.ok) throw new Error('bad rules');
    const round = simulateRound(check.rules, { seed: ticket.seed, sigma: 20 });
    deps.clock.advance(500);
    expect(
      await body(
        await submit(token, ticket.id, { log: round.log, score: round.score })
      )
    ).toEqual({
      status: 'rejected',
      reason: 'tooSoon',
    });
  });

  it('refuses a log that can’t be played', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const log: RoundLog = {
      seed: ticket.seed,
      start: 100,
      actions: [['tap', 50]],
    };
    expect(
      await body(await submit(token, ticket.id, { log, score: 0 }))
    ).toEqual({
      status: 'rejected',
      reason: 'outOfOrder',
    });
  });

  it.each([
    ['no log', { score: 1 }],
    [
      'an unknown action',
      { log: { seed: 1, start: 0, actions: [['jump', 1]] }, score: 0 },
    ],
    [
      'an action without a time',
      { log: { seed: 1, start: 0, actions: [['tap']] }, score: 0 },
    ],
  ])('answers %s with a 400', async (_, payload) => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const response = await handle(
      apiRequest('POST', `/rounds/${ticket.id}`, { token, body: payload }),
      deps
    );
    expect(response.status).toBe(400);
  });

  it('takes a round back only once, and only from its player', async () => {
    const ada = await signIn(deps);
    const bob = await signIn(deps, { name: 'Bob' });
    const { ticket } = await start(ada.token);
    const round = play(ticket);
    const payload = { log: round.log, score: round.score };
    expect((await submit(bob.token, ticket.id, payload)).status).toBe(404);
    expect((await submit(ada.token, ticket.id, payload)).status).toBe(200);
    expect((await submit(ada.token, ticket.id, payload)).status).toBe(409);
  });

  it('takes a round in once, even when another submit lands meanwhile', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const round = play(ticket);
    // Another instance takes the round in between this one's check and its
    // write, as two submits sent at once can on separate connections.
    const { sql } = deps;
    let raced = false;
    const racing = {
      ...deps,
      sql: {
        ...sql,
        query: async <Row>(text: string, params?: readonly unknown[]) => {
          if (!raced && text.includes('set status = $2')) {
            raced = true;
            await sql.query(
              `update game.rounds set status = 'verified' where id = $1`,
              [ticket.id]
            );
          }
          return sql.query<Row>(text, params);
        },
      },
    };
    const response = await handle(
      apiRequest('POST', `/rounds/${ticket.id}`, {
        token,
        body: { log: round.log, score: round.score },
      }),
      racing
    );
    expect(raced).toBe(true);
    expect(response.status).toBe(409);
  });

  it('lets a round expire', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const round = play(ticket);
    deps.clock.advance(7 * 60 * 60 * 1000);
    expect(
      (await submit(token, ticket.id, { log: round.log, score: round.score }))
        .status
    ).toBe(410);
  });

  it('holds back a round too steady to be human', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const check = checkRules(ticket.rules);
    if (!check.ok) throw new Error('bad rules');
    // Every tap on the dot, for 30 targets.
    const perfect = simulateRound(check.rules, { seed: ticket.seed, sigma: 0 });
    const log = { ...perfect.log, actions: perfect.log.actions.slice(0, 30) };
    deps.clock.advance(10 * 60 * 1000);
    const replayed = await body<{ status: string; score: number; rank: null }>(
      await submit(token, ticket.id, { log, score: 2 + 2 + 5 * 4 + 23 * 6 })
    );
    expect(replayed).toMatchObject({ status: 'flagged', rank: null });
  });

  it('keeps each player’s best and ranks them', async () => {
    const ada = await signIn(deps);
    const bob = await signIn(deps, { name: 'Bob' });
    const scores: Record<string, number[]> = { ada: [], bob: [] };
    for (const [name, player, sigma] of [
      ['ada', ada, 15],
      ['bob', bob, 40],
      ['ada', ada, 45],
    ] as const) {
      const { ticket } = await start(player.token);
      const round = play(ticket, sigma);
      scores[name]?.push(round.score);
      await submit(player.token, ticket.id, {
        log: round.log,
        score: round.score,
      });
    }
    const board = await body<{
      entries: { name: string; score: number; rank: number }[];
    }>(await handle(apiRequest('GET', '/leaderboard?watch=diver'), deps));
    const adaBest = Math.max(...(scores['ada'] ?? []));
    const bobBest = Math.max(...(scores['bob'] ?? []));
    expect(board.entries.map(entry => entry.score)).toEqual(
      [adaBest, bobBest].sort((a, b) => b - a)
    );
    expect(board.entries[0]?.rank).toBe(1);
    // A name, a score and a place: nothing more about anyone goes public.
    expect(Object.keys(board.entries[0] ?? {}).sort()).toEqual([
      'name',
      'rank',
      'score',
      'you',
    ]);
  });

  it('shows a new name or a deleted account on the next look, never cached', async () => {
    const ada = await signIn(deps);
    const { ticket } = await start(ada.token);
    const round = play(ticket, 15);
    await submit(ada.token, ticket.id, { log: round.log, score: round.score });
    const look = async () => {
      const response = await handle(
        apiRequest('GET', '/leaderboard?watch=diver'),
        deps
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      const board = await body<{ entries: { name: string }[] }>(response);
      return board.entries.map(entry => entry.name);
    };
    expect(await look()).toEqual(['Ada Lovelace']);

    await handle(
      apiRequest('PATCH', '/me', {
        token: ada.token,
        body: { displayName: 'Countess' },
      }),
      deps
    );
    expect(await look()).toEqual(['Countess']);

    await handle(apiRequest('DELETE', '/me', { token: ada.token }), deps);
    expect(await look()).toEqual([]);
  });

  it('closes when an admin turns submissions off', async () => {
    const { token } = await signIn(deps);
    await deps.sql.query(
      `insert into game.app_settings (key, value) values ('submissions.enabled', 'false')`
    );
    expect((await start(token)).response.status).toBe(503);
  });
});

describe('what is kept of a round', () => {
  const roundRow = async (id: string) => {
    const [row] = await deps.sql.query<{
      status: string;
      score: number | null;
      has_log: boolean;
    }>(
      'select status, score, log is not null as has_log from game.rounds where id = $1',
      [id]
    );
    return row ?? null;
  };

  it('keeps no log of a refused round, only why', async () => {
    const { token } = await signIn(deps);
    const { ticket } = await start(token);
    const round = play(ticket);
    await submit(token, ticket.id, {
      log: { ...round.log, seed: ticket.seed + 1 },
      score: round.score,
    });
    const [row] = await deps.sql.query<{ log: unknown; review_note: string }>(
      'select log, review_note from game.rounds where id = $1',
      [ticket.id]
    );
    expect(row).toEqual({ log: null, review_note: 'seed' });
  });

  it('lets unfinished, refused and old rounds go, never a score', async () => {
    const one = await signIn(deps, { name: 'One' });
    const two = await signIn(deps, { name: 'Two' });
    // Abandoned when its player asks for the next.
    const abandoned = (await start(one.token)).ticket;
    const verified = (await start(one.token)).ticket;
    const round = play(verified);
    await submit(one.token, verified.id, {
      log: round.log,
      score: round.score,
    });
    const refused = (await start(one.token)).ticket;
    await submit(one.token, refused.id, { log: round.log, score: 0 });
    const issued = (await start(two.token)).ticket;

    expect((await roundRow(verified.id))?.status).toBe('verified');
    expect((await roundRow(refused.id))?.status).toBe('rejected');

    // A little over a day: only the unfinished go.
    deps.clock.advance(UNFINISHED_ROUND_MS + 1000);
    await tidyUp(deps);
    expect(await roundRow(abandoned.id)).toBeNull();
    expect(await roundRow(issued.id)).toBeNull();
    expect(await roundRow(refused.id)).not.toBeNull();
    expect((await roundRow(verified.id))?.has_log).toBe(true);

    // Past 30 days: the refused go, and the board's round keeps its score
    // but not its log.
    deps.clock.advance(ROUND_LOG_RETENTION_MS);
    await tidyUp(deps);
    expect(await roundRow(refused.id)).toBeNull();
    expect(await roundRow(verified.id)).toEqual({
      status: 'verified',
      score: round.score,
      has_log: false,
    });
    const [best] = await deps.sql.query<{ score: number }>(
      'select score from game.best_scores where round_id = $1',
      [verified.id]
    );
    expect(best?.score).toBe(round.score);
  });
});
