import postgres from 'postgres';

/** The database as the API sees it: parameterised queries and transactions. */
export interface Sql {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ): Promise<Row[]>;
  /** Runs `work` in a transaction; inside one already, it joins it. */
  transaction<Result>(work: (sql: Sql) => Promise<Result>): Promise<Result>;
}

type Client = postgres.Sql | postgres.TransactionSql;

/**
 * Longer than any query here takes. One that runs past it is stuck on its
 * connection, and every query after it would queue behind it until the
 * function times out, so the API gives up and starts a new one instead.
 */
const QUERY_TIMEOUT_MS = 10_000;

/** `pending`, or an error naming `what` once `ms` have passed. */
async function timed<T>(
  pending: Promise<T>,
  what: string,
  ms: number,
  onTimeout: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Database query took over ${String(ms / 1000)} s: ` +
          what.replace(/\s+/g, ' ').trim().slice(0, 80)
      );
      console.error(error.message);
      // First, so a round waiting on several queries fails with this one,
      // not with another that ending the client destroys.
      reject(error);
      onTimeout();
    }, ms);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function wrap(client: Client, ms: number, stuck: () => void): Sql {
  return {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      const rows = await timed(
        client.unsafe(text, params as postgres.ParameterOrJSON<never>[]),
        text,
        ms,
        stuck
      );
      return rows as unknown as Row[];
    },
    transaction<Result>(work: (sql: Sql) => Promise<Result>) {
      return 'begin' in client
        ? timed(
            client.begin(tx => work(wrap(tx, ms, stuck))) as Promise<Result>,
            'begin',
            ms,
            stuck
          )
        : work(wrap(client, ms, stuck));
    },
  };
}

/**
 * How the API talks to Postgres. One connection per function instance.
 * Whole numbers come back as numbers, every one this API stores being well
 * inside the safe range.
 *
 * A `json` or `jsonb` parameter is JSON text, written with JSON.stringify
 * at the query (as PGlite, in the tests, takes it). postgres.js would
 * otherwise encode it a second time and store a string, not the object.
 */
export const CLIENT_OPTIONS = {
  // The pooler's transaction mode can't keep prepared statements.
  prepare: false,
  max: 1,
  idle_timeout: 20,
  types: {
    bigint: {
      to: 20,
      from: [20],
      serialize: (value: number) => String(value),
      parse: (value: string) => Number(value),
    },
    json: {
      to: 114,
      from: [114, 3802],
      serialize: (value: unknown) =>
        typeof value === 'string' ? value : JSON.stringify(value),
      parse: (value: string): unknown => JSON.parse(value),
    },
  },
} satisfies postgres.Options<Record<string, postgres.PostgresType>>;

/**
 * The database through clients from `create`: a stuck query ends its
 * client (and the transaction it held), and the next query gets a new one.
 */
export function managed(
  create: () => postgres.Sql,
  ms = QUERY_TIMEOUT_MS
): Sql {
  let client = create();
  const current = () => {
    const used = client;
    // Every query stuck on it times out, but only the first replaces it.
    return wrap(used, ms, () => {
      if (client !== used) return;
      client = create();
      void used.end({ timeout: 0 });
    });
  };
  // One query (or transaction) at a time. postgres.js would pipeline
  // concurrent ones on the connection, and Supabase's pooler in
  // transaction mode can lose its place in such a stream and never
  // answer, leaving the request waiting with a transaction open.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <Result>(run: () => Promise<Result>): Promise<Result> => {
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    query: (text, params) => exclusive(() => current().query(text, params)),
    transaction: work => exclusive(() => current().transaction(work)),
  };
}

/** Connects to Postgres at `url` (Supabase's pooler, in production). */
export function connect(url: string): Sql {
  return managed(() => postgres(url, CLIENT_OPTIONS));
}
