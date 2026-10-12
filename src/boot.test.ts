import { afterEach, describe, expect, it, vi } from 'vitest';

import boot from '../public/boot.js?raw';
import { THEME_COLORS } from './screens/studio';
import { SAVE_KEY } from './state/saved';

// public/boot.js, run as the browser runs it (a classic script, in the
// global scope) against the little of the page it touches.

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Meta {
  name: string;
  media?: string;
  content: string;
}

function run({
  saved = null,
  path = '/',
  systemDark = false,
}: {
  saved?: unknown;
  path?: string;
  systemDark?: boolean;
} = {}) {
  const attributes = new Map<string, string>();
  const root = {
    lang: 'en',
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  };
  const metas: Meta[] = [
    {
      name: 'theme-color',
      media: '(prefers-color-scheme: light)',
      content: THEME_COLORS.light,
    },
    {
      name: 'theme-color',
      media: '(prefers-color-scheme: dark)',
      content: THEME_COLORS.dark,
    },
    { name: 'apple-mobile-web-app-status-bar-style', content: '' },
    { name: 'description', content: 'A watch game' },
  ];
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => {
        if (saved instanceof Error) throw saved;
        return key === SAVE_KEY && saved !== null
          ? typeof saved === 'string'
            ? saved
            : JSON.stringify(saved)
          : null;
      },
    },
    location: { pathname: path },
    matchMedia: (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && systemDark,
    }),
  });
  vi.stubGlobal('document', {
    documentElement: root,
    getElementsByTagName: (tag: string) => (tag === 'meta' ? metas : []),
  });
  // An indirect eval runs it in the global scope, as a script tag would.
  globalThis.eval(boot);
  const [light, dark, statusBar] = metas;
  return {
    attributes: Object.fromEntries(attributes),
    lang: root.lang,
    colors: [light?.content, dark?.content],
    statusBar: statusBar?.content,
  };
}

const settings = (values: Record<string, unknown>) => ({
  state: { settings: values },
  version: 1,
});

describe('boot.js', () => {
  it('dresses the page from the saved settings', () => {
    const page = run({
      saved: settings({
        theme: 'light',
        night: false,
        reducedMotion: true,
        language: 'tr',
      }),
      systemDark: true,
    });
    expect(page.attributes).toEqual({
      'data-theme': 'light',
      'data-motion': 'reduced',
    });
    expect(page.lang).toBe('tr');
    expect(page.colors).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
    expect(page.statusBar).toBe('default');
  });

  it('puts the lights out over either theme', () => {
    const page = run({
      saved: settings({ theme: 'light', night: true, reducedMotion: false }),
    });
    expect(page.attributes).toEqual({
      'data-theme': 'light',
      'data-night': '',
      'data-motion': 'full',
    });
    expect(page.colors).toEqual([THEME_COLORS.night, THEME_COLORS.night]);
    expect(page.statusBar).toBe('black-translucent');
  });

  it.each([false, true])(
    'leaves the system in charge when following it (dark system %s)',
    systemDark => {
      const page = run({
        saved: settings({ theme: 'system', reducedMotion: null }),
        systemDark,
      });
      expect(page.attributes).toEqual({});
      expect(page.lang).toBe('en');
      expect(page.colors).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
      expect(page.statusBar).toBe(systemDark ? 'black-translucent' : 'default');
    }
  );

  it('keeps the admin panel in the dark studio', () => {
    const page = run({
      saved: settings({ theme: 'light' }),
      path: '/admin/rules',
    });
    expect(page.attributes).toEqual({ 'data-theme': 'dark' });
    expect(page.colors).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
  });

  it.each([
    ['nothing saved', null],
    ['unreadable storage', new Error('SecurityError')],
    ['broken JSON', '{"state":'],
    ['a number', 42],
    ['no settings', { state: {} }],
    [
      'unusable values',
      settings({
        theme: 'sepia',
        night: 'yes',
        reducedMotion: 'no',
        language: 'en"><script>',
      }),
    ],
  ])('falls back to the stylesheet with %s', (_, saved) => {
    const page = run({ saved });
    expect(page.attributes).toEqual({});
    expect(page.lang).toBe('en');
    expect(page.colors).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});
