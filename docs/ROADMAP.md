# Enhancements and production readiness

An audit of the game after Phase 8 (October 2026): what is done, what has
to happen before launch, and what is worth doing after it. Every figure
below was measured on this codebase.

**Priority:**

- **P0:** before launch.
- **P1:** in the first weeks after launch.
- **P2:** when there is reason to.

The boxes mark what is done (☑) and what is still open (☐).

## Launch blockers (P0)

- ☑ **The online side's accounts and keys.** Someone has to create the
  Supabase project, the Google and GitHub OAuth apps and the Vercel
  environment variables (docs/BACKEND.md). They need the owner's
  accounts. Without them the game ships offline-only, which is a complete
  game too. For a public launch this includes:
  - `VITE_PRIVACY_CONTROLLER` and `VITE_PRIVACY_EMAIL`, without which an
    online build stops;
  - `SUPABASE_SERVICE_ROLE_KEY`, so that deleting an account deletes the
    sign-in too, as the privacy notice says;
  - optionally `ALERT_WEBHOOK_URL`, to hear of API failures.
- ☑ **A privacy notice** at `/privacy`, in English and Turkish, linked from
  the settings and the sign-in panel. It names the controller,
  what is kept, why and on what legal basis, who receives it, for how long,
  and the GDPR and KVKK rights. It follows the build: an offline build
  leaves out sign-in and reports.
  - Data the game had no use for went with it: the provider's picture is no
    longer stored, and network addresses kept for rate limits are cleared
    within the hour.
- ☐ **A lawyer's read of the privacy notice,** before the online side goes
  public. Two points need the owner's action, not just text:
  - **Transfers abroad under KVKK Art. 9.** Vercel and Supabase process the
    data outside Turkey. Since June 2024 that needs an adequacy decision,
    appropriate safeguards (such as the KVKK standard contract, signed with
    each provider and notified to the Authority within five business days)
    or one of the article's exceptions. Until one is in place, the notice
    only says that Art. 9 applies; once it is, name it there.
  - **VERBİS.** Whether the controller has to register depends on who they
    are; small controllers are usually exempt.
  - The notice is written from the code, not from legal advice. An
    adversarial review checked every claim in it against the code.
  - Turn off Supabase Auth's audit logs in the database (docs/BACKEND.md),
    so sign-in records keep to the periods the notice gives.
- ☐ **Google's OAuth consent screen set to "In production".** The game asks
  only for the basic profile and email scopes, so no Google review is
  needed. In "Testing", only listed users can sign in.
- ☑ **A content security policy,** with no inline code and no third-party
  origins but Supabase, plus `X-Frame-Options`, a
  `Cross-Origin-Opener-Policy` and a `Permissions-Policy`. The e2e tests
  run every flow under the same headers and fail on any violation, and
  browsers report violations to the error log (docs/BACKEND.md).

- ☑ **Version 1.0.0.** Bump `package.json`, date the CHANGELOG and tag
  `v1.0.0`.
- ☑ **Lighthouse and Web Vitals on the deployed URL.** On 11 October 2026:
  desktop 96 for performance, 100 for accessibility and SEO, 96 for best
  practices; mobile 54 for performance. Lighthouse's mobile run renders
  WebGL in software, where building the watch blocks the page for
  seconds; with a GPU and the same 4× slower CPU the longest task is
  about 360 ms. That task is still worth splitting (see Web performance).
  Measure again on a real mid-range Android phone over 4G before
  announcing it.

## Security and fair play

- ☑ **Scores are replayed, never trusted.** The server deals the seed and
  replays the taps with the same engine. Rounds are single-use and expire,
  the timing must add up, and both players and addresses are rate-limited
  (docs/BACKEND.md).
- ☑ **The data is behind the API only.** It lives in its own schema, with
  RLS on and no grants to the public roles. Tests prove that the `anon`
  role can't read it.
- ☑ **Roles are granted in SQL only, and admin actions are audited.**
- ☐ **P1: Multi-factor authentication for admin accounts.** Supabase Auth
  supports TOTP. Require it for `admin` and `super_admin`, both in the API
  (an `aal2` claim) and in the panel.
