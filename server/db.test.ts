import postgres from 'postgres';
import { describe, expect, it, vi } from 'vitest';

import { CLIENT_OPTIONS, managed } from './db.js';

// The tests run on PGlite, so they never reach postgres.js itself: these
// check what it would send. Nothing connects until a query is made.
const client = postgres('postgres://test@localhost:1/test', CLIENT_OPTIONS);
const JSON_OID = 114;
const JSONB_OID = 3802;

describe('the Postgres client', () => {
  it('sends JSON text to a jsonb column as it is, never as a string', () => {
    const text = JSON.stringify({ twists: [], seed: 7 });
    for (const oid of [JSON_OID, JSONB_OID]) {
      const serialize = client.options.serializers[oid];
      expect(serialize?.(text)).toBe(text);
    }
  });

  it('still encodes a value that is not text yet', () => {
    expect(client.options.serializers[JSONB_OID]?.({ a: [1, 2] })).toBe(
      '{"a":[1,2]}'
    );
  });

  it('reads jsonb back as the object', () => {
    expect(client.options.parsers[JSONB_OID]?.('{"a":1}')).toEqual({ a: 1 });
  });
});

/** A client whose queries answer with `rows`, or never when `stuck`. */
function fakeClient(stuck: boolean) {
  const end = vi.fn(() => Promise.resolve());
  const unsafe = vi.fn(() =>
    stuck ? new Promise(() => undefined) : Promise.resolve([{ ok: 1 }])
  );
  return { client: { unsafe, end } as unknown as postgres.Sql, end };
}

describe('a stuck query', () => {
  it('fails, naming the query, and the next one gets a new client', async () => {
    const first = fakeClient(true);
    const second = fakeClient(false);
    const create = vi
      .fn<() => postgres.Sql>()
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);
    const sql = managed(create, 20);

    await expect(
      sql.query('select watch_id\n   from game.seasons where id = $1', [1])
    ).rejects.toThrow(
      'Database query took over 0.02 s: select watch_id from game.seasons'
    );
    expect(first.end).toHaveBeenCalledWith({ timeout: 0 });
    await expect(sql.query('select 1')).resolves.toEqual([{ ok: 1 }]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('replaces its client once, and the queries waiting go on the new one', async () => {
    const stuck = fakeClient(true);
    const fresh = fakeClient(false);
    const create = vi
      .fn<() => postgres.Sql>()
      .mockReturnValueOnce(stuck.client)
      .mockReturnValue(fresh.client);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sql = managed(create, 20);

    const results = await Promise.allSettled([
      sql.query('select 1'),
      sql.query('select 2'),
      sql.query('select 3'),
    ]);
    expect(results.map(result => result.status)).toEqual([
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(stuck.end).toHaveBeenCalledTimes(1);
  });
});

it('fails a round of queries with the stuck one, not one it destroyed', async () => {
  // Ending the client rejects whatever else was waiting on it, at once.
  let destroy: (error: Error) => void = () => undefined;
  const unsafe = vi
    .fn()
    .mockReturnValueOnce(new Promise(() => undefined))
    .mockReturnValueOnce(
      new Promise((_, reject) => {
        destroy = reject;
      })
    );
  const end = vi.fn(() => {
    destroy(new Error('write CONNECTION_DESTROYED'));
    return Promise.resolve();
  });
  const client = { unsafe, end } as unknown as postgres.Sql;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const sql = managed(() => client, 20);

  await expect(
    Promise.all([sql.query('select seasons'), sql.query('select settings')])
  ).rejects.toThrow('took over 0.02 s: select seasons');
  expect(end).toHaveBeenCalled();
});

it('sends one query at a time, never several down the connection at once', async () => {
  let running = 0;
  let most = 0;
  const unsafe = vi.fn(async () => {
    most = Math.max(most, ++running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
    return [];
  });
  const client = { unsafe, end: vi.fn() } as unknown as postgres.Sql;
  const sql = managed(() => client, 1000);

  await Promise.all([
    sql.query('select seasons'),
    sql.query('select settings'),
    sql.query('delete old rows'),
  ]);
  expect(unsafe).toHaveBeenCalledTimes(3);
  expect(most).toBe(1);
});
