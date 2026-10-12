import type { Deps } from '../deps.js';
import { browserOf, clip, recordError, type ErrorReport } from '../errors.js';
import { ApiError, objectBody, readJson } from '../http.js';
import { spend } from '../rate-limit.js';

// Reports the browser sends on its own: an error the page ran into, and
// what the content security policy blocked. Anyone may send them, signed in
// or not, so they are small, limited per address and in all, and kept
// without anything that names the sender.

const PAGE_LIMIT_BYTES = 8 * 1024;
const CSP_LIMIT_BYTES = 16 * 1024;
const BY_ADDRESS = { limit: 30, windowMs: 10 * 60 * 1000 };
/** Past this, a flood (or a bad release) is already plain to see. */
const IN_ALL = { limit: 600, windowMs: 60 * 60 * 1000 };
/** Violations a browser may batch into one report. */
const MAX_VIOLATIONS = 5;

const KINDS = new Set(['error', 'rejection', 'render']);

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * URLs in `text` without their queries and fragments, which may hold
 * anything; a stack frame's line and column stay.
 */
function withoutQuery(text: string): string {
  return text.replace(/[?#][^\s)]*?(?=(?::\d+){0,2}(?:[\s)]|$))/g, '');
}

async function limit(deps: Deps, address: string): Promise<void> {
  const now = deps.now();
  await spend(deps.sql, `report@${address}`, BY_ADDRESS, now);
  await spend(deps.sql, 'report:all', IN_ALL, now);
}

/** POST /api/reports: an error the page ran into. */
export async function reportPageError(
  request: Request,
  deps: Deps,
  address: string
): Promise<Response> {
  const body = objectBody(await readJson(request, PAGE_LIMIT_BYTES));
  await limit(deps, address);
  const message = textOf(body['message']);
  if (!message)
    throw new ApiError(400, 'badReport', 'A report needs a message');
  const kind = textOf(body['kind']);
  const stack = textOf(body['stack']);
  const where = textOf(body['where']);
  const path = textOf(body['path']);
  const version = textOf(body['version']);
  await recordError(deps, {
    source: 'page',
    message,
    where: clip(withoutQuery(where ?? ''), 300),
    detail: {
      kind: kind !== null && KINDS.has(kind) ? kind : 'error',
      stack: stack && clip(withoutQuery(stack), 2000),
      path: path && clip(withoutQuery(path), 200),
      version: version && clip(version, 40),
      browser: browserOf(request.headers.get('user-agent')),
    },
  });
  return new Response(null, { status: 204 });
}

interface Violation {
  readonly directive: string;
  readonly blocked: string;
  readonly document: string;
  readonly source: string;
  readonly line: number | null;
}

/**
 * Browser extensions inject their own code, which isn't the game's.
 * Browsers report a blocked extension script as the bare scheme.
 */
const EXTENSION = /^(chrome|moz|safari|safari-web|ms-browser)-extension(:|$)/;

/**
 * A resource as a kind: a keyword ("inline", "eval"), a web URL's origin
 * and path, or another URL's scheme ("data:", "blob:").
 */
function resourceOf(value: string): string {
  if (!value.includes(':')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? `${url.origin}${url.pathname}`
      : url.protocol;
  } catch {
    return `${value.split(':')[0] ?? ''}:`;
  }
}

/** A page's path alone. */
function pathOf(value: string): string {
  try {
    return new URL(value, 'https://page.invalid').pathname;
  } catch {
    return '';
  }
}

/**
 * The violations in a report, in either format: `report-uri`'s single
 * `{"csp-report": …}`, or the Reporting API's array of reports.
 */
export function violationsOf(value: unknown): Violation[] {
  const field = (record: Record<string, unknown>, ...names: string[]) => {
    for (const name of names) {
      const found = record[name];
      if (typeof found === 'string') return found;
      if (typeof found === 'number') return String(found);
    }
    return '';
  };
  const parse = (record: Record<string, unknown>): Violation => {
    const line = Number(field(record, 'lineNumber', 'line-number'));
    return {
      directive:
        (
          field(record, 'effectiveDirective', 'effective-directive') ||
          field(record, 'violated-directive')
        ).split(' ')[0] ?? '',
      blocked: field(record, 'blockedURL', 'blocked-uri'),
      document: field(record, 'documentURL', 'document-uri'),
      source: field(record, 'sourceFile', 'source-file'),
      line: Number.isInteger(line) && line > 0 ? line : null,
    };
  };
  const records: Record<string, unknown>[] = [];
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) {
      const report = item as Record<string, unknown> | null;
      if (
        report?.['type'] === 'csp-violation' &&
        typeof report['body'] === 'object' &&
        report['body'] !== null
      ) {
        records.push(report['body'] as Record<string, unknown>);
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    const report = (value as Record<string, unknown>)['csp-report'];
    if (typeof report === 'object' && report !== null) {
      records.push(report as Record<string, unknown>);
    }
  }
  return records
    .map(parse)
    .filter(
      violation =>
        violation.directive !== '' &&
        !EXTENSION.test(violation.blocked) &&
        !EXTENSION.test(violation.source)
    )
    .slice(0, MAX_VIOLATIONS);
}

/** The report a violation is kept as. */
function violationReport(violation: Violation, browser: string): ErrorReport {
  const blocked = resourceOf(violation.blocked || 'unknown');
  return {
    source: 'csp',
    message: `${violation.directive} blocked ${blocked}`,
    where: `${violation.directive} ${blocked}`,
    detail: {
      path: violation.document && clip(pathOf(violation.document), 200),
      source: violation.source && clip(resourceOf(violation.source), 300),
      line: violation.line,
      browser,
    },
  };
}

/** POST /api/reports/csp: what the content security policy blocked. */
export async function reportViolation(
  request: Request,
  deps: Deps,
  address: string
): Promise<Response> {
  const violations = violationsOf(await readJson(request, CSP_LIMIT_BYTES));
  const browser = browserOf(request.headers.get('user-agent'));
  for (const violation of violations) {
    // Each violation counts against the limits, batched or not.
    await limit(deps, address);
    await recordError(deps, violationReport(violation, browser));
  }
  return new Response(null, { status: 204 });
}