- ☐ **P1: Better bot detection.** A script that plays in a real browser,
  adding human-like noise to its taps, passes the spread check. Candidates:
  - each player's history: a sudden jump in skill, or a spread that never
    varies from round to round;
  - reaction to twists: a bot is as steady on a hidden Moonphase target as
    on a visible one;
  - a shadow ban that lets a suspect see their own scores but nobody else
    see them.
- ☐ **P2: Daily boards across a rule change.** A Daily is played by the
  watch's live rules. Publishing new rules mid-day mixes rule sets on that
  Daily's board. Pin each Daily to the ruleset of its first round.
- ☐ **P2: Rate limits at the edge.** The limits live in Postgres, which is
  fine at this scale. At larger scale, move them to the Vercel Firewall or
  Upstash, so floods never reach the database.

## Operations and capacity

- ☑ **Error reporting,** in the game's own database rather than a third
  party's: the API's failures, the page's errors and policy violations,
  counted by kind and hour and read in the admin panel. An API failure
  raises an alert through a webhook, at most once an hour.
- ☐ **P2: Alerts on the page's errors,** not just the API's. A release that
  breaks the scene on one browser shows in the admin panel, but alerts no
  one. A threshold per hour (say, one kind seen from many pages) would.
- ☑ **P1: Prune round logs.** Done as below, by the housekeeping that
  `/api/config` runs (`server/housekeeping.ts`); a refused round keeps no
  log at all, and a log holds 2,000 actions at most. Measured round logs are about 0.8 KB on
  average for a good player, 2 KB for an expert and 3.7 KB at most. At
  roughly 2 KB a round with its row, Supabase's free 500 MB holds about
  250,000 rounds.
  - Logs are only needed to replay a round and for moderation. Set `log` to
    null on verified rounds after 30 days; keep the score and the summary.
  - Rounds left `issued` or `abandoned` can go after a day.
  - A scheduled job (Supabase `pg_cron`, or a Vercel Cron Job calling an
    admin endpoint) can do both.
- ☐ **P1: Backups.** The free plan keeps no point-in-time recovery.
  - Before scores matter to players, either move to a plan with daily
    backups, or export `game.best_scores`, `game.profiles` and
    `game.rulesets` on a schedule.
- ☐ **P1: Uptime.** A check on `/api/config` every few minutes; the game
  itself is static and keeps working when the API is down.
- ☐ **P2: A staging project.** A second Supabase project for previews, so
  testing rules or migrations never touches the live boards.
- ☐ **P2: A load test** of `/api/rounds` and `/api/leaderboard` (k6)
  before a launch that could bring a burst of players. Replaying a round
  costs little: 0.05–0.1 ms of CPU on a laptop, even an expert's 70-hit
  round. The database round trips will be the bottleneck.

## Retention

The game's rules for retention (docs/VISION.md):

- no ads, energy, loot boxes, purchases or required accounts;
- no streaks that punish a missed day.

**Done**

- ☑ The Daily, with the power reserve: it winds up by playing and never
  wipes progress.
- ☑ Certificates per watch: 15, 40 and 75, set from the simulated
  difficulty curve.
- ☑ Unlocking the collection, Endless on the Grand Complication, and
  variants as earned finishes.
- ☑ The timegrapher, challenge links and share cards.
- ☑ Global leaderboards per watch season and per Daily, and events on their
  own boards.

**Open**

- ☑ **P1: Horological achievements,** engraved on the watch's caseback
  rather than shown as a badge wall. Each names a real chronometry idea.
  The first two are engraved on the watch they were earned on, the rest on
  every caseback; the title turns the watch over to show them:
  - _Isochronism:_ a timing spread under 15 ms over 50 hits.
  - _Beat error:_ 10 Perfects in a row.
  - _Positional test:_ the Observatory certificate on every watch of the
    first series.
  - _Power reserve:_ seven days wound.
  - _Escapement:_ 1,000 Perfects in all.
