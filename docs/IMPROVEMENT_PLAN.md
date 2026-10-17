# Improvement plan

An audit of Tick Perfect as it stands (one commit, `7d85367`, 16 October
2026), and the plan that follows from it. Every finding cites the code it
comes from; anything not proven is marked as a risk, not a bug. The status
column of the roadmap is kept up to date as work lands.

## 1. What exists today (verified in the code)

**Stack.** Vite, React 19, TypeScript strict, Three.js through React Three
Fiber, Zustand with `persist`, Tailwind 4. Vitest (unit, with 100% coverage
enforced on `src/game` only), Playwright (desktop and mobile Chromium),
lefthook (format, lint, commitlint, typecheck and unit tests before a push),
GitHub Actions CI, Vercel hosting.

**The game.** `src/game` is pure and seeded: `update` in `state.ts` is the
whole round as a reducer, `plan.ts` places targets from the seed, and
`replay.ts` plays a log of taps back through the same engine. Any miss ends
the round (`state.ts`, `tap` and `checkPassed`). There is no practice mode
and no way to continue after a miss (`RoundMode` in `src/state/modes.ts` is
`collection | daily | challenge`).

**Watches.** Nine, built from data specs (`src/watches`), each with one twist
(`src/game/twists`). Endless is a watch (`ENDLESS_WATCH`), not a mode.
Variants are earned by certificate tier (`src/state/variants.ts`).

**Progress.** Best score per watch, unlocked watches and points
(`src/state/progress.ts`); levels from points (`levels.ts`); certificates
derived from the best (`certificates.ts`); engravings, each earned once and
dated by Daily number (`engravings.ts`).

**Daily.** One seed per local calendar day (`dailySeed` in
`src/game/daily.ts`), on a rotating watch (`DAILY_ROTATIONS` in
`src/state/daily.ts`). Only the latest Daily's best is kept
(`SavedState.daily: DailyRecord | null`). The power reserve (`reserve.ts`)
stands in for a streak: a day played winds it, a day missed lets it down by
one.

**Challenge links.** `/?c=<watch>.<seed>.<score>[.<revision>]`, parsed
strictly (`parseChallenge` in `src/state/challenge.ts`). They replay the same
targets, not the friend's taps; nothing about a challenge is saved.

**Timegrapher.** Per watch: lifetime sums of the hit errors and the last 120
hit errors (`TimingRecord` in `src/state/timegrapher.ts`). There are no
round boundaries and no dates, so nothing can be said about "the last 10
rounds" or progress over time.

**Sharing.** Text only: a ◆/◇ trace and the challenge link, through
`navigator.share` or the clipboard (`src/utils/share.ts`).

**Online (optional).** One Vercel Function (`api/index.ts`) over Supabase
Postgres and Supabase Auth. Without its environment it answers 503 and the
client hides everything online (`ONLINE` is null in `src/online/config.ts`).
Ranked rounds take a server-dealt seed and are replayed on the server before
they count (`server/routes/rounds.ts`). A signed-in player's progress is
synced as one JSON blob (`/api/me/progress`).

## 2. LocalStorage and state

**One save, one key.** `tick-perfect` holds `{ state, version: 1 }`
(`SAVE_KEY`, `SAVE_VERSION` in `src/state/saved.ts`). `state` is settings,
progress, the selected watch, variant picks, the Daily, the reserve, timing
records, engravings and tips. The Supabase session is in its own key, and so
is the scene's quality tier.

**Already robust.**

- Every field is read back through `restoreSaved` (`saved.ts`): wrong types
  fall back to defaults field by field, ids are checked against patterns,
  unknown watches are capped at 16 per field, arrays and strings are bounded
  (timing 120 per watch, Daily marks 1000, tips 32, engravings 200).
- Unparsable JSON is copied aside to `tick-perfect.unreadable` before it is
  written over (`progressKeepingStorage`, `src/state/app-store.ts`).
- A save from a newer version is read field by field and keeps its version
  and unknown top-level fields.
