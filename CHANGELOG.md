# Changelog

All notable changes to Tick Perfect are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The Field**, the first watch of a second series after Endless, after
  the soldier's field watch: big numerals with the 24-hour time inside
  them, sword hands and a canvas strap. Now and then its seconds hand
  hacks: it stops dead short of the marker, the crown pulled out, and runs
  on a moment later at the same speed, so a tap on the beat comes early;
  a stem shows between the case and the pulled crown.
  It opens with 15 on Endless at level 7, in Olive Matte and Brown Bronze
  as well.
- **The Pilot**, after the big observer's watch of the bomber crews: big
  numerals, a triangle between two dots at 12, an onion crown and a
  riveted leather strap. Now and then cloud drifts over its dial ahead of
  the marker and the seconds hand flies on through it, misted. It opens
  with 15 on the Field at level 8, in Blue Sunburst on black leather and
  Brown Rose Gold as well.
- **The Digital**, after the eight-sided analog-digital: a resin case and
  guard, four buttons, thick lumed hands and two liquid crystal windows,
  the score at 3 and the time at 6, lit from behind at night. Now and then
  its display counts down to the marker, 3, 2, 1, a beep and a flash on
  each beat: tap at zero. It opens with 15 on the Pilot at level 9, in Red
  Resin and Gold Steel (gold plate, a bracelet and negative windows) as
  well.
- **Engravings on the caseback.** Five achievements named after real
  chronometry: Isochronism (a round of 50 taps or more, spread under
  15 ms) and Beat error (10 Perfects in a row), engraved on the watch they
  were earned on, and Positional test (Observatory on each of the first
  six watches), Power
  reserve (wound to 7 days) and Escapement (1,000 Perfects in all), on
  every caseback. Caseback on the title turns the watch over to show them,
  with what earns the rest; the results say when one is engraved. They
  follow the player to other devices and into backups.
- **Latest rounds in the timegrapher.** Each watch's latest 10, 25 or 100
  rounds summed up: average score, Perfect share, rate and spread, each
  beside its change on as many rounds before. A line per round is kept on
  the device, the latest 100 on each watch.
- **Recent Dailies in the timegrapher.** The last fortnight a cell a day,
  with that day's best, the run of days played and how many were. Each
  Daily's best is kept for 60 days, and follows the player like the rest
  of their progress.
- **Ghosts.** A new best round is kept as a ghost: its seed and the
  moments of its taps, a couple of kB on the device. Race your best, from
  the title, plays that round's targets again with a small ring at the
  dial's edge where its ghost's hand is (the player's hand stays the only
  hand on the dial), its score and the gap to it in the corner, and
  the two rounds side by side at the end (score, hits, Perfects, spread);
  a learnt sequence, it counts for nothing. A Daily's retries race the
  day's best round the same way, and count as usual. A ghost is played
  through the engine before each race and left out if the rules have
  changed since.
- **Practice**, from the title, on any watch the collection has opened:
  sets of 25 targets where a miss moves on to the next, each target's
  timing shown as it lands, and a summary at the end (hits, Perfects,
  misses, best streak, rate and spread). A slow pace, the hand slower and
  the windows wider, is the default until the watch is certified; the
  next set can go at either. Practice counts towards nothing: no best,
  level, Daily, achievement, timing record or board.
- **Start over** in Settings: reset the settings, or erase the progress on
  this device after a confirmation (signed out, so an account can't bring
  it straight back).

### Fixed

- A Daily or a power-reserve wind dated more than two days ahead (a clock
  set ahead, or a made-up backup) is no longer kept, so it can't stop
  every Daily until then from counting.
- A watch earned only by two devices' progress together now opens as soon
  as they merge.
- Engravings this version knows are kept ahead of any others when a save
  is over the cap.
- A backup too large to read says so, instead of calling it not a backup.
- A ranked round sent twice at once is taken in once.

### Changed

- From Daily #26, on 26 October 2026, the Dailies take turns on the
  second series too: eight watches in all. Dailies until then keep the
  watches they had.
- New variants. The Diver's Chronometer variant is green all over, dial
  and bezel. The GMT's Observatory variant is burgundy and black with gilt
  numerals, print, hands and markers. The Tourbillon's are layered carbon
  in the racing colours: forged carbon marbled with yellow fibres for the
  Chronometer, black carbon in orange plies, with orange wheels and cage,
  for the Observatory. The Grand
  Complication's Observatory variant is 18k rose gold over a navy dial. The
  Chronograph's cream variant comes on a steel bracelet. A pick of a
  replaced variant moves to the one that took its place on that watch.
  Every variant is named the same way, its colour and then its finish or
  material: Green Sunburst, White Opaline, Burgundy-Black Gilt, Orange
  Carbon, Navy Rose Gold. A
  variant may now change the case's metal and accents, the hands' metal
  and the strap, never the case's or a hand's shape.
