import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Sql } from './db.js';
import {
  browserOf,
  clip,
  fingerprintOf,
  NEW_KINDS_PER_HOUR,
  OVERFLOW,
  raiseAlert,
  recordError,
  routeKind,
  storable,
} from './errors.js';
import { spend } from './rate-limit.js';
import { handle } from './router.js';
import { violationsOf } from './routes/reports.js';
import {
  apiRequest,
  DATABASE_HOOK_MS,
  signIn,
  testDatabase,
  testDeps,
} from './test-support.js';

type Deps = ReturnType<typeof testDeps>;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// One database for the file, emptied of what these tests write: a fresh
// one per test costs a second each.
let sql: Sql;
let deps: Deps;
beforeAll(async () => {
  sql = (await testDatabase()).sql;
}, DATABASE_HOOK_MS);
beforeEach(async () => {
  await sql.query('truncate game.error_reports, game.rate_limits');
  deps = testDeps(sql);
});

async function stored(sql: Sql) {
  return sql.query<{
    source: string;
    message: string;
    count: number;
    detail: Record<string, unknown>;
  }>(
    `select source, message, count, detail from game.error_reports
     order by hour, message`
  );
}

/** A request as a browser sends a report: its own body and type. */
function report(route: string, body: string, type = 'application/json') {
  return new Request(`https://tick-perfect.test/api${route}`, {
    method: 'POST',
    headers: {
      'content-type': type,
      'x-forwarded-for': '198.51.100.9',
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    body,
  });
}

describe('fingerprintOf', () => {
  it('puts the same error from the same place in one kind', () => {
    const kind = (message: string, where = 'GET /config') =>
      fingerprintOf({ source: 'api', message, where });
    expect(kind('Error: no round 00000000-0000-4000-8000-000000000001')).toBe(
      kind('Error: no round 00000000-0000-4000-8000-0000000000ff')
    );
    expect(kind('took 1500 ms')).toBe(kind('took 2210 ms'));
    expect(kind('Error: a')).not.toBe(kind('Error: b'));
    expect(kind('Error: a')).not.toBe(kind('Error: a', 'GET /me'));
    expect(
      fingerprintOf({ source: 'page', message: 'x', where: 'y' })
    ).not.toBe(fingerprintOf({ source: 'csp', message: 'x', where: 'y' }));
  });
});

describe('clip', () => {
  it('cuts long text on a whole character', () => {
    expect(clip('short', 10)).toBe('short');
    expect(clip('a'.repeat(12), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(clip('😀😀😀', 2)).toBe('😀…');
  });
});

describe('routeKind', () => {
  it('takes ids out of a route', () => {
    expect(
      routeKind('POST', '/rounds/00000000-0000-4000-8000-0000000000aa')
    ).toBe('POST /rounds/:id');
  });
});

describe('browserOf', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome 141 · Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge 141 · Windows',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
      'Samsung Internet 27 · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari 18 · iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
      'Chrome 141 · iOS',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      'Safari 18 · macOS',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
      'Firefox 143 · Linux',
    ],
    ['curl/8.7.1', 'other · other'],
  ])('%s', (agent, expected) => {
    expect(browserOf(agent)).toBe(expected);
  });

  it('says so without one', () => {
    expect(browserOf(null)).toBe('unknown');
  });
});

describe('recordError', () => {
  const sample = {
    source: 'page' as const,
    message: 'TypeError: x is undefined',
    where: '/assets/index.js:1:200',
    detail: { path: '/' },
  };

  it('counts a kind per hour, keeping its latest sample', async () => {
    await recordError(deps, sample);
    await recordError(deps, { ...sample, detail: { path: '/admin' } });
    deps.clock.advance(HOUR);
    await recordError(deps, sample);
    expect(await stored(deps.sql)).toEqual([
      { ...rowOf(sample), count: 2, detail: { path: '/admin' } },
      { ...rowOf(sample), count: 1, detail: { path: '/' } },
    ]);
  });

  it('deletes hours older than 30 days as new ones come in', async () => {
    await recordError(deps, sample);
    deps.clock.advance(31 * DAY);
    await recordError(deps, { ...sample, message: 'Another' });
    expect((await stored(deps.sql)).map(row => row.message)).toEqual([
      'Another',
    ]);
  });

  function rowOf(report: typeof sample) {
    return { source: report.source, message: report.message };
  }
});

