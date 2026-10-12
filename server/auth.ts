import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

// Who is calling: the access token Supabase Auth gave the page after it
// signed in with Google or GitHub, verified here on every request. The
// token carries the provider's name, which starts the player's profile.
// Nothing else from it is kept.

export interface Identity {
  readonly id: string;
  /** A name to start the profile with: the provider's, or the email's. */
  readonly name: string;
}

/** Resolves a bearer token to who it belongs to, or null if it isn't valid. */
export type VerifyToken = (token: string) => Promise<Identity | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The identity in a verified token's claims. */
export function identityOf(claims: JWTPayload): Identity | null {
  const id = claims.sub;
  if (!id || !UUID.test(id)) return null;
  const meta = (claims['user_metadata'] ?? {}) as Record<string, unknown>;
  const email = text(claims['email']);
  const name =
    text(meta['full_name']) ??
    text(meta['name']) ??
    text(meta['user_name']) ??
    text(meta['preferred_username']) ??
    email?.split('@')[0] ??
    'Player';
  return { id, name };
}

/**
 * Verifies Supabase access tokens: signed with the project's JWT secret
 * (HS256) when one is given, otherwise against its published signing keys.
 * Either way the issuer and audience must be the project's.
 */
export function supabaseVerifier({
  url,
  secret,
}: {
  url: string;
  secret?: string | undefined;
}): VerifyToken {
  const issuer = `${url.replace(/\/$/, '')}/auth/v1`;
  const key: Uint8Array | JWTVerifyGetKey = secret
    ? new TextEncoder().encode(secret)
    : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async token => {
    try {
      const { payload } =
        key instanceof Uint8Array
          ? await jwtVerify(token, key, { issuer, audience: 'authenticated' })
          : await jwtVerify(token, key, { issuer, audience: 'authenticated' });
      return identityOf(payload);
    } catch {
      return null;
    }
  };
}

/** The bearer token on a request, if it has one. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
