import { beforeAll, describe, expect, it } from 'vitest';

import { handle, routeOf } from './router.js';
import {
  apiRequest,
  DATABASE_HOOK_MS,
  testDatabase,
  testDeps,
} from './test-support.js';

let deps: ReturnType<typeof testDeps>;
beforeAll(async () => {
  deps = testDeps((await testDatabase()).sql);
}, DATABASE_HOOK_MS);

describe('routeOf', () => {
  it('reads the route from the path, or from a rewrite', () => {
    expect(routeOf(new URL('https://x.test/api/rounds'))).toBe('/rounds');
    expect(routeOf(new URL('https://x.test/api?route=admin/overview'))).toBe(
      '/admin/overview'
    );
    expect(routeOf(new URL('https://x.test/api'))).toBe('/');
  });
});

describe('handle', () => {
  it('answers an unknown endpoint with 404 and a wrong method with 405', async () => {
    expect((await handle(apiRequest('GET', '/nope'), deps)).status).toBe(404);
    expect((await handle(apiRequest('DELETE', '/config'), deps)).status).toBe(
      405
    );
  });

  it('answers bad JSON with 400', async () => {
    const request = new Request('https://x.test/api/rounds', {
      method: 'POST',
      headers: { authorization: 'Bearer x' },
      body: '{',
    });
    // Unauthorised first: the token is checked before the body is read.
    expect((await handle(request, deps)).status).toBe(401);
  });

  it('serves the live rules for every watch, cacheable', async () => {
    const response = await handle(apiRequest('GET', '/config'), deps);
    expect(response.headers.get('cache-control')).toContain('s-maxage');
    const config = (await response.json()) as { seasons: { watch: string }[] };
    expect(config.seasons.map(season => season.watch)).toEqual([
      'diver',
      'chronograph',
      'gmt',
      'moonphase',
      'tourbillon',
      'grandComplication',
      'field',
      'pilot',
      'digital',
    ]);
  });

  it('hides an internal failure behind a 500', async () => {
    const broken = testDeps({
      query: () => Promise.reject(new Error('connection lost')),
      transaction: work => work(broken.sql),
    });
    const quiet = console.error;
    console.error = () => undefined;
    try {
      const response = await handle(apiRequest('GET', '/config'), broken);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: 'internal', message: 'Something went wrong' },
      });
    } finally {
      console.error = quiet;
    }
  });

  it('names the board a leaderboard query asks for', async () => {
    const board = async (query: string) =>
      handle(apiRequest('GET', `/leaderboard${query}`), deps);
    expect((await board('?daily=12')).status).toBe(200);
    expect((await board('?season=999')).status).toBe(404);
    expect((await board('?watch=sundial')).status).toBe(400);
    expect((await board('')).status).toBe(400);
  });
});