- Storage that throws (quota, private mode) leaves the game playing from
  memory and shows a warning (`safeStorage`, `storageWorks`).
- Two tabs never wipe each other's progress: each write merges what is
  already stored (`mergeEarned`).
- Backups (Settings → Progress) are validated by the same `restoreSaved` and
  merged, never written over the current state (`mergeSaved`).

**Settings stay local.** They are never synced (`CloudSave` leaves them out),
have defaults (`defaultSettings`) and are validated one by one
(`restoreSettings`). Before this work there was no way to reset them, and no
way to erase progress.

**The trust boundary.** Anything in localStorage, a backup file or the
account's progress blob is the player's to change. That is acceptable: it
only changes what that player sees. Encrypting or signing it in the browser
would not help, since the key would ship in the page. What other players see
(the boards) must not depend on it, and it does not (section 3).

## 3. Data you can trust, and the backend's limits

- **Boards are written only from replayed rounds.** `putOnBoard` is called
  from `submitRound` and from an admin's review, always with the score the
  server's replay produced. The client's claimed score is only compared with
  it. Local bests, unlocks and the progress blob never reach a board, and
  nothing public reads `game.user_progress`.
- **The seed is the server's** for ranked collection rounds
  (`crypto.getRandomValues`). A Daily's seed is public by design (everyone
  plays the same one), so it can be rehearsed; the server only accepts the
  Daily within a day of its own UTC date.
- **What replay cannot stop** is a scripted player on a fair seed. Only a
  spread under 3 ms over 20 hits is held for review. This is a known limit,
  not a bug; a stronger bot check is backlog (P3), not something to build on
  a free tier now.
- **Free-tier care is already in the code:** one function for the whole API,
  one database connection per instance, payload caps on every body, rate
  limits on starting and submitting rounds and on reports, and housekeeping
  that clears old rounds, rate windows and error reports.

## 4. Proven issues

| #   | Issue                                                                                                       | Where                                                                      | Effect                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A submitted round's final update has no `status = 'issued'` guard                                           | `submitRound`, `server/routes/rounds.ts`                                   | Two submits of one round sent at once can both be replayed and stored (the board keeps the higher, so the harm is small)                                                                             |
| 2   | A Daily number or reserve day in the future is accepted on restore, and the later Daily always wins a merge | `restoreDaily`, `restoreReserve` in `saved.ts`; `mergeDaily` in `daily.ts` | A device with its clock ahead, or a crafted backup, stops every Daily round from counting (`recordDailyRound` ignores rounds older than the saved one) until that date comes, on every synced device |
| 3   | Merging progress does not re-apply earned unlocks                                                           | `mergeEarned`, `app-store.ts`                                              | A watch earned by the two sides together (one's best, the other's points) stays locked until the next round                                                                                          |
| 4   | Engravings are capped before they are checked, in stored order                                              | `restoreEngravings`, `engravings.ts`                                       | 200 junk keys from a file or blob push real engravings out on the next load                                                                                                                          |
| 5   | An oversized backup is reported as "not a backup"                                                           | `restore` in `settings-dialog.tsx`                                         | A misleading message                                                                                                                                                                                 |
| 6   | No way to reset settings or erase progress                                                                  | `settings-dialog.tsx`                                                      | A shared or handed-down device keeps the last player's progress                                                                                                                                      |
| 7   | The migration path (`version` below 1) has no test                                                          | `migrate` in `app-store.ts`                                                | A regression there would go unnoticed                                                                                                                                                                |
| 8   | An end-to-end test assumed the Daily's watch was open                                                       | `e2e/states.spec.ts` (already fixed in `7d85367`: pinned to a Diver day)   | It failed four days in five                                                                                                                                                                          |

**Risks, not proven bugs.**

- Signing out leaves local progress in place, and signing in merges it into
  whichever account signs in next (`refresh` in `src/online/online.ts`). On a
  shared device, progress can move between accounts.
- Sync is throttled to once a minute and the throttle starts before the
  request, so the last change of a session may wait for the next visit
  (`syncProgress`, `online.ts`).
