import { beforeAll, describe, expect, it, vi } from 'vitest';

import type * as Session from './session';

const addresses: unknown[][] = [];
let session: typeof Session;

// The session reads the address bar (and the saved state) as it loads, so
// the page around it is stubbed first: a visit through a broken link.
beforeAll(async () => {
  vi.stubGlobal('navigator', { languages: ['en'] });
  vi.stubGlobal('window', {
    location: { search: '?c=gmt.zzz&ref=chat', pathname: '/', hash: '' },
    history: {
      state: null,
      replaceState: (...args: unknown[]) => addresses.push(args),
    },
    addEventListener: () => undefined,
    get localStorage(): Storage {
      throw new Error('No storage in tests');
    },
  });
  session = await import('./session');
});

describe('the session store', () => {
  it('tells a broken challenge link from no link, and clears it', () => {
    const { sessionStore } = session;
    expect(sessionStore.getState().challenge).toBeNull();
    expect(sessionStore.getState().invalidChallenge).toBe(true);
    expect(addresses).toEqual([[null, '', '/?ref=chat']]);
    sessionStore.getState().dismissChallenge();
    expect(sessionStore.getState().invalidChallenge).toBe(false);
  });

  it('opens with no broken link unless told', () => {
    const store = session.createSessionStore('diver');
    expect(store.getState().invalidChallenge).toBe(false);
    expect(store.getState().challenge).toBeNull();
  });

  it('keeps where the text under the watch starts', () => {
    const store = session.createSessionStore('diver');
    expect(store.getState().textTop).toBeNull();
    store.getState().setTextTop(0.6);
    expect(store.getState().textTop).toBe(0.6);
    store.getState().setTextTop(null);
    expect(store.getState().textTop).toBeNull();
  });

  it('lets a lost watch come back, but never a failed one', () => {
    const store = session.createSessionStore('diver');
    store.getState().setScene('ready');
    store.getState().setScene('lost');
    expect(store.getState().scene).toBe('lost');
    store.getState().setScene('ready');
    expect(store.getState().scene).toBe('ready');
    store.getState().setScene('failed', 'network');
    store.getState().setScene('ready');
    expect(store.getState()).toMatchObject({
      scene: 'failed',
      sceneFailure: 'network',
    });
  });
});
