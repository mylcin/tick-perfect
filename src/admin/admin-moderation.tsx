import { useEffect, useState } from 'react';

import { Button } from '../components/buttons';
import { online } from '../online';
import { WATCHES, isWatchId } from '../watches';
import { failureText } from './failure';

// Moderation: rounds held back as too steady to be human, and players to
// ban or let back.

interface FlaggedRound {
  readonly id: string;
  readonly watch: string;
  readonly score: number | null;
  readonly hits: number | null;
  readonly spread: number | null;
  readonly submittedAt: string | null;
  readonly player: {
    readonly id: string;
    readonly name: string;
    readonly banned: boolean;
  };
}

interface Player {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly banned: boolean;
}

export function ModerationPanel({ onChanged }: { onChanged: () => void }) {
  const [rounds, setRounds] = useState<readonly FlaggedRound[]>([]);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // Counts up to read the queue again.
  const [reads, setReads] = useState(0);
  const loadRounds = () => {
    setReads(count => count + 1);
  };
  useEffect(() => {
    online
      .call<{ rounds: FlaggedRound[] }>('/admin/rounds?status=flagged')
      .then(value => {
        setRounds(value.rounds);
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  }, [reads]);

  const review = (id: string, status: 'verified' | 'rejected') => {
    online
      .call(`/admin/rounds/${id}`, { method: 'PATCH', body: { status } })
      .then(() => {
        loadRounds();
        onChanged();
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  };

  const search = () => {
    online
      .call<{ users: Player[] }>(`/admin/users?q=${encodeURIComponent(query)}`)
      .then(value => {
        setPlayers(value.users);
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  };

  const ban = (player: Player, banned: boolean) => {
    online
      .call(`/admin/users/${player.id}/ban`, {
        method: 'POST',
        body: { banned },
      })
      .then(() => {
        search();
        loadRounds();
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  };

  return (
    <div className="flex flex-col gap-8">
      {message && (
        <p role="status" className="text-xs text-amber-100">
          {message}
        </p>
      )}
      <div>
        <h2 className="text-xs tracking-[0.3em] text-neutral-400 uppercase">
          Held for review
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Rounds whose timing spread was under 3 ms over 20 hits or more:
          steadier than people play.
        </p>
        {rounds.length === 0 ? (
          <p data-testid="admin-flagged-empty" className="mt-3">
            Nothing waiting.
          </p>
        ) : (
          <ul data-testid="admin-flagged" className="mt-3 flex flex-col gap-2">
            {rounds.map(round => (
              <li
                key={round.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 px-3 py-2"
              >
                <span className="flex-1">
                  {round.player.name} ·{' '}
                  {isWatchId(round.watch)
                    ? WATCHES[round.watch].name
                    : round.watch}{' '}
                  · {round.score ?? 0} points, {round.hits ?? 0} hits, ±
                  {(round.spread ?? 0).toFixed(1)} ms
                </span>
                <Button
                  className="min-h-9! px-3!"
                  onClick={() => {
                    review(round.id, 'verified');
                  }}
                >
                  Let it count
                </Button>
                <Button
                  variant="quiet"
                  className="min-h-9! px-3!"
                  onClick={() => {
                    review(round.id, 'rejected');
                  }}
                >
                  Reject
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-xs tracking-[0.3em] text-neutral-400 uppercase">
          Players
        </h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={event => {
            event.preventDefault();
            search();
          }}
        >
          <input
            aria-label="Find a player by name or id"
            placeholder="Name or id"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
            }}
            className="min-h-12 flex-1 rounded-xl border border-white/15 bg-neutral-900 px-3 text-neutral-100"
          />
          <Button onClick={search}>Find</Button>
        </form>
        <ul data-testid="admin-players" className="mt-3 flex flex-col gap-2">
          {players.map(player => (
            <li
              key={player.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 px-3 py-2"
            >
              <span className="flex-1">
                {player.name}
                <span className="ml-2 text-xs text-neutral-400">
                  {player.role}
                  {player.banned && ' · banned'}
                </span>
              </span>
              {player.role === 'player' && (
                <Button
                  className="min-h-9! px-3!"
                  onClick={() => {
                    ban(player, !player.banned);
                  }}
                >
                  {player.banned ? 'Lift the ban' : 'Ban'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