- Every player can play every Daily, on a watch the collection hasn't
  opened yet too: the round counts towards the Daily alone, and the watch
  stays locked. A challenge can be played only once the collection has
  unlocked its watch: until then its card says which watch to unlock.
- The Grand Complication's travel-time hand is a fine stem with a small
  openwork arrowhead, its barbs swept back, on a finer dark edge.

### Removed

- Share on the results, and with it the challenge links the game made.
  Links already sent still open their round.

## [1.0.0] - 2026-10-11

The first public release.

### Gameplay

- A one-tap timing game on a 3D mechanical watch: tap as the seconds hand
  reaches the marker. Every hit reverses the hand, speeds it up a little and
  narrows the timing window; one miss ends the run. The hand starts at
  100°/s and never passes 270°/s (250°/s on the Moonphase), so a long round
  is a matter of timing, not of a blur.
- A **Perfect** in the marker's white core scores +2 instead of +1. Three
  Perfects in a row double every score (×2) and eight triple it (×3), until
  a plain hit breaks the streak.
- A difficulty curve tuned against simulated players: windows are set in
  milliseconds and ease towards ±24 ms, so a first round is forgiving, scores
  keep rising with skill and there is no hit where it suddenly stops.
- Taps are judged at the input event's own timestamp, never at the last
  frame drawn, so a dropped frame never costs a hit.
- The score sits in the watch's date window; the results say how far off the
  miss was ("27 ms too early") and the nearest goal ("3 points to unlock the
  GMT", "35 points to level 4").
- Pausing with Esc, P or the pause button, and automatically when the tab or
  app is left, the window loses focus or the phone turns; play resumes after
  a 3-2-1 countdown. Restart and Main menu ask first when the round has
  scored, since a round is only saved when it ends.
- A pure, deterministic engine: seeded random numbers, data-driven difficulty
  ramps and a state machine, with golden masters pinning every watch's plans.
- **How to play**, from the title's corner buttons: four short cards on
  tapping in time, the Perfect core, the multiplier streak and the watch on
  show's own rule, each with a small picture drawn in the studio's colours.
  Until the first score, the title's rule line says one miss ends the run
  and the bright core is Perfect.
- One-time tips on the line under the watch, read out to screen readers too:
  the first Perfect, a Perfect on the way to ×2, ×2 switching on, and a
  plain hit ending a streak. Each is shown once per device, never over a
  twist's hint, and the Diver's turning bezel now has a hint of its own
  while the watch is being learnt.

### Watches

- Six procedural watches, each drawn after an icon of its kind, never a
  maker's name or mark, and each adding one rule from a real complication:
  - **Diver:** now and then the bezel turns, carrying the marker.
  - **Chronograph:** twin markers, tap at ▶ to start and at ■ to stop.
  - **GMT:** an arrow-tipped second hand sweeps across the marker; tapping
    under it is a miss.
  - **Moonphase:** some markers fade on the way in.
  - **Tourbillon:** now and then the watch rocks on the wrist; the timing
    stays the same.
  - **Grand Complication:** Endless, every rule mixed, once the whole
    collection is unlocked.
- The GMT's gate is drawn as a shaded, striped part of the marker with a
  clear line where the open part begins, fixed from the start of the sweep,
  and gated markers are wider, so the covered part is easy to see.
- **Watchmaker's level:** every collection round adds its score to the
  player's points, and points reach levels (150, 400, 800, 1400, 2200 and
  on). A watch unlocks, for good, with 15 on the watch before it and its
  level: the Chronograph at level 2, up to Endless at level 6. The title
  shows the level and a locked watch what it still waits for; the results
  show the level and ring in a new one. Saves from before levels keep every
  watch they had unlocked.
- **Certificates** per watch, printed on its dial: Adjusted (15),
  Chronometer (40) and Observatory (75).
- **Variants:** two real-world colourways per watch, earned by its
  Chronometer and Observatory certificates and picked with swatches on the
  title. Colours and finishes only, never new parts or rules: the
  Tourbillon's tiers move from forged carbon to layered carbon with lime
  plies and on to plain blue ceramic, each with its own movement finish.
  The Chronograph's go from black to panda to a cream dial.
- Every watch is built from a `WatchSpec`: lathe-turned cases and bezels,
  extruded hands and markers, canvas-painted prints, a sunburst dial and a
  reflection-only crystal that cracks on a miss, lit by a studio HDRI.
