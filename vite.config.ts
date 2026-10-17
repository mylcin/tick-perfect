import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const DESCRIPTION = 'A one-tap timing game played on a 3D mechanical watch.';

/** The request's body, read whole. */
async function bodyOf(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Serves /api from api/index.ts on the dev server, as Vercel does in
 * production, with the server's settings from .env.local. Without them the
 * API answers that the online features are off.
 */
function devApi(): Plugin {
  return {
    name: 'tick-perfect-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const key of [
        'DATABASE_URL',
        'SUPABASE_URL',
        'SUPABASE_JWT_SECRET',
        'SUPABASE_SERVICE_ROLE_KEY',
      ]) {
        // Assigning undefined would store the string "undefined".
        const value = env[key];
        if (value !== undefined) process.env[key] ??= value;
      }
      server.middlewares.use(
        '/api',
        (request: IncomingMessage, response: ServerResponse) => {
          void (async () => {
            const api = (await server.ssrLoadModule('/api/index.ts')) as Record<
              string,
              ((request: Request) => Promise<Response>) | undefined
            >;
            const serve = api[request.method ?? 'GET'];
            const method = request.method ?? 'GET';
            const body =
              method === 'GET' || method === 'HEAD'
                ? undefined
                : await bodyOf(request);
            const answer = serve
              ? await serve(
                  new Request(
                    `http://${request.headers.host ?? 'localhost'}/api${request.url ?? ''}`,
                    {
                      method,
                      headers: request.headers as Record<string, string>,
                      ...(body && { body }),
                    }
                  )
                )
              : new Response(null, { status: 405 });
            response.statusCode = answer.status;
            answer.headers.forEach((value, key) => {
              response.setHeader(key, value);
            });
            response.end(Buffer.from(await answer.arrayBuffer()));
          })().catch((error: unknown) => {
            server.config.logger.error(String(error));
            response.statusCode = 500;
            response.end();
          });
        }
      );
    },
  };
}

interface VercelHeaders {
  readonly headers: readonly {
    readonly source: string;
    readonly headers: readonly {
      readonly key: string;
      readonly value: string;
    }[];
  }[];
}

/**
 * The headers vercel.json sends with every page, content security policy
 * included, so `vite preview` (which the e2e tests run against) answers as
 * a deployment does. The policy lets pages reach the build's own Supabase
 * project, as it does any project on supabase.co.
 */
function deployedHeaders(env: Record<string, string>): Record<string, string> {
  const vercel = JSON.parse(
    readFileSync(new URL('vercel.json', import.meta.url), 'utf8')
  ) as VercelHeaders;
  const project = env['VITE_SUPABASE_URL']
    ? new URL(env['VITE_SUPABASE_URL']).origin
    : null;
  return Object.fromEntries(
    (vercel.headers.find(rule => rule.source === '/(.*)')?.headers ?? []).map(
      ({ key, value }) => [
        key,
        key === 'Content-Security-Policy' && project
          ? value.replace(/connect-src ([^;]+)/, `connect-src $1 ${project}`)
          : value,
      ]
    )
  );
}

/**
 * A deployment processes personal data (its server's logs, and with an
 * online side much more), so its privacy notice (/privacy) must name who
 * is responsible and how to reach them. Local and CI builds without an
 * online side may leave them out.
 */
function checkPrivacyContact(env: Record<string, string>): void {
  const deployed = process.env['VERCEL'] === '1';
  if (
    (deployed || env['VITE_SUPABASE_URL']) &&
    !(env['VITE_PRIVACY_CONTROLLER'] && env['VITE_PRIVACY_EMAIL'])
  ) {
    throw new Error(
      'A deployed or online build needs VITE_PRIVACY_CONTROLLER and ' +
        'VITE_PRIVACY_EMAIL for its privacy notice (see docs/BACKEND.md).'
    );
  }
}

