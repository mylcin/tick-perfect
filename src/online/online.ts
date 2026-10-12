import { createStore, type StoreApi } from 'zustand/vanilla';

import { checkRules, type GameRules, type RoundLog } from '../game';
import { sameData } from '../utils/canonical';
import { isWatchId, type WatchId } from '../watches/ids';
import { ApiFailure, type ApiOptions } from './api';
import type { Auth, Provider } from './auth';
import type { OnlineConfig } from './config';

// The online side of the game, for a build that has one: who is signed
// in, the rules each watch is played by now, a seed for each ranked round
// and what became of the score. Every call may fail (offline, closed, a
// bad gateway); each failure leaves the game exactly as it plays offline.

export type OnlineStatus = 'off' | 'signedOut' | 'loading' | 'signedIn';
export type Role = 'player' | 'admin' | 'super_admin';

export interface Profile {
  readonly id: string;
  readonly displayName: string;
  readonly role: Role;
}

interface LiveSeason {
  readonly id: number;
  readonly watch: WatchId;
  readonly kind: 'standard' | 'event';
  readonly name: string | null;
  readonly endsAt: string | null;
  readonly rules: GameRules;
}

export interface RemoteConfig {
  readonly leaderboard: boolean;
  readonly submissions: boolean;
  readonly announcement: string | null;
  readonly seasons: Partial<Record<WatchId, LiveSeason>>;
}

export interface Ticket {
  readonly id: string;
  readonly watch: WatchId;
  readonly seed: number;
  readonly daily: number | null;
  readonly rules: GameRules;
}

export type Submission =
  | { readonly round: string; readonly state: 'sending' | 'failed' }
  | {
      readonly round: string;
      readonly state: 'verified' | 'flagged';
      readonly score: number;
      readonly best: number | null;
      readonly rank: number | null;
    }
  | {
      readonly round: string;
      readonly state: 'rejected';
      readonly reason: string;
    };

export interface OnlineState {
  readonly status: OnlineStatus;
  readonly profile: Profile | null;
  /** The latest rules and switches from the server. */
  readonly config: RemoteConfig | null;
  /** The rules play uses: the latest, taken only between rounds. */
  readonly adopted: RemoteConfig | null;
  /** What became of the last ranked round. */
  readonly submission: Submission | null;
}

/** What a ranked round is played for: the collection or a Daily. */
export type RankedMode =
  | { readonly kind: 'collection' }
  | { readonly kind: 'daily'; readonly number: number };

/** A ticket on its way, for a round about to start. */
export interface TicketRequest {
  /** The ticket, if it has arrived. */
  readonly ready: () => Ticket | null;
}

export interface OnlineDeps {
  readonly config: OnlineConfig | null;
  readonly call: <T>(route: string, options?: ApiOptions) => Promise<T>;
  readonly loadAuth: (config: OnlineConfig) => Promise<Auth>;
  /** Whether a session was saved here before, so sign-in loads at once. */
  readonly hadSession: () => boolean;
  readonly now: () => number;
}

/** Saved progress goes up at most this often. */
const SYNC_EVERY_MS = 60_000;

/** The config as the server sends it, checked: anything odd is left out. */
export function parseConfig(value: unknown): RemoteConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const seasons: Partial<Record<WatchId, LiveSeason>> = {};
  for (const item of Array.isArray(raw['seasons']) ? raw['seasons'] : []) {
    const season = item as Record<string, unknown>;
    const watch = season['watch'];
    const rules = checkRules(season['rules']);
    if (!isWatchId(watch) || !rules.ok || typeof season['id'] !== 'number') {
      continue;
    }
    seasons[watch] = {
      id: season['id'],
      watch,
      kind: season['kind'] === 'event' ? 'event' : 'standard',
      name: typeof season['name'] === 'string' ? season['name'] : null,
      endsAt: typeof season['endsAt'] === 'string' ? season['endsAt'] : null,
      rules: rules.rules,
    };
  }
  return {
    leaderboard: raw['leaderboard'] === true,
    submissions: raw['submissions'] === true,
    announcement:
      typeof raw['announcement'] === 'string' ? raw['announcement'] : null,
    seasons,
  };
}