- Lug to lug and strap widths true to the watches they are drawn after,
  with straps folded round their spring bars and bracelet end links fitted
  flush to the case, so no gap shows between case and strap.
- Night mode: a dark studio and glowing lume.

### Modes

- **Daily:** the same targets for every player each local day, numbered from
  Daily #1 on 1 October 2026, on a watch that rotates through the
  collection (playable in full even while locked). Replays are allowed and
  the day's best counts; a Daily never counts towards bests, certificates or
  unlocks.
- **Power reserve** in place of a streak: the day's first Daily winds it by a
  day, up to seven, and a day off only lets it run down by one. Taking in
  another device's progress or a backup never runs it down.
- **Share:** a compact card with a ◆/◇ trace of the run and a challenge
  link; a Daily always shares the day's best.
- **Challenge links** (`/?c=watch.seed.score`): a friend plays the very same
  targets with the score to beat; a link to today's Daily is played as the
  Daily.
- Challenge links carry the revision of the watch's rules they were set on
  (`/?c=watch.seed.score.revision`; links without one read as the first).
  One set on other rules still plays, and its card says the targets will
  differ.
- The Dailies' watches follow a rotation table that is only ever added to,
  so a new watch never changes a Daily already out; it joins the Dailies a
  few days after its release, once every page and the server agree.
- **Timegrapher:** every hit's timing error is recorded per watch in every
  mode, and a panel draws the latest 120 as a paper trace with the rate,
  spread, share of Perfects and hits. The results add the round's own
  ("Timing 9 ms late · ±14 ms").

### Online (optional)

- Global leaderboards per watch season and per Daily, with sign-in through
  Supabase Auth (Google, GitHub). Guests play in full; an account is needed
  only to post scores.
- Ranked rounds are checked on the server: it deals the seed, the page sends
  back its taps, and the server replays them with the same engine. Only the
  replay's score counts. Rate limits, single-use rounds, a timing check and
  a review queue for rounds too steady to be human back it up.
- Rule sets are versions; publishing one opens a new season on a fresh board,
  and events run a version on their own board for a while. Pages take new
  rules between rounds.
- An admin panel at `/admin`. Rules are checked and simulated before they
  are saved, and every admin action goes to an audit log. Admins and super
  admins have separate roles.
- Progress syncs to the account and merges without losing anything earned
  on either device; "Delete my account" removes everything stored.
- The API is one Vercel Function over Postgres in a schema the public API
  can't reach. Its tests run against PGlite.
- Errors are reported to the game's own log, with nothing that names a
  player: the API's failures, errors the page runs into and what the content
  security policy blocks. The admin panel lists them by kind, and an API
  failure raises an alert through a webhook, at most once an hour.

### Privacy and security

- A privacy notice at `/privacy`, in English and Turkish, written for the
  GDPR and the KVKK. It is linked from the settings and the sign-in panel,
  and describes what this build does: an offline build leaves out sign-in
  and reports.
- The notice says a progress backup is a file on the player's device that
  goes nowhere unless they send it.
- Nothing is kept that isn't used: the provider's picture is no longer
  stored, boards no longer publish when a score was made, rate-limit
  records holding network addresses go after an hour, and error reports
  after 30 days.
- "Delete my account" now fails loudly rather than leave the sign-in
  behind, and the admins' log no longer names a deleted account.