- ☐ **P1: The weekly Endless modifier** as an event season. The tooling is
  there: publish a variant of the Grand Complication's rules as a
  week-long event.
- ☐ **P2: Friends' boards** from challenge links: everyone who played one
  link's seed.
- ☑ **P1: The second series** after Endless, at levels 7 to 9:
  - ☑ the Field, after the soldier's field watch: the hand hacks;
  - ☑ the Pilot, after the big observer's watch: cloud over the dial
    ahead of the marker, the hand flying on through it;
  - ☑ the Digital, after the eight-sided analog-digital: its display
    counts down 3, 2, 1 with a beep and a flash, tap at zero.
- ☐ **P2: New watches** from docs/VISION.md:
  - the Worldtimer;
  - the Perpetual calendar;
  - the Minute repeater, which can be played by ear and so doubles as an
    accessibility mode.

## Web performance

**Done**

- ☑ The first paint costs 122.5 KB gzip (budget 400 KB).
- ☑ Code that most players don't need waits until it is needed: three.js
  and the scene, sign-in and the admin panel are separate chunks.
- ☑ The studio HDRI is 104 KB and preloaded. The PWA precaches the game for
  offline play.
- ☑ Quality tiers, shaders compiled ahead of time, and geometry built
  once per watch and disposed late.
- ☑ Every sound is rendered in idle tasks after the first tap, each
  watch's tick and tock first: about 75 ms in all in desktop Chrome, the
  longest task 13 ms (330 ms and 60 ms with the CPU slowed 4×). Nothing is
  downloaded for sound.

**Open**

- ☐ **P1: The first visit to each watch blocks for 100–800 ms** with the
  CPU slowed 4×, while its geometry is built. Build it across frames, or in
  a worker, starting with the movement's signed-distance outlines.
- ☐ **P1: Interaction to Next Paint on a low-end Android.** Taps are judged
  at their own timestamps, so lag never costs a hit. It still shows: the
  hit flash comes late.
- ☐ **P2: three.js is 262 KB gzip of the 436 KB total.** Check drei's
  imports for tree-shaking, and whether `postprocessing` can be replaced by
  the local effects alone.
- ☐ **P2: Thumbnails have no content hash.** Updates rely on the service
  worker's revision; a hash would make them cache safely for a year.

## Mobile and haptics

**Done**

- ☑ Touch input with timestamps, safe areas, and layouts for upright,
  sideways and short screens.
- ☑ Vibration patterns for hits, Perfects, the multiplier, misses and
  unlocks, on devices that have the Vibration API (Android). The setting
  says when it isn't supported.
- ☑ A **Battery saver** setting that holds the cheapest quality tier, with
  no bloom (browsers no longer expose the battery's state), and a device
  that settled on a lower tier starts its next visit there.

**Open**

- ☐ **P1: iOS has no Vibration API.**
  - Safari 18 gives a light haptic tick when a `<input type="checkbox"
switch>` is toggled. Some sites trigger it through a hidden label as a
    workaround.
  - It is undocumented behaviour and could stop at any update. If it's
    added, keep it behind the vibration setting and say what it is.
- ☐ **P1: Test on real devices,** not only in emulation:
  - an iPhone SE (small screen, Safari);
  - a mid-range Android (touch latency, GPU tier);
  - an iPad sideways.
- ☐ **P2: Hold back the decorative motion on battery saver** too, such as
  the title's demo round. "Turn off animations" already does it by hand.

## Accessibility

- ☑ Keyboard play, screen reader announcements, focus management in every
  dialog, colour never the only cue, "Turn off animations".
- ☐ **P1: Test the leaderboard and the admin panel with VoiceOver and
  TalkBack.** Both follow the same patterns, but neither has been tested
  with a screen reader yet.

## Internationalisation

- ☑ English and Turkish, typed dictionaries, watch names kept in English
  inside Turkish.
- ☐ **P2:** The admin panel is English only, by design. Translate it only
  if someone who doesn't read English runs the game.
