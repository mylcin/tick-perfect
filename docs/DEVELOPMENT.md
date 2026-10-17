# Development guide

How Tick Perfect is built, tested and deployed. For the online side
(leaderboards, sign-in, the admin panel) see [BACKEND.md](BACKEND.md); for
contribution rules see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Scripts

Node.js 22.13 or newer in the 22.x line (`nvm use` reads `.nvmrc`).

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Dev server at http://localhost:5173, with `/api`                |
| `npm run check`        | Lint, format, types, unit tests with coverage, build, size      |
| `npm test`             | Unit tests once (`test:watch` to re-run on change)              |
| `npm run test:e2e`     | Builds the e2e bundle and runs Playwright                       |
| `npm run build`        | Type-checks, then builds into `dist/`                           |
| `npm run size`         | Checks the first paint against its 400 KB gzip budget           |
| `npm run thumbnails`   | Re-renders the watch thumbnails (needs `npm run dev`)           |
| `npm run og`           | Re-renders the link preview, `public/og.jpg` (same)             |
| `npm run readme-image` | Re-renders the README's picture, `docs/images/hero.webp` (same) |
| `npm run icons`        | Re-renders the PNG app icons from `public/icons/icon.svg`       |

## Architecture

```text
src/
  game/        the rules, in pure TypeScript: timing, scoring, difficulty,
               seeded randomness, each watch's twist, and the replay the
               server checks scores with
  watches/     the catalogue: each watch's spec, variants and rules
  three/       the procedural watch and the React Three Fiber scene
  state/       the game controller, saved progress, the Daily, challenge links
  screens/     the title, the game, its dialogs
  online/      sign-in, ranked rounds, progress sync and error reports
  admin/       the admin panel at /admin
  privacy/     the privacy notice at /privacy
  audio/       modal synthesis of the watch's sounds
  i18n/        typed English and Turkish dictionaries
server/        the API, one Vercel Function (see BACKEND.md)
e2e/           Playwright tests, on a desktop and a phone
```

The `admin`, `privacy` and 3D code load as chunks of their own, so the first
paint carries only the interface.

**The page is the studio.** The 3D canvas is transparent: `src/index.css`
paints the light, dark and night studios (with a faint grain against
banding, `public/grain.png`, drawn by `node scripts/render-grain.js`) and
the colour tokens the interface uses (`text-ink`, `bg-surface`,
`border-accent/40`, …), so it follows the theme too; use them rather than
fixed colours. `public/boot.js`, a small classic
script loaded before the stylesheet (the content security policy allows no
inline code), applies the saved theme, night mode, motion and language
before the first paint, so a load never flashes the wrong studio. Keep its
logic in step with `src/hooks/use-studio.ts`, which takes over once the
app runs.

**A pure engine.** `src/game` never imports React, Three.js or a store, and
never reads the clock, the DOM or `Math.random()`: time, input and seeds are
passed in. A local ESLint rule
([`eslint-rules/game-boundary.js`](../eslint-rules/game-boundary.js))
enforces this, and the folder is held to 100% line and branch coverage. The
same code runs in the browser and, to verify scores, on the server.

**Code the API runs names its files.** Vercel compiles each file of the
function on its own, never bundling, and Node only finds an ES module by
its exact path. So every relative import in `server/`, `api/` and the parts
of `src/` they reach ends in `.js` (`'./deps.js'`, `'../game/index.js'`),
which Vite resolves to the `.ts` file. The server's type check
(`tsconfig.server.json`, NodeNext) refuses one without, and
`npm run check:api` loads the function in Node as Vercel does.

**Seeds decide everything.** A round is its watch and its seed: every
target, and every twist on it, comes from the seed alone, however the player
taps. The Daily and challenge links rely on this, and golden masters
(`src/game/golden.test.ts`) pin each watch's plans across releases.

**Content is versioned.** What a seed deals must stay put for links
already shared and Dailies already played, as the collection grows and
rules are retuned:

- The Dailies follow `DAILY_ROTATIONS` (`src/state/daily.ts`), which is
  only ever appended to: a new watch joins with a rotation of its own that
  starts at least 3 days after its deploy, so cached pages (which update on
  their next load) and the server (which checks a ranked Daily's watch)
  agree on every Daily. A test pins Dailies #1–#60.
- Each watch has a rules revision in `RULES_REVISION`
  (`src/watches/revisions.ts`), bumped whenever its golden master changes.
  Challenge links carry it (`/?c=watch.seed.score.revision`; a link without
  one was set on revision 1), and a link set on other rules still plays,
  with a note on its card that the targets will differ.
- Every build carries its version, `VITE_APP_VERSION`: package.json's
  version and the commit Vercel built (`1.0.0+3f2c1ab`, or `+local`).
  Ranked rounds and error reports send it, so the logs tell deploys apart.

**Watches are data.** A `WatchSpec` describes the case, bezel, dial, hands,
strap and complications, plus the rules the watch plays by. The scene builds
the model from it (lathe profiles, extruded outlines, canvas-painted prints),
so a new watch is a new spec, not new scene code. Variants change colours
and finishes only.

**One controller.** `src/state/game-controller.ts` holds the game state and
applies actions through the engine. Screens read its snapshot, the scene
asks it for a pose every frame (the hands move without React re-rendering),
and sound, vibration and screen-reader announcements follow its events.

**One save.** Settings and progress live in localStorage under
`tick-perfect` (`src/state/saved.ts`), and every field is read back through
`restoreSaved`: a wrong type falls back to its default on its own, lists and
maps are capped, a Daily too far in the future is dropped, and a save that
can't be parsed is copied to `tick-perfect.unreadable` before anything is
written over it. Writes merge what is already stored, so two tabs never wipe
each other's progress; erasing progress (Settings → Start over) is the one
write that replaces it. Everything earned is also what a backup file and an
account hold (`CloudSave`); settings, tips and the round history stay on the
device. Nothing in the save is trusted beyond the player's own screen: the
boards only take rounds the server has replayed.

**Practice.** A practice round is the same engine with `PracticeOptions`
passed to `update`: a miss is a `slip` that moves on to the next target,
and the set ends with a `complete` event after its targets. The game
screen saves nothing for it, and the slow pace is `practiceRules`, the
watch's own rules with an easier ramp.

**Progress over time.** Each finished round adds a line (score, hits,
Perfects, rate and spread) to its watch's history, the latest 100 per watch
(`src/state/history.ts`), and each Daily's best goes into an archive of the
last 60 days (`src/state/daily-archive.ts`). The timegrapher sums up the
latest 10, 25 or 100 rounds against as many before them, and shows the last
fortnight of Dailies with the run of days played.

**Resilience.** Taps are judged at their own timestamps, never the last
frame drawn. Quality steps down on real slowdowns only, and a device starts
its next visit on the tier it settled on (`tick-perfect.quality` in
localStorage, apart from the save), stepping up again if it can; battery
saver holds the cheapest tier. When WebGL is missing, the 3D chunk fails to
load or the GPU drops the scene, the game says so, pauses, and restores the
watch where it can. A chunk a deploy replaced (a tab left open across it)
reloads the page once for the current build, never mid-round
(`src/utils/stale-build.ts`), and a sign-in whose code didn't arrive loads
it again next time.

## Testing

- **Unit tests** (Vitest) cover the engine, the stores, the scene's maths,
  the dictionaries and the API. The API's tests run against a real Postgres
  in memory ([PGlite](https://pglite.dev)).
- **End-to-end tests** (Playwright) play the real game in Chromium, on a
  desktop and on a phone. They run against the e2e build (`.env.e2e`: a
  made-up Supabase project, a stubbed `/api`), served with the same headers
  as production, content security policy included.

  ```bash
  npx playwright install chromium   # once
  npm run test:e2e
  ```

  On a Mac WebGL renders on the GPU; CI has none and renders in software
  (`E2E_WEBGL=swiftshader` does the same locally). `E2E_PORT` lets two
  checkouts run side by side.

- **Git hooks** ([lefthook](https://lefthook.dev)) format and lint staged
  files before a commit, check the message, and run the type check and unit
  tests before a push.
- **CI** ([`ci.yml`](../.github/workflows/ci.yml)) runs the full check and the
  end-to-end tests on every push to `main` and every pull request.

## Deployment

The game deploys to [Vercel](https://vercel.com) from GitHub: every push to
`main` goes to production, and every pull request gets a preview.

1. Import the repository at [vercel.com/new](https://vercel.com/new) and keep
   the project name **`tick-perfect`**. Share texts and challenge links point
   to `tick-perfect.vercel.app` (`APP_URL` in
   [`src/utils/share.ts`](../src/utils/share.ts)), as do the link preview's
   tags in [`index.html`](../index.html); on another domain, change both.
2. Set the environment variables. `VITE_PRIVACY_CONTROLLER` and
   `VITE_PRIVACY_EMAIL` are required for any deployment: they name who is
   responsible in the privacy notice, and the build stops without them. The
   online side needs more; see [BACKEND.md](BACKEND.md).
3. Leave the build settings to [`vercel.json`](../vercel.json), which also
   sets:
   - the response headers: a strict content security policy and other
     security headers, `/sw.js` revalidated on every load and `/assets/*`
     cached for a year;
   - the rewrites for `/api`, `/admin` and `/privacy`.
4. Check that **Settings → Build and Deployment → Node.js Version** is 22.x.

After the first deploy, check that the browser offers to install the game,
that it reloads offline, that a challenge link such as `/?c=diver.1.5.1`
opens its challenge card, and that a shared link unfurls with its preview
picture.
