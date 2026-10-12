# The online side

Tick Perfect plays in full without an account and without a network. The
online side is optional and adds three things:

- **Global leaderboards**, one per watch per season and one per Daily.
- **Rules tuned without a deploy:** an admin changes a watch's difficulty,
  and every page picks it up between rounds.
- **Progress that follows a player** to another device.

A build without the settings below has none of it, and shows no sign-in
anywhere.

## How it fits together

```text
browser ──── sign-in only ────▶ Supabase Auth (Google, GitHub)
   │
   └──── everything else ─────▶ /api (one Vercel Function, server/)
                                   │  checks the token, replays scores
                                   ▼
                                Postgres (Supabase), schema "game"
```

- **The page** signs in with Supabase Auth: OAuth with Google or GitHub,
  using the PKCE flow. It then sends the access token to `/api`.
  - The publishable key in the page can do nothing but sign in.
  - The auth code (`@supabase/auth-js`, about 23 KB) is its own chunk. It
    loads only for a player who signs in, or who has signed in before.
- **The API** is a single Vercel Function (`api/index.ts`) that routes every
  `/api/*` path (`server/router.ts`).
  - It verifies the token on each request: against the project's signing
    keys, or its legacy JWT secret.
  - It reaches Postgres through Supabase's pooler.
- **The data** lives in its own schema, `game`.
  - Supabase's REST API doesn't expose that schema. Row level security is on
    for every table, and the public roles have no grants.
  - Only the API, connecting as the owner, can read or write it.

The migrations are in `supabase/migrations/`.

## Fair scores

A score is never taken on the page's word. Instead:

1. **The server picks the seed.** A ranked round starts with
   `POST /api/rounds`, which deals the seed, notes the time and names the
   rule set. Nobody can shop for an easy round.
   - The page asks for it during the short beat before every round.
   - If it doesn't arrive in time, the round is simply played unranked.
2. **The page sends its input, not its score.** When the round ends, the page
   sends the round's log: every tap, pause and resume, on its own clock.
3. **The server replays the round.** It plays the log through the same engine
   (`src/game`, `replayRound`), with the round's rules. Only the score the
   replay gives counts; a score that doesn't match is rejected.
   - The engine avoids floating-point operations that differ between JS
     engines. Difficulty ramps use repeated multiplication rather than
     `Math.pow`, so a replay in Node matches the browser exactly.
4. **Time has to add up.** A log can't cover more time than passed on the
   server between dealing the seed and receiving the log.
5. **One submission per round.** Each round is single-use, and a round dealt
   six hours ago has expired.
6. **Rate limits.** At most 60 rounds per player and 300 per address, per
   10 minutes; at most 120 submissions per player.
7. **Too steady to be human.** A timing spread under 3 ms over 20 hits or
   more holds the round back for an admin, instead of putting it straight on
   the board.

There is deliberately no "score checksum" from the page. Any key that could
sign one would ship in the page's own code.

## Rules and seasons

- **Rule sets are versions, never edits.** Version 1 of each watch's rules is
  the one the game ships with, created on first use.
- **A deploy that retunes the game moves its seasons on.** A watch played by
  rules the game shipped with gets the new rules as a new version, on a fresh
  board, the first time the API runs after the deploy (a rollback goes back
  to the version it had). A watch an admin has published rules for keeps
  them until an admin publishes others.
- **Saving and publishing are separate steps.** An admin saves a new version
  from the admin panel. Before it is saved, it is:
  - checked field by field (`checkRules`);
  - played by simulated players of five skill levels. The panel shows their
    median scores, and the engine refuses rules it can't play, such as a
    ring that turns faster than the hand.
- **Publishing a version starts a new season** for that watch, on a fresh
  board, so scores on a board were always made under the same rules.
- **An event** plays a version on its own board between two times. The
  standard season resumes when it ends.
- **Pages pick up new rules between rounds, never during one.** Offline, a
  page plays by the rules it ships with.

## Roles

| Role          | Can                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `player`      | Play ranked rounds, rename, sync progress, delete the account                                            |
| `admin`       | Also: review held rounds, ban and unban players, draft and preview rule sets                             |
| `super_admin` | Also: publish seasons and events, flip the switches (boards on/off, an announcement), read the audit log |

Roles are granted in SQL only, never through the API. Every admin action is
written to `game.audit_log`.

## Setting it up

These steps are done once, by whoever owns the deployment. They need your
accounts, so nothing here creates them for you.

### 1. A Supabase project