describe('raiseAlert', () => {
  it('alerts at most once an hour', async () => {
    const sent: string[] = [];
    const alerting = testDeps(deps.sql, {
      alert: text => {
        sent.push(text);
        return Promise.resolve();
      },
    });
    await raiseAlert(alerting, 'one');
    await raiseAlert(alerting, 'two');
    alerting.clock.advance(HOUR);
    await raiseAlert(alerting, 'three');
    expect(sent).toEqual(['one', 'three']);
  });

  it('still alerts when the database is down, once an hour per instance', async () => {
    const sent: string[] = [];
    const down: Sql = {
      query: () => Promise.reject(new Error('connection refused')),
      transaction: work => work(down),
    };
    const alerting = testDeps(down, {
      alert: text => {
        sent.push(text);
        return Promise.resolve();
      },
    });
    await raiseAlert(alerting, 'one');
    await raiseAlert(alerting, 'two');
    alerting.clock.advance(HOUR);
    await raiseAlert(alerting, 'three');
    expect(sent).toEqual(['one', 'three']);
  });

  it('does nothing without a webhook', async () => {
    await expect(raiseAlert(deps, 'unheard')).resolves.toBeUndefined();
  });
});

describe('an API failure', () => {
  /** The database, failing every query but the error log's. */
  function failing(sql: Sql): Sql {
    const broken: Sql = {
      query: (text, params) =>
        /error_reports|rate_limits/.test(text)
          ? sql.query(text, params)
          : Promise.reject(new Error('connection lost')),
      transaction: work => work(broken),
    };
    return broken;
  }

  it('is recorded, alerted once, and answered with a 500', async () => {
    const sent: string[] = [];
    const broken = testDeps(failing(deps.sql), {
      alert: text => {
        sent.push(text);
        return Promise.resolve();
      },
    });
    const quiet = console.error;
    console.error = () => undefined;
    try {
      for (let i = 0; i < 2; i++) {
        const response = await handle(apiRequest('GET', '/config'), broken);
        expect(response.status).toBe(500);
      }
    } finally {
      console.error = quiet;
    }
    const [row] = await stored(deps.sql);
    expect(row).toMatchObject({
      source: 'api',
      message: 'Error: connection lost',
      count: 2,
      detail: { route: 'GET /config', status: 500, version: 'test' },
    });
    expect(row?.detail['stack']).toContain('connection lost');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('GET /config');
  });

  it('answers even when nothing can be recorded', async () => {
    const down: Sql = {
      query: () => Promise.reject(new Error('connection refused')),
      transaction: work => work(down),
    };
    const quiet = console.error;
    console.error = () => undefined;
    try {
      const response = await handle(apiRequest('GET', '/config'), {
        ...deps,
        sql: down,
        alert: () => Promise.reject(new Error('webhook down')),
      });
      expect(response.status).toBe(500);
    } finally {
      console.error = quiet;
    }
  });

  it('leaves the game’s own answers alone', async () => {
    const { token } = await signIn(deps);
    await handle(
      apiRequest('PUT', '/admin/settings', { token, body: {} }),
      deps
    );
    await handle(apiRequest('GET', '/nope'), deps);
    expect(await stored(deps.sql)).toEqual([]);
  });
});

