import { describe, expect, it } from 'vitest';

import { bearerToken, identityOf, supabaseVerifier } from './auth.js';
import { canonicalJson, hashOf } from './canonical.js';
import { cleanName } from './profiles.js';
import { tokenFor } from './test-support.js';

const ID = '00000000-0000-4000-8000-000000000042';
const verify = supabaseVerifier({
  url: 'https://test.supabase.co/',
  secret: 'a-test-secret-at-least-thirty-two-bytes-long',
});

describe('supabaseVerifier', () => {
  it('accepts the project’s own tokens', async () => {
    expect(await verify(await tokenFor(ID, { name: 'Ada' }))).toEqual({
      id: ID,
      name: 'Ada',
    });
  });

  it.each([
    ['another project', { issuer: 'https://other.supabase.co/auth/v1' }],
    ['another audience', { audience: 'anon' }],
    ['another key', { secret: 'some-other-secret-thirty-two-bytes-long!' }],
    ['an expired token', { expires: '-1m' }],
  ])('refuses %s', async (_, options) => {
    expect(await verify(await tokenFor(ID, {}, options))).toBeNull();
  });

  it('refuses something that isn’t a token', async () => {
    expect(await verify('not-a-token')).toBeNull();
  });
});

describe('identityOf', () => {
  it('names a player from whatever their provider gave', () => {
    const name = (meta: Record<string, unknown>, email?: string) =>
      identityOf({ sub: ID, user_metadata: meta, ...(email && { email }) })
        ?.name;
    expect(name({ full_name: 'Ada Lovelace', name: 'ada' })).toBe(
      'Ada Lovelace'
    );
    expect(name({ user_name: 'octocat' })).toBe('octocat');
    expect(name({ preferred_username: 'grace' })).toBe('grace');
    expect(name({}, 'linus@example.com')).toBe('linus');
    expect(name({})).toBe('Player');
  });

  it('takes nothing but the id and a name, whatever else the token holds', () => {
    expect(
      identityOf({
        sub: ID,
        email: 'ada@example.com',
        user_metadata: {
          name: 'Ada',
          picture: 'https://cdn.example/a.png',
          email: 'ada@example.com',
        },
      })
    ).toEqual({ id: ID, name: 'Ada' });
  });

  it('needs a user id', () => {
    expect(identityOf({ sub: 'admin' })).toBeNull();
    expect(identityOf({})).toBeNull();
  });
});

describe('bearerToken', () => {
  it('reads the token from the authorization header', () => {
    const request = (value?: string) =>
      new Request(
        'https://x.test',
        value ? { headers: { authorization: value } } : {}
      );
    expect(bearerToken(request('Bearer abc.def'))).toBe('abc.def');
    expect(bearerToken(request('Basic abc'))).toBeNull();
    expect(bearerToken(request())).toBeNull();
  });
});

describe('cleanName', () => {
  it('keeps 2 to 24 plain characters, or makes one up', () => {
    expect(cleanName('  Ada\n  Lovelace ', ID)).toBe('Ada Lovelace');
    expect(cleanName('é'.repeat(30), ID)).toBe('é'.repeat(24));
    // An emoji and its modifier count as two, and are never split.
    expect(cleanName('🕰️'.repeat(13), ID)).toBe('🕰️'.repeat(12));
    expect(cleanName('x', ID)).toBe('Player 0000');
  });
});

describe('canonicalJson', () => {
  it('prints equal values the same, whatever their key order', async () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], e: undefined })).toBe(
      '{"a":[{"c":3,"d":2}],"b":1}'
    );
    expect(await hashOf({ a: 1, b: 2 })).toBe(await hashOf({ b: 2, a: 1 }));
    expect(await hashOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
