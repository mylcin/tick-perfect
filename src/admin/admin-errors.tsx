import { useEffect, useState } from 'react';

import { online } from '../online';
import { failureText } from './failure';

// The game's error log: the API's failures, errors pages ran into and what
// the content security policy blocked, by kind, the latest first. Nothing
// in it names a player (docs/BACKEND.md, "Errors and alerts").

export type ErrorSource = 'api' | 'page' | 'csp';

interface ErrorKind {
  readonly id: string;
  readonly source: ErrorSource;
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
  readonly message: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

const SOURCES: Readonly<Record<ErrorSource, string>> = {
  api: 'API',
  page: 'Page',
  csp: 'Policy',
};

const PERIODS = [
  [1, 'Last day'],
  [7, 'Last week'],
  [30, 'Last 30 days'],
] as const;

export function ErrorsPanel() {
  const [days, setDays] = useState<number>(1);
  const [errors, setErrors] = useState<readonly ErrorKind[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    online
      .call<{ errors: ErrorKind[] }>(`/admin/errors?days=${String(days)}`)
      .then(value => {
        setErrors(value.errors);
        setMessage(null);
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  }, [days]);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Period"
        className="flex flex-wrap gap-2 text-xs"
      >
        {PERIODS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={days === value}
            onClick={() => {
              setDays(value);
            }}
            className={`min-h-9 rounded-full border px-4 ${
              days === value
                ? 'border-white/40 bg-white/10 text-neutral-100'
                : 'border-white/10 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p role="status" className="text-xs text-amber-100">
          {message}
        </p>
      )}

      {errors?.length === 0 && (
        <p data-testid="admin-errors-empty" className="text-neutral-400">
          No errors in this period.
        </p>
      )}

      <ul data-testid="admin-errors" className="flex flex-col gap-2">
        {errors?.map(error => (
          <li
            key={error.id}
            data-testid="admin-error"
            data-source={error.source}
            className="rounded-xl border border-white/10 px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rounded-full border border-white/15 px-2 text-xs text-neutral-300">
                {SOURCES[error.source]}
              </span>
              <span className="min-w-0 flex-1 font-mono text-xs break-words text-neutral-100">
                {error.message}
              </span>
              <span className="text-xs text-neutral-400 tabular-nums">
                ×{error.count} · last {new Date(error.lastAt).toLocaleString()}
              </span>
            </div>
            <details className="mt-2 text-xs text-neutral-400">
              <summary className="cursor-pointer">
                Latest sample, first seen{' '}
                {new Date(error.firstAt).toLocaleString()}
              </summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {Object.entries(error.detail)
                  .filter(([, value]) => value !== null && value !== '')
                  .map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-neutral-500">{key}</dt>
                      <dd className="font-mono break-all whitespace-pre-wrap text-neutral-300">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
