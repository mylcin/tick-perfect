// Errors the page runs into, sent to the game's own error log (POST
// /api/reports) so whoever runs the game hears of them. A report holds the
// error and where in the code it happened, the game's version and the
// page's path; never who is playing. A page sends a few at most, each kind
// once.

export type PageErrorKind = 'error' | 'rejection' | 'render';

export interface PageErrorReport {
  readonly kind: PageErrorKind;
  readonly message: string;
  readonly stack: string | null;
  readonly where: string | null;
  readonly path: string;
  readonly version: string;
}

interface PageErrorDeps {
  readonly send: (report: PageErrorReport) => void;
  readonly version: string;
  /** The page's origin: errors from other scripts aren't the game's. */
  readonly origin: string;
  readonly path: () => string;
  /** Reports a page sends at most. */
  readonly limit?: number;
  /** While true, nothing is sent: a reload is about to fix the error. */
  readonly paused?: () => boolean;
}

interface PageErrors {
  /** Reports `error` unless it is noise, already sent, or one too many. */
  report: (kind: PageErrorKind, error: unknown, where?: string) => void;
}

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

/** Errors that say nothing about the game. */
const NOISE = [
  // A script from another origin: the browser hides what went wrong.
  /^Script error\.?$/,
  // The browser skipped a layout pass; harmless.
  /^ResizeObserver loop/,
];

/** Code the game didn't write: browser extensions, injected scripts. */
const FOREIGN = /(chrome|moz|safari|safari-web)-extension:\/\//;

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  if (typeof error === 'string') return error;
  try {
    // Undefined for undefined, a function or a symbol.
    const json = JSON.stringify(error) as string | undefined;
    return json ?? String(error);
  } catch {
    return String(error);
  }
}

export function createPageErrors({
  send,
  version,
  origin,
  path,
  limit = 5,
  paused = () => false,
}: PageErrorDeps): PageErrors {
  const seen = new Set<string>();
  // The same error can arrive twice, say from an error boundary and from
  // the window (React Three Fiber rethrows what its canvas catches).
  const sent = new WeakSet<object>();
  return {
    report(kind, error, where) {
      if (seen.size >= limit || paused()) return;
      if (typeof error === 'object' && error !== null && sent.has(error)) {
        return;
      }
      const message = messageOf(error).slice(0, MAX_MESSAGE);
      const stack =
        error instanceof Error && error.stack
          ? error.stack.slice(0, MAX_STACK)
          : null;
      if (message === '' || NOISE.some(pattern => pattern.test(message))) {
        return;
      }
      if (where && !where.startsWith(origin)) return;
      if (stack && FOREIGN.test(stack)) return;
      const key = `${kind}\n${message}\n${where ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (typeof error === 'object' && error !== null) sent.add(error);
      send({
        kind,
        message,
        stack,
        where: where ?? null,
        path: path(),
        version,
      });
    },
  };
}

/** Listens for errors and promise rejections nothing else caught. */
export function listenForErrors(target: Window, errors: PageErrors): void {
  target.addEventListener('error', event => {
    const where = event.filename
      ? `${event.filename}:${String(event.lineno)}:${String(event.colno)}`
      : undefined;
    errors.report('error', (event.error as unknown) ?? event.message, where);
  });
  target.addEventListener('unhandledrejection', event => {
    errors.report('rejection', event.reason);
  });
}

/** Sends a report without holding the page up, and outliving it. */
export function sendReport(report: PageErrorReport): void {
  fetch('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => undefined);
}