export function createOnline(deps: OnlineDeps) {
  const store: StoreApi<OnlineState> = createStore<OnlineState>(() => ({
    status: deps.config ? 'signedOut' : 'off',
    profile: null,
    config: null,
    adopted: null,
    submission: null,
  }));
  let auth: Promise<Auth> | null = null;
  let lastSync = Number.NEGATIVE_INFINITY;
  let started = false;

  const authed = (): Promise<Auth> | null => {
    const { config } = deps;
    if (!config) return null;
    auth ??= deps
      .loadAuth(config)
      .then(loaded => {
        loaded.onChange(() => {
          void refresh();
        });
        return loaded;
      })
      .catch((error: unknown) => {
        // Its chunk didn't arrive (offline, or a deploy replaced it): the
        // next sign-in asks for it again instead of failing for good.
        auth = null;
        throw error;
      });
    return auth;
  };

  const token = async (): Promise<string | null> => {
    if (!auth) return null;
    try {
      return await (await auth).token();
    } catch {
      return null;
    }
  };

  /** Re-reads who is signed in, and their profile. */
  async function refresh(): Promise<void> {
    const current = await token();
    if (!current) {
      store.setState({ status: 'signedOut', profile: null });
      return;
    }
    try {
      const { profile } = await deps.call<{ profile: Profile }>('/me', {
        token: current,
      });
      store.setState({ status: 'signedIn', profile });
      await syncProgress.now();
    } catch {
      // Signed in, but the API is away: carry on as a guest for now.
      store.setState({ status: 'signedOut', profile: null });
    }
  }

  const syncProgress = {
    /** Hooks for the app's own saved state, set by `connectProgress`. */
    read: null as (() => unknown) | null,
    merge: null as ((saved: unknown) => void) | null,
    async now(): Promise<void> {
      const { read, merge } = syncProgress;
      const current = await token();
      if (!current || !read || !merge) return;
      lastSync = deps.now();
      try {
        const remote = await deps.call<{ data: unknown }>('/me/progress', {
          token: current,
        });
        if (remote.data !== null) merge(remote.data);
        await deps.call('/me/progress', {
          method: 'PUT',
          token: current,
          body: { data: read() },
        });
      } catch {
        // Next time.
      }
    },
  };

  return {
    store,

    /** Loads the config, and the sign-in if a session was kept. Once. */
    start(): void {
      if (started || !deps.config) return;
      started = true;
      void deps
        .call('/config')
        .then(value => {
          const config = parseConfig(value);
          store.setState(state => ({
            config,
            // Nothing played yet: take it at once.
            adopted: state.adopted ?? config,
          }));
        })
        .catch(() => {
          // Offline, or no API: the rules the game ships with.
        });
      if (deps.hadSession()) {
        store.setState({ status: 'loading' });
        void authed()
          ?.then(() => refresh())
          .catch(() => {
            store.setState({ status: 'signedOut' });
          });
      }
    },

    /** Starts playing by the latest rules; call it only between rounds. */
    adoptRules(): void {
      const { config, adopted } = store.getState();
      if (config !== adopted) store.setState({ adopted: config });
    },

    /** The rules a watch is played by now, if the server set them. */
    rulesFor(watch: WatchId): GameRules | null {
      return store.getState().adopted?.seasons[watch]?.rules ?? null;
    },

    async signIn(provider: Provider): Promise<void> {
      const loaded = authed();
      if (loaded) await (await loaded).signIn(provider);
    },

    async signOut(): Promise<void> {
      if (auth) await (await auth).signOut();
      store.setState({ status: 'signedOut', profile: null });
    },

    async rename(displayName: string): Promise<void> {
      const { profile } = await deps.call<{ profile: Profile }>('/me', {
        method: 'PATCH',
        token: await token(),
        body: { displayName },
      });
      store.setState({ profile });
    },

    async deleteAccount(): Promise<void> {
      await deps.call('/me', { method: 'DELETE', token: await token() });
      if (auth) await (await auth).signOut();
      store.setState({ status: 'signedOut', profile: null });
    },

    /** Lets progress follow the player: how to read and merge it. */
    connectProgress(
      read: () => unknown,
      merge: (saved: unknown) => void
    ): void {
      syncProgress.read = read;
      syncProgress.merge = merge;
    },

    /** Saves progress to the account, at most once a minute. */
    progressChanged(): void {
      if (deps.now() - lastSync >= SYNC_EVERY_MS) void syncProgress.now();
    },

    /**
     * Asks for a ranked round's seed, if the player is signed in and the
     * boards are open; it may not arrive in time, and the round is then
     * played unranked.
     */
    requestTicket(watch: WatchId, mode: RankedMode): TicketRequest {
      const { status, config } = store.getState();
      let ticket: Ticket | null = null;
      if (status === 'signedIn' && config?.leaderboard && config.submissions) {
        void (async () => {
          try {
            ticket = await deps.call<Ticket>('/rounds', {
              method: 'POST',
              token: await token(),
              body:
                mode.kind === 'daily'
                  ? { watch, daily: mode.number }
                  : { watch },
            });
          } catch {
            ticket = null;
          }
        })();
      }
      return { ready: () => ticket };
    },

    /** Whether a ticket can rank a round played by `rules`. */
    ticketFits(ticket: Ticket | null, rules: GameRules): ticket is Ticket {
      return ticket !== null && sameData(ticket.rules, rules);
    },

    /** Calls the API as the signed-in player (the admin panel's way in). */
    async call<T>(
      route: string,
      options: Omit<ApiOptions, 'token'> = {}
    ): Promise<T> {
      return deps.call<T>(route, { ...options, token: await token() });
    },

    /** Forgets the last ranked round's outcome, as a new round starts. */
    clearSubmission(): void {
      if (store.getState().submission) store.setState({ submission: null });
    },

    /** Sends a ranked round back and keeps what became of it. */
    async submit(
      ticket: Ticket,
      log: RoundLog,
      score: number,
      version: string
    ): Promise<void> {
      store.setState({ submission: { round: ticket.id, state: 'sending' } });
      try {
        const result = await deps.call<
          | {
              status: 'verified' | 'flagged';
              score: number;
              best: number | null;
              rank: number | null;
            }
          | { status: 'rejected'; reason: string }
        >(`/rounds/${ticket.id}`, {
          method: 'POST',
          token: await token(),
          body: { log, score, clientVersion: version },
        });
        store.setState({
          submission:
            result.status === 'rejected'
              ? { round: ticket.id, state: 'rejected', reason: result.reason }
              : {
                  round: ticket.id,
                  state: result.status,
                  score: result.score,
                  best: result.best,
                  rank: result.rank,
                },
        });
      } catch (error) {
        // A 409 means it already came in (a retry that crossed the first).
        const already = error instanceof ApiFailure && error.status === 409;
        store.setState({
          submission: already
            ? { round: ticket.id, state: 'rejected', reason: 'alreadyIn' }
            : { round: ticket.id, state: 'failed' },
        });
      }
    },

    /** A board: a watch's live season, or a Daily's. */
    board(query: { watch: WatchId } | { daily: number }) {
      const search =
        'watch' in query
          ? `watch=${query.watch}`
          : `daily=${String(query.daily)}`;
      return token().then(current =>
        deps.call<Board>(`/leaderboard?${search}`, { token: current })
      );
    },
  };
}

export interface BoardEntry {
  readonly rank: number;
  readonly name: string;
  readonly score: number;
  readonly you: boolean;
}

export interface Board {
  readonly board: string;
  readonly entries: readonly BoardEntry[];
  readonly you: { readonly score: number; readonly rank: number } | null;
}