- A failed ranked submit is not retried; the round is lost to the board.
- Timing records and points merge by taking the larger side, so play on two
  devices does not add up (`mergeTiming`, `mergeProgress`). This is a
  deliberate trade: the save holds totals, not rounds.
- New players could play about one Daily in eight once the rotation grows
  to eight watches on 26 October (#26), because the Daily's watch had to
  be unlocked, and their reserve ran down in between. Resolved: the Daily
  is now open on any watch and counts towards the Daily alone.

## 5. Ideas, weighed

| Idea                                                                                                                     | Value  | Effort | Backend  | Notes                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Round history: a short record of each round, kept locally                                                                | High   | M      | None     | Unlocks everything in "personal progress" below; about 6 KB for 100 rounds                                                                                   |
| Personal progress in the timegrapher: last 10, 25 and 100 rounds, Perfect share, rate and spread, best and average score | High   | M      | None     | Built on round history; every figure defined in the dialog                                                                                                   |
| Daily archive: recent days played, their bests, and the run of days                                                      | High   | S      | None     | A bounded map of Daily number to best                                                                                                                        |
| Reset settings / erase progress                                                                                          | Medium | S      | None     | Erase only when signed out, so an account can't be emptied by accident                                                                                       |
| Open Dailies for new players (play a locked Daily's watch for the Daily only)                                            | High   | S      | None     | A game rule, so the owner decided: shipped                                                                                                                   |
| Ghost replay of the best round                                                                                           | High   | L      | None     | The engine is deterministic: keep the best round's seed and tap times (at most 2000 numbers), replay its hand as a ghost. Needs a renderer for a second hand |
| Practice lab: slower hand, wider window, continue after a miss                                                           | Medium | M      | None     | A new `RoundMode` that saves nothing and never earns anything; keeps boards and progress clean                                                               |
| Result card image                                                                                                        | Medium | M      | None     | Draw on a canvas in the browser, share as a file where `navigator.canShare` allows                                                                           |
| Atelier: complication explainers, mastery goals per watch                                                                | Medium | L      | None     | Content work more than code                                                                                                                                  |
| Retry a failed ranked submit                                                                                             | Low    | S      | Existing | Keep the last log in memory, retry once                                                                                                                      |
| Stronger bot detection                                                                                                   | Low    | L      | Existing | Only worth it if boards are abused                                                                                                                           |
| Cloud history, community features                                                                                        | Low    | XL     | New      | Out of scope for a free tier                                                                                                                                 |

## 6. Test gaps

- Migration from a version below 1 (issue 7).
- A Daily from the future, through restore and merge (issue 2).
- Unlocks earned by a merge (issue 3).
- Engravings over the cap (issue 4).
- Two concurrent submits of one round (issue 1).
- A backup over the size limit (issue 5).
- Server: a banned player starting a round, the submit rate limit, a season
  ending mid-round, an oversized submit body. None of these are tested
  through the route today.
- Coverage is enforced on `src/game` only. `src/state` and `server` are well
  tested but have no threshold.

## 7. Roadmap

| Priority | Work                                                                  | Effort | Status  |
| -------- | --------------------------------------------------------------------- | ------ | ------- |
| P0       | Guard a round's submit so it lands once (issue 1)                     | XS     | Done    |
| P0       | Keep a future Daily or reserve day out of restore and merge (issue 2) | S      | Done    |
| P1       | Re-apply earned unlocks after a merge (issue 3)                       | XS     | Done    |
| P1       | Check engravings before capping, known ones first (issue 4)           | XS     | Done    |
| P1       | Say when a backup is too large (issue 5)                              | XS     | Done    |
| P1       | Reset settings and erase progress (issue 6)                           | S      | Done    |
| P1       | Test the migration path (issue 7)                                     | XS     | Done    |
| P1       | Round history and personal progress in the timegrapher                | M      | Done    |
| P2       | Daily archive: recent days, bests and run of days                     | S      | Done    |
| P2       | Open Dailies for new players                                          | S      | Done    |
| P2       | Ghost replay                                                          | L      | Dropped |
| P2       | Practice lab                                                          | M      | Done    |
| P2       | Atelier                                                               | M      | Done    |
| P2       | Result card image                                                     | M      | Dropped |
| P2       | Sign-out asks whether to keep this device's progress                  | S      | Backlog |
| P3       | Retry a failed ranked submit, sync on leaving the page                | S      | Backlog |
| P3       | Stronger bot checks, community features                               | L–XL   | Backlog |

### What landed in this pass

- `server/routes/rounds.ts`: every write to a submitted round requires it
  to still be `issued`; a second submit that loses the race gets 409. Test:
  "takes a round in once, even when another submit lands meanwhile" (it
  failed before the fix).
- `src/state/saved.ts`: `restoreSaved(saved, defaults, today)` drops a Daily
  or a wind more than `DAYS_AHEAD` (2) days past today; the store passes
  today in on every read, merge and write.
- `src/state/app-store.ts`: merges re-apply earned unlocks; new actions
  `resetSettings`, `eraseProgress` (clears storage first, so it is not
  merged back) and `recordLine`.
- `src/state/engravings.ts`: known engravings first, then the cap.
- `src/state/history.ts` (new): a line per round, 100 per watch, merged
  across tabs, validated on load, summed up by `summarize`.
- `src/state/daily-archive.ts` (new): each Daily's best for 60 days, part of
  what syncs and backs up; `runOfDays` for the run of days played.
- `src/screens/settings-dialog.tsx`: Start over (reset settings, erase
  progress with a confirmation; erase waits while signed in); a backup over
  the size limit says so.
- `src/screens/title-screen.tsx`: the Daily plays on its watch even
  before the collection opens it (a challenge still waits); the round
  counts towards the Daily alone.
- `src/game/state.ts`, `src/game/practice.ts`: practice sets. `update`
  takes optional `PracticeOptions`: a miss becomes a `slip` event and the
  hand moves on to a new target; after `targets` of them a `complete`
  event ends the round with no miss. Rounds without it play exactly as
  before (the golden masters are unchanged). `practiceRules` eases a
  watch's rules for the slow pace.
- `src/state/atelier.ts`, `src/screens/atelier-dialog.tsx`: the atelier.
  Mastery per watch (certificates, colourways, the two round engravings)
  and the collection's tallies are derived from the save; nothing new is
  kept. Locked watches are left out.
- The result card was built and then dropped, with Share itself, at the
  owner's call: the results end on Retry and Main menu.
- Ghosts were built and then dropped at the owner's call: a see-through
  second hand, then a ring at the dial's edge, each drew the eye from the
  player's own hand, and without either a race against a score alone added
  little.
- `src/screens/practice-dialog.tsx`, `game-hud.tsx`, `title-screen.tsx`:
  the Practice button, the set's count and each target's timing in the
  HUD, and the summary with the next set's pace.
- `src/screens/timegrapher-dialog.tsx`: Latest rounds (10, 25, 100, with
  the change on as many before, and a note on how each figure is worked
  out) and the last fortnight of Dailies.

## 8. Acceptance and how to check

Each change ships with tests, and these pass:

```bash
npm run check
```

```bash
npm run test:e2e
```

- A save from version 0, a corrupt save, a future Daily and a junk-filled
  backup all load without losing what was valid.
- Erasing progress leaves settings alone, and resetting settings leaves
  progress alone.
- Round history stays within its cap, and every figure the timegrapher shows
  is defined next to it.
- The game still plays offline, signed out, and with the API answering 503.

## 9. Cost and maintenance

Nothing here adds a service, a dependency or a server. Round history and the
Daily archive live in the existing save and are read through the same
`restoreSaved` checks. The history stays on the device (at most 100 short
lines a watch, about 3–4 kB each); the archive (60 numbers) joins the
progress blob a signed-in player already syncs, well inside its 64 KB cap. The one
server change is a stricter `where` clause. The online side stays optional:
the game, its progress and its statistics work with no backend at all.