describe('POST /api/reports', () => {
  const page = (body: unknown) =>
    handle(report('/reports', JSON.stringify(body)), deps);

  it('keeps a page’s error, without queries or the full user agent', async () => {
    const response = await page({
      kind: 'rejection',
      message: 'TypeError: Load failed',
      stack:
        'TypeError: Load failed\n    at https://tick-perfect.test/assets/index-abc.js?v=2:1:300',
      where: 'https://tick-perfect.test/assets/index-abc.js?v=2:1:300',
      path: '/?c=diver.abc.42',
      version: '1.0.0',
      email: 'never@example.com',
    });
    expect(response.status).toBe(204);
    const [row] = await stored(deps.sql);
    expect(row).toEqual({
      source: 'page',
      message: 'TypeError: Load failed',
      count: 1,
      detail: {
        kind: 'rejection',
        stack:
          'TypeError: Load failed\n    at https://tick-perfect.test/assets/index-abc.js:1:300',
        path: '/',
        version: '1.0.0',
        browser: 'Safari 18 · iOS',
      },
    });
  });

  it('needs a message, and a small body', async () => {
    expect((await page({ kind: 'error' })).status).toBe(400);
    expect((await page({ message: 'x'.repeat(9000) })).status).toBe(413);
    expect((await page([])).status).toBe(400);
  });

  it('limits each address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await page({ message: `Error ${String(i)}` })).status);
    }
    expect(statuses.slice(0, 30).every(status => status === 204)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('POST /api/reports/csp', () => {
  const csp = (body: unknown, type: string) =>
    handle(report('/reports/csp', JSON.stringify(body), type), deps);

  it('reads report-uri’s format', async () => {
    const response = await csp(
      {
        'csp-report': {
          'document-uri': 'https://tick-perfect.test/privacy?lang=tr',
          'violated-directive': 'script-src-elem',
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'inline',
          'source-file': 'https://tick-perfect.test/privacy',
          'line-number': 12,
        },
      },
      'application/csp-report'
    );
    expect(response.status).toBe(204);
    expect(await stored(deps.sql)).toEqual([
      {
        source: 'csp',
        message: 'script-src-elem blocked inline',
        count: 1,
        detail: {
          path: '/privacy',
          source: 'https://tick-perfect.test/privacy',
          line: 12,
          browser: 'Safari 18 · iOS',
        },
      },
    ]);
  });

  it('reads the Reporting API’s batches, and skips extensions', async () => {
    await csp(
      [
        {
          type: 'csp-violation',
          url: 'https://tick-perfect.test/',
          body: {
            documentURL: 'https://tick-perfect.test/',
            effectiveDirective: 'connect-src',
            blockedURL: 'https://tracker.example/collect?id=1',
          },
        },
        {
          type: 'csp-violation',
          body: {
            documentURL: 'https://tick-perfect.test/',
            effectiveDirective: 'img-src',
            blockedURL: 'blob:https://tick-perfect.test/5f0c',
          },
        },
        {
          type: 'csp-violation',
          body: {
            documentURL: 'https://tick-perfect.test/',
            effectiveDirective: 'script-src-elem',
            blockedURL: 'chrome-extension://abc/inject.js',
          },
        },
        { type: 'deprecation', body: {} },
      ],
      'application/reports+json'
    );
    expect((await stored(deps.sql)).map(row => row.message)).toEqual([
      'connect-src blocked https://tracker.example/collect',
      'img-src blocked blob:',
    ]);
  });

  it('ignores what isn’t a report', async () => {
    expect(violationsOf({ hello: 'world' })).toEqual([]);
    expect(violationsOf('csp')).toEqual([]);
    expect((await csp({}, 'application/csp-report')).status).toBe(204);
    expect(await stored(deps.sql)).toEqual([]);
  });
});

describe('GET /api/admin/errors', () => {
  it('lists kinds for admins, newest first, and counts the day', async () => {
    const admin = await signIn(deps, { role: 'admin' });
    const player = await signIn(deps);
    await recordError(deps, {
      source: 'api',
      message: 'Old',
      where: 'GET /config',
      detail: {},
    });
    deps.clock.advance(2 * DAY);
    for (let i = 0; i < 3; i++) {
      await recordError(deps, {
        source: 'page',
        message: 'New',
        where: 'a.js:1:1',
        detail: { n: i },
      });
    }
    const get = (route: string, token: string) =>
      handle(apiRequest('GET', route, { token }), deps);

    expect((await get('/admin/errors', player.token)).status).toBe(403);
    const day = (await (await get('/admin/errors', admin.token)).json()) as {
      days: number;
      errors: {
        source: string;
        message: string;
        count: number;
        detail: unknown;
      }[];
    };
    expect(day.days).toBe(1);
    expect(day.errors).toMatchObject([
      { source: 'page', message: 'New', count: 3, detail: { n: 2 } },
    ]);
    const week = (await (
      await get('/admin/errors?days=7', admin.token)
    ).json()) as { errors: { message: string }[] };
    expect(week.errors.map(error => error.message)).toEqual(['New', 'Old']);

    const overview = (await (
      await get('/admin/overview', admin.token)
    ).json()) as { errors: Record<string, number> };
    expect(overview.errors).toEqual({ api: 0, page: 3, csp: 0 });
  });
});

describe('spend', () => {
  it('clears every key’s windows once they are over', async () => {
    const limit = { limit: 5, windowMs: 10 * 60 * 1000 };
    await spend(deps.sql, 'start@203.0.113.1', limit, deps.now());
    deps.clock.advance(HOUR);
    await spend(deps.sql, 'start@203.0.113.2', limit, deps.now());
    const keys = await deps.sql.query<{ key: string }>(
      'select key from game.rate_limits'
    );
    expect(keys.map(row => row.key)).toEqual(['start@203.0.113.2']);
  });

  it('refuses a window longer than an hour', async () => {
    await expect(
      spend(deps.sql, 'x', { limit: 1, windowMs: 2 * HOUR }, deps.now())
    ).rejects.toThrow(RangeError);
  });
});

describe('what anyone can send', () => {
  it('is stored even with characters Postgres refuses', async () => {
    expect(storable('a\u0000b\ud800c')).toBe('abc');
    const response = await handle(
      report(
        '/reports',
        JSON.stringify({ message: 'Bad\u0000 \ud800thing', stack: 'x\u0000' })
      ),
      deps
    );
    expect(response.status).toBe(204);
    expect((await stored(deps.sql))[0]?.message).toBe('Bad thing');
  });

  it('adds only so many new kinds an hour; the rest share one', async () => {
    for (let i = 0; i < NEW_KINDS_PER_HOUR + 5; i++) {
      await recordError(deps, {
        source: 'page',
        message: `Error ${'x'.repeat(i)}`,
        where: '',
        detail: {},
      });
    }
    // A kind already seen this hour still counts as itself.
    await recordError(deps, {
      source: 'page',
      message: 'Error ',
      where: '',
      detail: {},
    });
    const rows = await stored(deps.sql);
    expect(rows).toHaveLength(NEW_KINDS_PER_HOUR + 1);
    expect(rows.find(row => row.message === OVERFLOW)?.count).toBe(5);
    expect(rows.find(row => row.message === 'Error ')?.count).toBe(2);
    // The API's own failures are never folded away.
    await recordError(deps, {
      source: 'api',
      message: 'Real',
      where: 'GET /config',
      detail: {},
    });
    expect((await stored(deps.sql)).map(row => row.message)).toContain('Real');
  });

  it('skips extensions reported by their bare scheme', () => {
    expect(
      violationsOf({
        'csp-report': {
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'chrome-extension',
        },
      })
    ).toEqual([]);
    expect(
      violationsOf([
        {
          type: 'csp-violation',
          body: {
            effectiveDirective: 'style-src-elem',
            blockedURL: 'inline',
            sourceFile: 'moz-extension',
          },
        },
      ])
    ).toEqual([]);
  });
});

describe('the API’s own answers', () => {
  it('gives malformed ids and out-of-range numbers a 4xx, never a 500', async () => {
    const { token } = await signIn(deps);
    const quiet = console.error;
    console.error = () => undefined;
    try {
      expect(
        (
          await handle(
            apiRequest('POST', `/rounds/${'-'.repeat(36)}`, {
              token,
              body: {},
            }),
            deps
          )
        ).status
      ).toBe(404);
      expect(
        (
          await handle(
            apiRequest('GET', '/leaderboard?season=99999999999'),
            deps
          )
        ).status
      ).toBe(400);
    } finally {
      console.error = quiet;
    }
    expect(await stored(deps.sql)).toEqual([]);
  });

  it('tidies up whenever a page asks for the rules', async () => {
    await recordError(deps, {
      source: 'page',
      message: 'Old',
      where: '',
      detail: {},
    });
    await spend(
      deps.sql,
      'start@203.0.113.1',
      { limit: 5, windowMs: 10 * 60 * 1000 },
      deps.now()
    );
    deps.clock.advance(31 * DAY);
    expect((await handle(apiRequest('GET', '/config'), deps)).status).toBe(200);
    expect(await stored(deps.sql)).toEqual([]);
    expect(await deps.sql.query('select key from game.rate_limits')).toEqual(
      []
    );
  });
});
