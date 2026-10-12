import { createHash } from 'node:crypto';

import type { Deps } from './deps.js';
import { ApiError } from './http.js';
import { spend } from './rate-limit.js';

// The game's own error log: the API's failures, errors the page runs into
// and what the content security policy blocks, counted per kind and hour in
// game.error_reports and read in the admin panel. Nothing here names a
// player. An API failure also raises an alert, at most one an hour, when a
// webhook is set.

export type ErrorSource = 'api' | 'page' | 'csp';

export type ErrorDetail = Readonly<Record<string, string | number | null>>;

export interface ErrorReport {
  readonly source: ErrorSource;
  /** What went wrong, in a line. */
  readonly message: string;
  /** Where: an API route, a script's file and line, a policy directive. */
  readonly where: string;
  /** The particulars of this occurrence, kept as the kind's latest sample. */
  readonly detail: ErrorDetail;
}

/** Hours of reports older than this are deleted. */
export const ERROR_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** One alert an hour at most, however many failures. */
const ALERT_LIMIT = { limit: 1, windowMs: HOUR_MS };

const MAX_MESSAGE = 500;
/**
 * New kinds of page and policy errors an hour may add. Anyone can send
 * those, so past this the rest are counted together, in one kind, and
 * can't fill the database.
 */
export const NEW_KINDS_PER_HOUR = 50;
export const OVERFLOW = 'More new kinds this hour than are kept; counted here';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `text` cut to `length` characters, whole code points. */
export function clip(text: string, length: number): string {
  const points = text.match(/[\s\S]/gu) ?? [];
  return points.length > length
    ? `${points.slice(0, length - 1).join('')}…`
    : text;
}

/**
 * The kind an error belongs to: the same message from the same place,
 * whatever ids or numbers it mentions.
 */
export function fingerprintOf(
  report: Pick<ErrorReport, 'source' | 'message' | 'where'>
): string {
  const general = (text: string) =>
    text.replace(UUID, ':id').replace(/\d{3,}/g, '#');
  return createHash('sha256')
    .update(
      `${report.source}\n${general(report.message)}\n${general(report.where)}`
    )
    .digest('hex')
    .slice(0, 16);
}

/** Text Postgres can store: without NUL characters or lone surrogates. */
export function storable(text: string): string {
  return text.replace(/\0|\p{Cs}/gu, '');
}

function storableDetail(detail: ErrorDetail): ErrorDetail {
  return Object.fromEntries(
    Object.entries(detail).map(([key, value]) => [
      key,
      typeof value === 'string' ? storable(value) : value,
    ])
  );
}

/** Counts one error in its kind's current hour. */
export async function recordError(
  deps: Deps,
  report: ErrorReport
): Promise<void> {
  const now = deps.now();
  const hour = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  let message = storable(report.message);
  let detail = storableDetail(report.detail);
  let fingerprint = fingerprintOf({
    source: report.source,
    message,
    where: storable(report.where),
  });
  if (report.source !== 'api') {
    const [known] = await deps.sql.query<{
      kinds: number;
      seen: boolean | null;
    }>(
      `select count(*)::int as kinds, bool_or(fingerprint = $3) as seen
       from game.error_reports where hour = $1 and source = $2`,
      [hour, report.source, fingerprint]
    );
    if (!known?.seen && (known?.kinds ?? 0) >= NEW_KINDS_PER_HOUR) {
      message = OVERFLOW;
      detail = {};
      fingerprint = fingerprintOf({
        source: report.source,
        message,
        where: '',
      });
    }
  }
  const [row] = await deps.sql.query<{ count: number }>(
    `insert into game.error_reports as e
       (fingerprint, hour, source, message, detail, first_at, last_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $6)
     on conflict (fingerprint, hour) do update
       set count = e.count + 1,
           message = excluded.message,
           detail = excluded.detail,
           last_at = excluded.last_at
     returning count`,
    [
      fingerprint,
      hour,
      report.source,
      clip(message, MAX_MESSAGE),
      JSON.stringify(detail),
      now,
    ]
  );
  // A new kind-hour is rare enough to tidy up on.
  if (row?.count === 1) {
    await deps.sql.query('delete from game.error_reports where hour < $1', [
      new Date(now.getTime() - ERROR_RETENTION_MS),
    ]);
  }
}

/** When this instance last alerted, for when the database can't say. */
const lastAlert = new WeakMap<Deps, number>();

/**
 * Sends `text` to the alert webhook, unless an alert went out in the last
 * hour. The database keeps that hour across instances; when it can't be
 * reached (likely the failure itself), each instance keeps its own.
 */
export async function raiseAlert(deps: Deps, text: string): Promise<void> {
  if (!deps.alert) return;
  const now = deps.now();
  try {
    await spend(deps.sql, 'alert:api', ALERT_LIMIT, now);
  } catch (error) {
    if (error instanceof ApiError) return;
    const last = lastAlert.get(deps);
    if (last !== undefined && now.getTime() - last < HOUR_MS) return;
  }
  lastAlert.set(deps, now.getTime());
  await deps.alert(text);
}

/** An API route with its ids taken out, so a route is one kind. */
export function routeKind(method: string, route: string): string {
  return `${method} ${route.replace(UUID, ':id')}`;
}

/**
 * Records an API failure and raises the alert. Never throws: a failure to
 * report is logged and the request's own answer goes out regardless.
 */
export async function reportFailure(
  deps: Deps,
  method: string,
  route: string,
  error: unknown
): Promise<void> {
  const where = routeKind(method, route);
  const known = error instanceof ApiError;
  const message =
    error instanceof Error
      ? `${known ? error.code : error.name}: ${error.message}`
      : String(error);
  const stack = error instanceof Error && !known ? (error.stack ?? null) : null;
  try {
    await recordError(deps, {
      source: 'api',
      message,
      where,
      detail: {
        route: where,
        status: 500,
        stack: stack && clip(stack, 4000),
        version: deps.version,
      },
    });
  } catch (failure) {
    console.error('Could not record an error', failure);
  }
  try {
    await raiseAlert(
      deps,
      `Tick Perfect: the API failed on ${where}: ${clip(message, 200)}. ` +
        'Errors in the last hour are in the admin panel, under Errors.'
    );
  } catch (failure) {
    console.error('Could not raise an alert', failure);
  }
}

/** A browser and its system, from a user agent: "Safari 18 · iOS". */
export function browserOf(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  const system = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : userAgent.includes('Android')
      ? 'Android'
      : userAgent.includes('CrOS')
        ? 'ChromeOS'
        : userAgent.includes('Windows')
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'macOS'
            : userAgent.includes('Linux')
              ? 'Linux'
              : 'other';
  // Most specific first: Edge, Opera and Samsung's say "Chrome" too.
  const browsers: readonly (readonly [string, RegExp])[] = [
    ['Edge', /Edg(?:A|iOS)?\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/],
  ];
  for (const [name, pattern] of browsers) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return `${name} ${version} · ${system}`;
  }
  return `other · ${system}`;
}