1. Create a project at [supabase.com](https://supabase.com). A region near
   your players is best, for example Frankfurt for Europe.
   - The API must run beside the database: starting a round takes about a
     dozen queries in a row, each one a round trip. `regions` in
     `vercel.json` names the Vercel region next to the project's, now
     `hnd1` for Tokyo (`ap-northeast-1`); Frankfurt (`eu-central-1`)
     would be `fra1`.
2. Run the migrations in one of two ways:
   - In the dashboard's **SQL Editor**, paste and run each file in
     `supabase/migrations/`, oldest first.
   - With the CLI:

     ```bash
     npx supabase link --project-ref your-project-ref
     ```

     ```bash
     npx supabase db push
     ```

### 2. Sign-in providers

The callback for both providers is
`https://your-project.supabase.co/auth/v1/callback`.

**Google**

1. In the Google Cloud Console, go to **APIs & Services** → **Credentials**
   → **Create credentials** → **OAuth client ID**.
2. Choose the type **Web application**.
3. Add the callback above as an authorised redirect URI.
4. Paste the client ID and secret into Supabase under
   **Authentication** → **Sign In / Providers** → **Google**.

**GitHub**

1. In GitHub, go to **Settings** → **Developer settings** → **OAuth Apps**
   → **New OAuth App**.
2. Set the authorisation callback URL to the callback above.
3. Paste the client ID and a new client secret into Supabase under
   **GitHub**.

**Redirect URLs**

In Supabase, under **Authentication** → **URL Configuration**:

- set the **Site URL** to `https://tick-perfect.vercel.app`;
- add these redirect URLs:
  - `http://localhost:5173/**`
  - `https://tick-perfect.vercel.app/**`
  - your preview URLs, e.g. `https://tick-perfect-*.vercel.app/**`

**Audit logs**

Under **Authentication** → **Configuration** → **Audit Logs**, turn off
**Write audit logs to the database**. Sign-in records then stay only in
Supabase's logs, which keep them for 1 day on the Free plan and 7 on Pro.
The privacy notice says "up to 7 days"; on a larger plan, change it.

### 3. Environment variables

The values come from the Supabase dashboard (**Connect**, and **Project
Settings** → **API**). `.env.example` lists every variable.

| Variable                        | Where | What                                                                  |
| ------------------------------- | ----- | --------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | page  | The project URL                                                       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | page  | The publishable (anon) key                                            |
| `VITE_PRIVACY_CONTROLLER`       | page  | Who is responsible for the players' data, named in the privacy notice |
| `VITE_PRIVACY_EMAIL`            | page  | Where players write about their data                                  |
| `DATABASE_URL`                  | API   | The **transaction pooler** connection string (port 6543)              |
| `SUPABASE_URL`                  | API   | The project URL again                                                 |
| `SUPABASE_JWT_SECRET`           | API   | Only for a project on the legacy JWT secret; otherwise leave unset    |
| `SUPABASE_SERVICE_ROLE_KEY`     | API   | Lets "Delete my account" delete the sign-in, and with it all the data |
| `ALERT_WEBHOOK_URL`             | API   | Optional: an incoming webhook told when the API fails                 |

- **Locally:** copy `.env.example` to `.env.local`. `npm run dev` then
  serves `/api` itself.
- **Required for any deployment, and any online build:** the two
  `VITE_PRIVACY_*` variables. `vite build` stops without them on Vercel, or
  with an online side anywhere, since the privacy notice has to name
  someone.
- **Required for an online deployment:** `SUPABASE_SERVICE_ROLE_KEY`. The
  privacy notice promises that deleting an account deletes the sign-in
  too, so without the key (or when Supabase refuses it) "Delete my account"
  fails, and the failure is reported, rather than leave the sign-in and its
  email address behind.
- **On Vercel:** add them under the project's **Settings** → **Environment
  Variables**, for Production and Preview.

Never give the API variables a `VITE_` prefix: that would put them in the
page.

### 4. Make yourself an admin

Sign in once on the site, so your profile exists. Then run this in the SQL
Editor:

```sql
update game.profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'you@example.com');
```

The panel is at `/admin`.

## The API

| Method     | Path                          | Who         | What                                                                      |
| ---------- | ----------------------------- | ----------- | ------------------------------------------------------------------------- |
| GET        | `/api/config`                 | anyone      | Live seasons, their rules, the switches (cached 60 s)                     |
| GET        | `/api/leaderboard`            | anyone      | `?watch=`, `?season=` or `?daily=`: top scores, your place (never cached) |
| POST       | `/api/rounds`                 | player      | A seed for a ranked round: `{ watch, daily? }`                            |
| POST       | `/api/rounds/:id`             | player      | The round's log and claimed score; replayed and judged                    |
| GET, PATCH | `/api/me`                     | player      | Profile; rename                                                           |
| DELETE     | `/api/me`                     | player      | Deletes the account and everything stored with it                         |
| GET, PUT   | `/api/me/progress`            | player      | Progress for other devices                                                |
| GET        | `/api/admin/overview`         | admin       | Live seasons, held rounds, switches                                       |
| GET, POST  | `/api/admin/rulesets`         | admin       | A watch's versions; save a new one                                        |
| POST       | `/api/admin/rulesets/preview` | admin       | Check and simulate, saving nothing                                        |
| GET, PATCH | `/api/admin/rounds`           | admin       | Held rounds; let one count or reject it                                   |
| GET, POST  | `/api/admin/users`            | admin       | Find players; ban or lift a ban                                           |
| POST       | `/api/admin/seasons`          | super admin | Publish a season or schedule an event                                     |
| PUT        | `/api/admin/settings`         | super admin | Flip a switch                                                             |
| GET        | `/api/admin/audit`            | super admin | The audit log                                                             |
| GET        | `/api/admin/errors`           | admin       | `?days=1, 7 or 30`: errors by kind, latest first                          |
| POST       | `/api/reports`                | anyone      | An error the page ran into (sent by the page itself)                      |
| POST       | `/api/reports/csp`            | anyone      | What the content security policy blocked (the browser's)                  |

Errors come back as `{ "error": { "code", "message" } }` with an HTTP status.

## Errors and alerts

The game keeps its own error log, in `game.error_reports`, rather than
sending errors to another company:

- **The API's failures:** anything that ends in a 500, with its route and
  stack. A deliberate answer (a 4xx, or 503 while the boards are closed) is
  not a failure.
- **The page's errors:** uncaught errors, unhandled promise rejections and
  what an error boundary caught (the 3D scene's, mostly). A page sends five
  at most, each kind once (`src/online/page-errors.ts`).
- **What the content security policy blocks,** reported by the browser
  itself. Browser extensions' own violations are dropped.

Errors are counted per kind and hour: the same message from the same place
is one kind, whatever ids or numbers it mentions. A kind keeps its latest
sample. Nothing names a player: no account, no network address, and the
browser only as its name, version and system ("Safari 18 · iOS"). Queries
are cut from every URL. Hours older than 30 days are deleted.

Anyone can send a page or policy report, so:

- each address may send 30 per 10 minutes, and all of them together 600 an
  hour, each violation in a batch counting as one;
- an hour takes 50 new kinds of each at most; any more are counted together
  in one kind that says so;
- text Postgres can't store (NUL characters, lone surrogates) is dropped,
  so no report can fail as an API error.

The API's own failures are never folded away.

**Reading them:** the admin panel's **Errors** tab lists them by kind for the
last day, week or month. Its button shows how many came in the last day.

**Alerts:** with `ALERT_WEBHOOK_URL` set, an API failure posts a message to
that webhook, at most one an hour. The body carries the text as both `text`
(Slack and most others) and `content` (Discord). The hour is kept in the
database; when the database is the thing that failed, each function instance
keeps its own.

## Security headers

`vercel.json` sends, with every response:

- **A content security policy.** Scripts, styles, images, fonts and workers
  come from the site only, with no inline code and no `eval`. Pages connect
  to the site and to Supabase (`https://*.supabase.co`), for sign-in.
  Nothing may frame the game, and violations go to `/api/reports/csp`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a
  `Cross-Origin-Opener-Policy` and a `Permissions-Policy` that turns off the
  camera, microphone, location, payments and USB.

`vite preview` sends the same headers, read from `vercel.json`, so the e2e
tests run the whole game under the policy and fail on any violation. A new
third-party resource therefore fails a test before it fails in production.
A project on a custom domain needs that domain added to `connect-src`.

## Privacy

The privacy notice at `/privacy` (`src/privacy/notice.ts`) says what the
game keeps and why, in English and Turkish. It describes the build it ships
in: an offline build leaves out sign-in and reports. **When the code
changes what it keeps, change the notice and its `NOTICE_DATE` with it.**

For a signed-in player, the game stores:

- the display name, starting from the provider's name and editable. The
  provider's email and picture are never stored by the game; Supabase Auth
  keeps them with the sign-in.
- each ranked round's log and score;
- the best score on each board;
- the progress the player chose to sync.

For a while, it also keeps network addresses with a count, for rate limits
(an hour), and errors without anyone's name (30 days). Of the rounds:

- a refused round keeps why, never its log, and goes after 30 days;
- a round dealt but never finished goes after a day;
- a round on the boards loses its log after 30 days, keeping its score
  and statistics; one held for review keeps it until it is decided.

The deletions run as requests come in, and on every `/api/config`, which
every page asks for.
For a schedule that doesn't depend on traffic, `pg_cron` can run the same
two deletes (`server/housekeeping.ts`).

Boards publish a name, a score and a place, never when a score was made.

**Delete my account** deletes the sign-in through Supabase's admin API, and
the game's rows go with it. The admins' log keeps what they did, with the
account replaced by "deleted account". A banned player can't sign in to do
this, so the notice asks them to write instead; delete the account from the
Supabase dashboard (Authentication → Users).

## Development

- **Tests:** `npm test` runs the API's tests against a real Postgres in
  memory ([PGlite](https://pglite.dev)). It applies the migration over a
  stand-in for Supabase's `auth` schema and uses tokens signed the way
  Supabase signs them, so no Docker or network is needed.
- **e2e:** the e2e build knows a made-up project, so the tests cover the
  online screens against a stubbed `/api`.
