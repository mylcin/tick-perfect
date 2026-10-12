import type { Deps } from './deps.js';
import { reportFailure } from './errors.js';
import { ApiError, clientAddress, errorResponse, json } from './http.js';
import * as admin from './routes/admin.js';
import * as me from './routes/me.js';
import { config, leaderboard } from './routes/public.js';
import { reportPageError, reportViolation } from './routes/reports.js';
import { startRound, submitRound } from './routes/rounds.js';

// The whole API behind one function: Vercel's free plan counts functions,
// and every route shares the same connection and checks.

interface Route {
  readonly method: string;
  readonly path: RegExp;
  readonly handle: (
    request: Request,
    url: URL,
    deps: Deps,
    params: readonly string[]
  ) => Promise<Response>;
}

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';

const ROUTES: readonly Route[] = [
  { method: 'GET', path: /^\/config$/, handle: (_r, _u, deps) => config(deps) },
  {
    method: 'GET',
    path: /^\/leaderboard$/,
    handle: (r, u, deps) => leaderboard(r, u, deps),
  },
  {
    method: 'POST',
    path: /^\/rounds$/,
    handle: (r, _u, deps) => startRound(r, deps, clientAddress(r)),
  },
  {
    method: 'POST',
    path: new RegExp(`^/rounds/${ID}$`),
    handle: (r, _u, deps, [id = '']) => submitRound(r, deps, id),
  },
  {
    method: 'POST',
    path: /^\/reports$/,
    handle: (r, _u, deps) => reportPageError(r, deps, clientAddress(r)),
  },
  {
    method: 'POST',
    path: /^\/reports\/csp$/,
    handle: (r, _u, deps) => reportViolation(r, deps, clientAddress(r)),
  },
  { method: 'GET', path: /^\/me$/, handle: (r, _u, deps) => me.getMe(r, deps) },
  {
    method: 'PATCH',
    path: /^\/me$/,
    handle: (r, _u, deps) => me.renameMe(r, deps),
  },
  {
    method: 'DELETE',
    path: /^\/me$/,
    handle: (r, _u, deps) => me.deleteMe(r, deps),
  },
  {
    method: 'GET',
    path: /^\/me\/progress$/,
    handle: (r, _u, deps) => me.getProgress(r, deps),
  },
  {
    method: 'PUT',
    path: /^\/me\/progress$/,
    handle: (r, _u, deps) => me.putProgress(r, deps),
  },
  {
    method: 'GET',
    path: /^\/admin\/overview$/,
    handle: (r, _u, deps) => admin.overview(r, deps),
  },
  {
    method: 'GET',
    path: /^\/admin\/rulesets$/,
    handle: (r, u, deps) => admin.listRulesets(r, u, deps),
  },
  {
    method: 'POST',
    path: /^\/admin\/rulesets$/,
    handle: (r, _u, deps) => admin.createRuleset(r, deps),
  },
  {
    method: 'POST',
    path: /^\/admin\/rulesets\/preview$/,
    handle: (r, _u, deps) => admin.previewRules(r, deps),
  },
  {
    method: 'POST',
    path: /^\/admin\/seasons$/,
    handle: (r, _u, deps) => admin.publishSeason(r, deps),
  },
  {
    method: 'PUT',
    path: /^\/admin\/settings$/,
    handle: (r, _u, deps) => admin.putSetting(r, deps),
  },
  {
    method: 'GET',
    path: /^\/admin\/rounds$/,
    handle: (r, u, deps) => admin.listRounds(r, u, deps),
  },
  {
    method: 'PATCH',
    path: new RegExp(`^/admin/rounds/${ID}$`),
    handle: (r, _u, deps, [id = '']) => admin.reviewRound(r, deps, id),
  },
  {
    method: 'GET',
    path: /^\/admin\/users$/,
    handle: (r, u, deps) => admin.findUsers(r, u, deps),
  },
  {
    method: 'POST',
    path: new RegExp(`^/admin/users/${ID}/ban$`),
    handle: (r, _u, deps, [id = '']) => admin.banUser(r, deps, id),
  },
  {
    method: 'GET',
    path: /^\/admin\/audit$/,
    handle: (r, _u, deps) => admin.auditLog(r, deps),
  },
  {
    method: 'GET',
    path: /^\/admin\/errors$/,
    handle: (r, u, deps) => admin.listErrors(r, u, deps),
  },
];

/**
 * The route a request asks for, under /api. A rewrite may hand it over as
 * `?route=`; otherwise it is the path itself.
 */
export function routeOf(url: URL): string {
  const rewritten = url.searchParams.get('route');
  if (rewritten !== null) return `/${rewritten.replace(/^\/+/, '')}`;
  return url.pathname.replace(/^\/api/, '') || '/';
}

/**
 * Answers one API request. Never throws: every failure is a response. A
 * failure of the API's own (a 500) is also recorded, and raises an alert.
 */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = routeOf(url);
  try {
    const matching = ROUTES.filter(route => route.path.test(path));
    if (matching.length === 0)
      throw new ApiError(404, 'notFound', 'No such endpoint');
    const route = matching.find(
      candidate => candidate.method === request.method
    );
    if (!route) {
      return json(
        { error: { code: 'method', message: 'Method not allowed' } },
        { status: 405 }
      );
    }
    const params = route.path.exec(path)?.slice(1) ?? [];
    return await route.handle(request, url, deps, params);
  } catch (error) {
    const known = error instanceof ApiError;
    // Anything else is an answer, such as 503 for a closed leaderboard.
    if (known && error.status !== 500) return errorResponse(error);
    console.error(error);
    await reportFailure(deps, request.method, path, error);
    return errorResponse(
      known ? error : new ApiError(500, 'internal', 'Something went wrong')
    );
  }
}