/**
 * The build's version, sent with each ranked round and page error so the
 * server's logs tell deploys apart: package.json's version and the commit
 * Vercel builds (`1.0.0+3f2c1ab`), or `+local` for any other build. The
 * server keeps 40 characters of it.
 */
function appVersion(): string {
  const version = process.env['npm_package_version'] ?? 'dev';
  const commit = (process.env['VERCEL_GIT_COMMIT_SHA'] ?? 'local').slice(0, 7);
  return `${version}+${commit}`.slice(0, 40);
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  if (command === 'build') checkPrivacyContact(env);
  return {
    // The studio HDRI is bundled like an image, so its name carries a hash.
    assetsInclude: ['**/*.hdr'],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()),
    },
    plugins: [
      react(),
      tailwindcss(),
      devApi(),
      // Installable, and playable offline once it has loaded: the service
      // worker precaches the app, the 3D chunk, the thumbnails and the studio
      // HDRI.
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        // The browser fetches the install icons itself when it needs them.
        includeManifestIcons: false,
        manifest: {
          id: '/',
          name: 'Tick Perfect',
          short_name: 'Tick Perfect',
          description: DESCRIPTION,
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          // The dark studio's backdrop edge (src/index.css), which the icon
          // is drawn on. A manifest takes one colour only; the page's
          // theme-color metas then follow the studio it is in.
          background_color: '#0C0D0E',
          theme_color: '#0C0D0E',
          categories: ['games'],
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            // The artwork sits inside the maskable safe zone, so the same
            // image works when the launcher crops it to a circle or squircle.
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,hdr}'],
          // Install-time artwork the game itself never shows, and the link
          // preview's picture, which only the sites unfurling a link fetch.
          globIgnores: [
            'icons/icon-192.png',
            'icons/icon-512.png',
            'icons/apple-touch-icon.png',
            'og.jpg',
          ],
          navigateFallback: '/index.html',
          // The API answers for itself, online or not at all.
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          // A new version takes over at once instead of waiting for every tab
          // to close, and takes over the page that installed it, so the game
          // is offline-ready on the first visit. Safe mid-game: a page loads
          // its 3D chunk and HDRI at startup, before any update arrives.
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            // Three.js and the R3F stack change far less often than the app,
            // so they get their own long-cached chunk. It only loads with the
            // 3D scene, never with the first paint.
            groups: [
              // Claimed first, so React (and zustand, which drei uses too)
              // stays with the first paint instead of being pulled into the 3D
              // chunk as one of its dependencies.
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/,
                priority: 2,
              },
              {
                name: 'three',
                priority: 1,
                test: /[\\/]node_modules[\\/](three|three-stdlib|three-mesh-bvh|@react-three|postprocessing|@monogrid|maath|troika-[^\\/]+|suspend-react|its-fine|tunnel-rat|camera-controls|meshline|stats-gl|detect-gpu|hls\.js|@use-gesture)[\\/]/,
              },
            ],
          },
        },
      },
      // three.js alone is ~1 MB minified (~300 KB gzip) and loads async; the
      // initial payload has its own budget in scripts/check-bundle.js.
      chunkSizeWarningLimit: 1200,
    },
    test: {
      include: [
        'src/**/*.test.{ts,tsx}',
        'server/**/*.test.ts',
        'eslint-rules/**/*.test.js',
      ],
      // Game logic must run without a DOM; screens that need one opt in per file.
      environment: 'node',
      // The rule sweeps and geometry builds take about 2 s alone, and more
      // than the default 5 s under coverage with every file running at once.
      testTimeout: 15_000,
      // Each API test file starts its own Postgres (PGlite) in its hooks.
      hookTimeout: 15_000,
      coverage: {
        provider: 'v8',
        include: ['src/game/**/*.ts'],
        exclude: ['src/game/**/*.test.ts', 'src/game/index.ts'],
        // The rules decide every run, so every line and branch is tested.
        thresholds: { 100: true },
      },
    },
    preview: { headers: deployedHeaders(env) },
  };
});
