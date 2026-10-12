import { useEffect, useId, useState, type SubmitEvent } from 'react';

import { Button, FOCUS, IconButton } from '../components/buttons';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/modal';
import { useToday } from '../hooks/use-today';
import type { Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { online, useOnline, type Board } from '../online';
import { ApiFailure } from '../online/api';
import { dailyWatch } from '../state/daily';
import { useSession } from '../state/session';
import { WATCHES, type WatchId } from '../watches';

type BoardChoice = 'season' | 'daily';

/**
 * The online boards: the watch on show's season and today's Daily, with
 * signing in, renaming and leaving underneath. Opened from the title, in a
 * build that has the online side.
 */
export function LeaderboardDialog() {
  const t = useT();
  const open = useSession(state => state.leaderboardOpen);
  const setOpen = useSession(state => state.setLeaderboardOpen);
  const close = () => {
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      labelledBy="leaderboard-heading"
      onCancel={close}
      testId="leaderboard-dialog"
    >
      <div className="absolute inset-0 bg-surface/60" onClick={close} />
      <div className="absolute inset-y-0 right-0 flex w-full animate-rise flex-col overflow-y-auto border-l border-ink/10 bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-6 sm:max-w-sm">
        <div className="flex items-center justify-between">
          <h2
            id="leaderboard-heading"
            className="text-xs tracking-[0.4em] text-ink-2 uppercase"
          >
            {t.leaderboard.title}
          </h2>
          <IconButton
            label={t.leaderboard.close}
            data-testid="leaderboard-close"
            data-autofocus
            onClick={close}
          >
            <CloseIcon />
          </IconButton>
        </div>
        <Boards t={t} />
        <Account t={t} />
      </div>
    </Modal>
  );
}

function Boards({ t }: { t: Dictionary }) {
  const watch = useSession(state => state.watch);
  const today = useToday();
  const announcement = useOnline(state => state.config?.announcement ?? null);
  const season = useOnline(state => state.config?.seasons[watch] ?? null);
  const [choice, setChoice] = useState<BoardChoice>('season');
  const choices: readonly [BoardChoice, string][] = [
    [
      'season',
      season?.kind === 'event' && season.name
        ? t.leaderboard.event(season.name)
        : t.leaderboard.season(WATCHES[watch].name),
    ],
    ['daily', t.leaderboard.daily(today)],
  ];

  return (
    <section className="mt-4">
      {announcement && (
        <p
          data-testid="leaderboard-announcement"
          className="mb-4 rounded-xl border border-accent/30 px-3 py-2 text-xs text-accent"
        >
          {announcement}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={t.leaderboard.boards}
        className="flex gap-2"
      >
        {choices.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={choice === id}
            onClick={() => {
              setChoice(id);
            }}
            className={`min-h-9 rounded-full border px-3 text-xs transition-colors ${
              choice === id
                ? 'border-ink/40 bg-ink/10 text-ink'
                : 'border-ink/10 text-ink-3 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <BoardList
        t={t}
        watch={choice === 'season' ? watch : dailyWatch(today)}
        daily={choice === 'season' ? null : today}
      />
    </section>
  );
}

type Loaded =
  | { readonly state: 'loading' }
  | { readonly state: 'closed' | 'unreachable' }
  | { readonly state: 'ready'; readonly board: Board };

function BoardList({
  t,
  watch,
  daily,
}: {
  t: Dictionary;
  watch: WatchId;
  /** A Daily's board, or the watch's season when null. */
  daily: number | null;
}) {
  // Who is looking: signing in or out changes their own row, and a new
  // name or a deleted account changes the board itself.
  const status = useOnline(state => state.status);
  const viewer = useOnline(state =>
    state.profile
      ? `${state.profile.id}:${state.profile.displayName}`
      : state.status
  );
  const key = daily === null ? watch : `daily:${String(daily)}`;
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded }>({
    key: '',
    value: { state: 'loading' },
  });

  useEffect(() => {
    let current = true;
    online
      .board(daily === null ? { watch } : { daily })
      .then(board => {
        if (current) setLoaded({ key, value: { state: 'ready', board } });
      })
      .catch((error: unknown) => {
        if (!current) return;
        const closed = error instanceof ApiFailure && error.status === 503;
        setLoaded({
          key,
          value: { state: closed ? 'closed' : 'unreachable' },
        });
      });
    return () => {
      current = false;
    };
  }, [key, watch, daily, viewer]);

  const value: Loaded =
    loaded.key === key ? loaded.value : { state: 'loading' };

  if (value.state === 'loading') {
    return (
      <p className="mt-4 text-sm text-ink-3" role="status">
        {t.leaderboard.loading}
      </p>
    );
  }
  if (value.state !== 'ready') {
    return (
      <p
        data-testid="leaderboard-error"
        data-error={value.state}
        className="mt-4 text-sm text-ink-2"
      >
        {value.state === 'closed'
          ? t.leaderboard.closed
          : t.leaderboard.unreachable}
      </p>
    );
  }
  const { board } = value;
  if (board.entries.length === 0) {
    return (
      <p data-testid="leaderboard-empty" className="mt-4 text-sm text-ink-2">
        {t.leaderboard.empty}
      </p>
    );
  }
  return (
    <>
      <ol
        data-testid="leaderboard-entries"
        className="mt-4 flex flex-col gap-1"
      >
        {board.entries.map(entry => (
          <li
            key={`${String(entry.rank)}-${entry.name}`}
            data-you={entry.you}
            className={`flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm tabular-nums ${
              entry.you ? 'bg-accent/10 text-accent' : 'text-ink'
            }`}
          >
            <span className="w-8 text-right text-xs text-ink-3">
              {t.leaderboard.rank(entry.rank)}
            </span>
            <span className="flex-1 truncate">
              {entry.name}
              {entry.you && (
                <span className="ml-2 text-xs text-accent">
                  ({t.leaderboard.youMark})
                </span>
              )}
            </span>
            <span className="font-medium">{entry.score}</span>
          </li>
        ))}
      </ol>
      {status === 'signedIn' && (
        <p data-testid="leaderboard-you" className="mt-3 text-xs text-ink-3">
          {board.you
            ? t.leaderboard.you(board.you.rank, board.you.score)
            : t.leaderboard.notOnBoard}
        </p>
      )}
    </>
  );
}

function Account({ t }: { t: Dictionary }) {
  const status = useOnline(state => state.status);
  const profile = useOnline(state => state.profile);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');

  const run = (work: () => Promise<void>, done: string | null = null) => {
    setMessage(null);
    work()
      .then(() => {
        setMode('idle');
        setMessage(done);
      })
      .catch(() => {
        setMessage(t.leaderboard.failed);
      });
  };

  return (
    <section
      data-testid="leaderboard-account"
      data-status={status}
      className="mt-8 border-t border-ink/10 pt-5 text-sm text-ink-2"
    >
      {status === 'loading' && <p role="status">{t.leaderboard.signingIn}</p>}

      {status === 'signedOut' && (
        <>
          <p>{t.leaderboard.signInPrompt}</p>
          <div className="mt-4 flex flex-col gap-2">
            {(['google', 'github'] as const).map(provider => (
              <Button
                key={provider}
                onClick={() => {
                  setMessage(null);
                  online.signIn(provider).catch(() => {
                    setMessage(t.leaderboard.signInFailed);
                  });
                }}
              >
                {t.leaderboard[provider]}
              </Button>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            {t.leaderboard.privacy}{' '}
            <a
              href="/privacy"
              className={`rounded-sm text-ink underline underline-offset-2 ${FOCUS}`}
            >
              {t.leaderboard.privacyLink}
            </a>
          </p>
        </>
      )}

      {status === 'signedIn' && profile && (
        <>
          <p data-testid="leaderboard-signed-in">
            {t.leaderboard.signedInAs(profile.displayName)}
          </p>
          {mode === 'rename' ? (
            <RenameForm
              t={t}
              current={profile.displayName}
              onCancel={() => {
                setMode('idle');
              }}
              onSave={name => {
                run(() => online.rename(name));
              }}
            />
          ) : mode === 'delete' ? (
            <div className="mt-4 rounded-xl border border-red-300/30 p-3">
              <p className="text-xs leading-relaxed">
                {t.leaderboard.deleteConfirm}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => {
                    run(() => online.deleteAccount(), t.leaderboard.deleted);
                  }}
                >
                  {t.leaderboard.deleteYes}
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setMode('idle');
                  }}
                >
                  {t.leaderboard.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setMode('rename');
                }}
              >
                {t.leaderboard.rename}
              </Button>
              <Button
                onClick={() => {
                  run(() => online.signOut());
                }}
              >
                {t.leaderboard.signOut}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setMode('delete');
                }}
              >
                {t.leaderboard.deleteAccount}
              </Button>
            </div>
          )}
        </>
      )}

      {message && (
        <p role="status" className="mt-3 text-xs text-ink-3">
          {message}
        </p>
      )}
    </section>
  );
}

function RenameForm({
  t,
  current,
  onSave,
  onCancel,
}: {
  t: Dictionary;
  current: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current);
  const id = useId();
  const valid = name.trim().length >= 2 && name.trim().length <= 24;
  const save = () => {
    if (valid) onSave(name.trim());
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    save();
  };
  return (
    <form className="mt-4 flex flex-col gap-2" onSubmit={submit}>
      <label htmlFor={id} className="text-xs text-ink-3">
        {t.leaderboard.nameLabel}
      </label>
      <input
        id={id}
        value={name}
        maxLength={24}
        aria-describedby={`${id}-rule`}
        onChange={event => {
          setName(event.target.value);
        }}
        className="min-h-11 rounded-xl border border-ink/15 bg-surface px-3 text-ink outline-none focus-visible:ring-[1.5px] focus-visible:ring-accent/80"
      />
      <p id={`${id}-rule`} className="text-xs text-ink-3">
        {t.leaderboard.nameRule}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" aria-disabled={!valid} onClick={save}>
          {t.leaderboard.save}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t.leaderboard.cancel}
        </Button>
      </div>
    </form>
  );
}
