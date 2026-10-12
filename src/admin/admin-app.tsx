import { useEffect, useState } from 'react';

import { Button } from '../components/buttons';
import { online, ONLINE, useOnline, type Role } from '../online';
import { ApiFailure } from '../online/api';
import {
  AuditPanel,
  SettingsPanel,
  type AdminSettings,
} from './admin-settings';
import { ErrorsPanel, type ErrorSource } from './admin-errors';
import { ModerationPanel } from './admin-moderation';
import { RulesPanel, type LiveSeasonRow } from './admin-rules';
import { failureText } from './failure';

// The admin panel at /admin: tune a watch's rules and publish them as a new
// season or an event, moderate the boards, read the error log, flip the
// switches. The server
// checks every call; this page only shows what the signed-in role may use.
// English only: it is a tool for whoever runs the game.

export interface Overview {
  readonly you: { readonly displayName: string; readonly role: Role };
  readonly seasons: readonly LiveSeasonRow[];
  readonly flagged: number;
  readonly settings: AdminSettings;
  /** The last day's errors, by where they came from. */
  readonly errors: Readonly<Record<ErrorSource, number>>;
}

type Tab = 'rules' | 'moderation' | 'errors' | 'settings' | 'audit';

const TABS: readonly { id: Tab; label: string; superOnly: boolean }[] = [
  { id: 'rules', label: 'Rules & seasons', superOnly: false },
  { id: 'moderation', label: 'Moderation', superOnly: false },
  { id: 'errors', label: 'Errors', superOnly: false },
  { id: 'settings', label: 'Switches', superOnly: true },
  { id: 'audit', label: 'Audit log', superOnly: true },
];

export default function AdminApp() {
  const status = useOnline(state => state.status);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rules');

  useEffect(() => {
    document.getElementById('root')?.removeAttribute('data-shell');
    document.title = 'Tick Perfect admin';
    online.start();
  }, []);
  // A tool, drawn for the dark studio only, whatever the game's theme
  // (public/boot.js does the same before the first paint).
  useEffect(() => {
    const root = document.documentElement;
    const theme = root.dataset['theme'];
    root.dataset['theme'] = 'dark';
    return () => {
      if (theme === undefined) root.removeAttribute('data-theme');
      else root.dataset['theme'] = theme;
    };
  }, []);

  const load = () => {
    online
      .call<Overview>('/admin/overview')
      .then(value => {
        setOverview(value);
        setProblem(null);
      })
      .catch((error: unknown) => {
        setOverview(null);
        setProblem(
          error instanceof ApiFailure && error.status === 403
            ? 'This account isn’t an admin. Roles are granted in the database (see docs/BACKEND.md).'
            : failureText(error)
        );
      });
  };
  useEffect(() => {
    if (status === 'signedIn') load();
  }, [status]);

  const superAdmin = overview?.you.role === 'super_admin';
  const errorCount = overview
    ? overview.errors.api + overview.errors.page + overview.errors.csp
    : 0;

  return (
    <main
      data-testid="admin-app"
      className="min-h-dvh bg-neutral-950 px-6 py-8 text-sm text-neutral-200"
    >
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-xs tracking-[0.4em] text-neutral-300 uppercase">
            Tick Perfect · Admin
          </h1>
          {overview && (
            <p className="text-xs text-neutral-400">
              {overview.you.displayName} · {overview.you.role.replace('_', ' ')}
            </p>
          )}
        </header>

        {!ONLINE && (
          <p className="mt-8" data-testid="admin-offline">
            This build has no online side: set VITE_SUPABASE_URL and
            VITE_SUPABASE_PUBLISHABLE_KEY (see docs/BACKEND.md).
          </p>
        )}

        {ONLINE && status === 'loading' && <p className="mt-8">Signing in…</p>}

        {ONLINE && status === 'signedOut' && (
          <div
            className="mt-8 flex max-w-xs flex-col gap-2"
            data-testid="admin-sign-in"
          >
            <p className="mb-2 text-neutral-400">
              Sign in with an admin account.
            </p>
            <Button onClick={() => void online.signIn('google')}>
              Continue with Google
            </Button>
            <Button onClick={() => void online.signIn('github')}>
              Continue with GitHub
            </Button>
          </div>
        )}

        {problem && (
          <p
            data-testid="admin-problem"
            role="alert"
            className="mt-8 text-amber-100"
          >
            {problem}
          </p>
        )}

        {overview && (
          <>
            <nav className="mt-6 flex flex-wrap gap-2" aria-label="Sections">
              {TABS.filter(item => superAdmin || !item.superOnly).map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => {
                    setTab(item.id);
                  }}
                  className={`min-h-9 rounded-full border px-4 text-xs ${
                    tab === item.id
                      ? 'border-white/40 bg-white/10 text-neutral-100'
                      : 'border-white/10 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {item.label}
                  {item.id === 'moderation' && overview.flagged > 0 && (
                    <span className="ml-2 rounded-full bg-amber-200/20 px-1.5 text-amber-100">
                      {overview.flagged}
                    </span>
                  )}
                  {item.id === 'errors' && errorCount > 0 && (
                    <span
                      data-testid="admin-errors-count"
                      className={`ml-2 rounded-full px-1.5 ${
                        overview.errors.api > 0
                          ? 'bg-red-300/20 text-red-100'
                          : 'bg-white/10 text-neutral-200'
                      }`}
                    >
                      {errorCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <section className="mt-6">
              {tab === 'rules' && (
                <RulesPanel
                  seasons={overview.seasons}
                  superAdmin={superAdmin}
                  onChanged={load}
                />
              )}
              {tab === 'moderation' && <ModerationPanel onChanged={load} />}
              {tab === 'errors' && <ErrorsPanel />}
              {tab === 'settings' && superAdmin && (
                <SettingsPanel settings={overview.settings} onChanged={load} />
              )}
              {tab === 'audit' && superAdmin && <AuditPanel />}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
