import { AuthClient } from '@supabase/auth-js';

import { AUTH_STORAGE_KEY, type OnlineConfig } from './config';

// Sign-in with Google or GitHub through Supabase Auth. Its own chunk: it
// loads only for a player who signs in, or has before.

export type Provider = 'google' | 'github';

export interface Auth {
  readonly signIn: (provider: Provider) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** A current access token, refreshed if it was about to run out. */
  readonly token: () => Promise<string | null>;
  /** Calls `listener` on every change of who is signed in; returns a stop. */
  readonly onChange: (listener: (signedIn: boolean) => void) => () => void;
}

export function createAuth(config: OnlineConfig): Auth {
  const client = new AuthClient({
    url: `${config.supabaseUrl}/auth/v1`,
    headers: {
      apikey: config.supabaseKey,
      authorization: `Bearer ${config.supabaseKey}`,
    },
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // The provider sends the player back with a code; this trades it for
    // a session as the page loads.
    detectSessionInUrl: true,
    flowType: 'pkce',
  });
  return {
    async signIn(provider) {
      const { error } = await client.signInWithOAuth({
        provider,
        options: { redirectTo: `${location.origin}${location.pathname}` },
      });
      if (error) throw error;
    },
    async signOut() {
      await client.signOut();
    },
    async token() {
      const { data } = await client.getSession();
      return data.session?.access_token ?? null;
    },
    onChange(listener) {
      const { data } = client.onAuthStateChange((_event, session) => {
        listener(session !== null);
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },
  };
}