- A strict content security policy (`script-src 'self'`, no inline code, no
  third-party origins but the build's Supabase project), with violations
  reported to the error log, plus `X-Frame-Options`, a
  `Cross-Origin-Opener-Policy` and a `Permissions-Policy`. The e2e tests run
  under the same headers.

### Sound and feel

- Sounds modelled on a real movement (modal synthesis, no audio files): the
  escapement's tick and tock in three impacts each, hits, Perfects, the
  multiplier, the chronograph's pushers, the GMT hand, a fading target, the
  miss, a crown detent while browsing, and repeater gongs for an unlock, a
  certificate and a new best. Each sound has several takes, and every play
  varies its pitch and level; ticks soften as the hand speeds up.
- Each watch has its own movement voice, after its calibre and case metal,
  and it grows quieter and finer up the collection: smoother contacts,
  steadier beats and a closer tick and tock, the gold and platinum cases
  warmer than the steel ones.
- Vibration patterns for hits, Perfects, the multiplier, misses and unlocks,
  on devices that can vibrate.
- Passing the best mid-round (or the day's best, or a score to beat), or a
  certificate's score the watch hasn't earned yet, lights the score in the
  corner for a moment, with a quiet note 10 dB under a new best's and a
  nudge after the hit's buzz. A plain hit that ends the multiplier lets it
  go with a soft falling note as the streak's diamonds drain away.

### Accessibility

- Fully playable by keyboard: Space taps, Esc or P pauses, the arrows, Home
  and End browse the collection and the swatches, and Space or Enter press a
  focused control instead of starting a round.
- Screen reader announcements for the round, the multiplier, pauses, the
  results and unlocks, each spoken once; English names inside Turkish text
  are marked `lang="en"`.
- **Turn off animations** stops interface motion, the title's demo round and
  the miss's jolt while the game's own motion plays on. It follows the
  system's reduce-motion setting until changed, can go back to it, and
  holds from the very first paint.
- 44 px touch targets for the title's actions, the challenge card, the
  swatches and the icon buttons, readable timegrapher labels, a visible
  inactive ×2 badge, and hints that say "tap" on touch screens and "Space"
  with a keyboard.
- A short reflex press just after a miss no longer skips the results.

### Interface

- Title, game, pause, results, settings and timegrapher screens, laid out for
  phones held either way, tablets and wide screens, with text kept off the
  polished case and bracelet.
- The collection strip with rendered thumbnails, silhouettes for locked
  watches and certificate pips.
- Light and dark studios: an ivory and a graphite seamless sweep, each lit
  by one soft pool of light that follows the watch. They follow the
  system's scheme, live, or the **Appearance** setting (System, Light,
  Dark); night mode puts the lights out over either. A change crossfades,
  and a load or reload paints the chosen studio from its first frame.
- Settings: sound, vibration, appearance, night mode, turn off animations
  and language.
- English and Turkish, picked from the browser's languages.
- Shared links unfurl with a preview: the title screen in the dark studio,
  rendered from the real scene (`npm run og`).

### Performance

- The first paint stays far under its 400 KB gzip budget, enforced in CI;
  the 3D stack loads as its own chunk.
- The title's header is drawn by `index.html` before the scripts arrive.
- Smooth loading: the watch is ready about half a second sooner, its
  picture comes into focus instead of popping in, the title's tagline,
  corner buttons and the game's HUD fade in, and dialogs fade out.
- The studio HDRI is a quarter of the download (256×128, bulbs capped) and
  bundled with a content hash.
- Quality tiers (including a new balanced tier) follow the screen's refresh
  rate and step down only on real slowdowns; shared geometry and materials
  keep browsing watches and variants smooth.
- A device starts each visit on the quality tier it settled on last time,
  so a slow one no longer stutters through the richest tiers first, and
  steps up again when it can.
- **Battery saver** in the settings holds the cheapest quality tier, with no
  bloom, whatever the device could manage.

### Offline and resilience

- An installable PWA that plays offline after the first visit, and updates
  itself on the next load.
- Progress is saved field by field and merged across tabs, so no tab wipes
  another's score; an unreadable save is kept aside instead of overwritten.
- **Back up progress** to a dated file from the settings, and **Restore**
  one: a backup holds what an account would (no settings), and restoring
  merges like a sync, so an old file never takes anything away. After the
  first unlock the game asks the browser, once, to keep its storage, and in
  a Safari tab on an iPhone or iPad suggests Add to Home Screen, once.
- Clear messages, with a Reload button, when WebGL is turned off or the 3D
  scene can't load; if the GPU drops the scene mid-round, the round pauses
  and the watch is restored.
- A tab left open across a release reloads itself once for the new build
  when a part it hasn't loaded yet is gone, never mid-round (it waits for
  the title), and sign-in loads again after its code failed to arrive.
- The title warns when the browser won't keep progress, a broken challenge
  link says so, and when sharing and the clipboard both fail the text is
  shown ready to copy.

### Development

- Vite, React 19, strict TypeScript, React Three Fiber, Zustand and Tailwind
  CSS 4.
- Vitest unit tests with 100% coverage of the game rules, and Playwright
  end-to-end tests on a desktop and a phone, on the Mac's GPU locally and in
  software on CI.
- ESLint (with a local rule keeping `src/game` pure), Prettier, lefthook git
  hooks and commitlint; GitHub Actions CI; Vercel deployment with caching
  and security headers.
- Every build reports its version and commit (`1.0.0+3f2c1ab`) with ranked
  rounds and error reports, so the logs tell releases apart.

[Unreleased]: https://github.com/mylcin/tick-perfect/compare/v1.0.0...main
[1.0.0]: https://github.com/mylcin/tick-perfect/releases/tag/v1.0.0
