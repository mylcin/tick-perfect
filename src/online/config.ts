// The online features (sign-in, the boards, rules tuned without a deploy)
// are on in a build that knows its Supabase project. Without one the game
// is exactly the offline game, with no sign-in anywhere.

export interface OnlineConfig {
  /** The Supabase project, for sign-in. */
  readonly supabaseUrl: string;
  /** Its publishable (anon) key: sign-in only; the data stays behind /api. */
  readonly supabaseKey: string;
}

function onlineConfigFrom(
  env: Readonly<Record<string, unknown>>
): OnlineConfig | null {
  const url = env['VITE_SUPABASE_URL'];
  const key = env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  return typeof url === 'string' && url && typeof key === 'string' && key
    ? { supabaseUrl: url.replace(/\/$/, ''), supabaseKey: key }
    : null;
}

export const ONLINE: OnlineConfig | null = onlineConfigFrom(import.meta.env);

/** Where Supabase Auth keeps the session in localStorage. */
export const AUTH_STORAGE_KEY = 'tick-perfect-auth';
