# Contributing to Tick Perfect

Thank you for helping. Tick Perfect is a small game with a clear idea of
what it is, so this guide starts with the ground rules, then covers setup,
the layout of the code, the two most common changes (a new watch, a new
translation), tests, commits and pull requests.

## Ground rules

These come from [docs/VISION.md](docs/VISION.md) and are not up for debate
in a pull request:

- No ads, energy systems, loot boxes, purchases or required accounts.
  Everything is earned by playing.
- No push notifications, and no streaks that wipe progress after one missed
  day. The power reserve runs down; it never resets.
- Rounds stay 30–60 seconds, and the game stays fully playable offline.
- Progress lives on the player's device and can never be lost to another tab
  or an update.
- Every system draws on real watchmaking. Watches are drawn after an icon of
  their kind (shapes, proportions, colours), never with a maker's name or
  mark.
- Twists are fair: a tap at the target's centre is always a Perfect, and a
  twist never changes the timing of a target the player can't see coming.

If a change pulls against one of these, open an issue first.

## Setup

You need Node.js 22.13 or newer in the 22.x line; `nvm use` picks it up from
`.nvmrc`.

```bash
git clone https://github.com/mylcin/tick-perfect.git
cd tick-perfect
nvm use
npm install                      # also installs the git hooks (lefthook)
npx playwright install chromium  # once, for the end-to-end tests
npm run dev                      # http://localhost:5173
```

## Project layout

The [development guide](docs/DEVELOPMENT.md#architecture) describes the
folders and the design. The one rule to know before writing code:

**`src/game` is pure.** It never imports React, Three.js, a store or another
layer of the app, and never reads the clock, the DOM or `Math.random()`.
Time, input and seeds are passed in. ESLint enforces this with a local rule,
[`eslint-rules/game-boundary.js`](eslint-rules/game-boundary.js), and the
folder is held to 100% line and branch coverage. Everything else (the
scene, the screens, saving) builds on its snapshots and events.

## Adding a watch

A watch is data plus, at most, one new rule. Work through these in order:

1. **Id.** Add it to `SECOND_SERIES` in
   [`src/watches/ids.ts`](src/watches/ids.ts) (`COLLECTION` holds the first
   series, whose rules Endless mixes), and give it a revision of 1 in
   `RULES_REVISION` ([`src/watches/revisions.ts`](src/watches/revisions.ts)).
   `WATCH_ORDER`, the first series, Endless, then the second, is the unlock
   chain: 15 on one watch and the next level open the next, a watch's level
   being its place in the order. `LEVELS` in `src/state/levels.ts` must
   reach that far.
2. **Dailies.** A Daily's watch never changes once it is out: Daily links,
   Daily boards and the server rely on it. So never edit
   `DAILY_ROTATIONS` in [`src/state/daily.ts`](src/state/daily.ts); append
   a rotation with the new watch instead, starting from a Daily **at least
   3 days after the deploy**. By then every page has updated (a cached one
   updates on its next load), and the server, which takes a Daily a day
   either side of its own, agrees with them. The pinned Dailies in
   `src/state/daily.test.ts` must keep passing.
3. **Rules.** Add `src/game/rules/<watch>.ts` with the watch's `GameRules`
   (difficulty, scoring, timing, ring and twists), on the pattern of the
   others.
4. **Twist** (if the watch brings a new one). Add a module in
   `src/game/twists/` and its type in `src/game/twists/types.ts`. A twist
   plans from rolls keyed by the round's seed and the target's number
   (`src/game/plan.ts`), and **never draws from the round's generator**:
   every target makes exactly two draws, twist or not, so existing seeds keep
   playing the same. Keep its data in degrees of travel relative to the
   target and in durations, never in timestamps, so pausing shifts
   nothing. A twist that changes the motion itself, as the Field's hack
   stops the hand, does so in `src/game/timing.ts`, so every judgement and
   every drawn position follows it. Add its fairness tests
   to `src/game/twists.test.ts`: the centre is always a Perfect, the twist is
   seen before it matters, and every player gets the same twists from a seed
   however they tap.
5. **Spec.** Add `src/watches/<watch>.ts` with its `WatchSpec` (case, bezel,
   dial, hands, lume, strap, complications and rules) and register it in
   `WATCHES` in [`src/watches/index.ts`](src/watches/index.ts). If it needs a
   part the scene can't build yet, add it to `src/three/geometry` and
   `src/three/parts` as data-driven geometry, not as a one-off model.
   `src/watches/watches.test.ts` checks every spec: the target stands out
   from what carries it, the seconds hand clears the dial, every sub-dial,
   aperture and window has a slot of its own, and the lume is brighter at
   night.
6. **Variants.** Add its two colourways to
   [`src/watches/variants.ts`](src/watches/variants.ts): one earned by the
   Chronometer certificate, one by the Observatory. Colours, finishes, what
   the case is made of and the strap, never a shape, and ones that really
   exist on watches of its kind. Name each as a maker's catalogue would: its
   colour, then the finish or material that sets it apart (Green Sunburst,
   Orange Carbon).
7. **Golden master.** Add the watch's rules to
   [`src/game/golden.test.ts`](src/game/golden.test.ts) and pin its hashes.
   The other watches' hashes must not change. A watch's hash changes only
   when its rules are retuned on purpose, and then its revision in
   `RULES_REVISION` goes up by one in the same change: challenge links
   carry the revision they were set on, so a link from the old rules says
   its targets will differ.
8. **Sound.** Give it a movement of its own in `MOVEMENTS`
   ([`src/audio/sounds.ts`](src/audio/sounds.ts)), after the real calibre
   and case it is modelled on.
9. **Strings.** Add its rule line (`rules`), any new twist hint
   (`game.twistHints`) and its variant names (`variants.names`) to both
   [`src/i18n/en.ts`](src/i18n/en.ts) and [`src/i18n/tr.ts`](src/i18n/tr.ts).
   Both dictionaries are typed by `src/i18n/dictionary.ts`, so a missing key
   is a type error.
10. **Thumbnails.** With `npm run dev` running, render the strip's images
    from the real model:

```bash
npm run thumbnails -- http://127.0.0.1:5173 <watch> <watch>-<variant>
```

They land in `public/watches/`. Locked watches use the standard image as
a silhouette, so there is nothing else to draw.

11. **Docs.** Add a line to the changelog. The README leaves the watches
    for players to find, so it needs no new picture.

## Strings and translations

The game ships in English and Turkish. Every string lives in a typed
dictionary in `src/i18n/`; screens never hold text of their own.

- **Names stay English** in every language: Tick Perfect, the watches,
  Endless, Daily, the certificates (Adjusted, Chronometer, Observatory), as
  they are on the dial.
- **Mark English inside other languages.** Text that carries an English name
  is rendered with `lang="en"` (see `src/components/english.tsx`), so screen
  readers pronounce it right and uppercase text keeps "TICK", not "TİCK".
- **Avoid suffixes on English names.** Turkish vowel harmony depends on how a
  name is said, so phrase around it ("Kilidi açıldı: GMT") rather than
  adding a suffix.
- **Turkish uses the informal _sen_ form**, as the existing strings do.
- **Keep lines short.** Check new strings on a 320 px phone in both
  languages (`e2e/layout.spec.ts` covers the tightest screens); if a
  translation runs long, shorten it rather than shrinking the text.

To add a language, add its code to `LANGUAGES` in
[`src/i18n/languages.ts`](src/i18n/languages.ts), a dictionary next to
`en.ts`, and an entry in `DICTIONARIES` in `src/i18n/index.ts`. The browser's
preferred languages pick it on a first visit.

## Accessibility and testability

- Every control works by keyboard and touch, and every moment of play that
  matters is announced to screen readers.
- A button with only an icon gets an `aria-label`. So does anything whose
  meaning is only in its colour or a tooltip.
- Add a `data-testid` only where a test can't reach an element by its role
  and name: status chips, toasts, dialog roots, lists, empty states, fields
  that share a label. Name it `<entity>-<element>[-<action>]` in kebab-case
  (`game-over-dialog`, `daily-best`, `settings-open`). It never changes with
  the text, and never carries a dynamic value; put that in a `data-*`
  attribute of its own.
- "Turn off animations" must stop interface motion; the game's own motion
  plays on, as its rules need it.

## Tests

Run the whole gate before opening a pull request:

```bash
npm run check      # lint, format, types, unit tests + coverage, build, size
npm run test:e2e   # end-to-end, on a desktop and a phone
```

- Game rules get unit tests in `src/game` next to the code, at 100% coverage.
- A bug fix comes with a test that fails without it.
- A change a player can see or hear gets an end-to-end test in `e2e/`; the
  helpers in `e2e/helpers.ts` time presses to the round through the
  read-only `window.__tickPerfect` hook.
- Keep the first paint under its 400 KB gzip budget (`npm run size`); the 3D
  stack belongs in the lazy chunk.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
and commitlint checks every message in the `commit-msg` hook:

```text
feat: add the Worldtimer
fix(three): keep the GMT hand clear of the date window
test(e2e): cover the unlock banner on small phones
docs: explain the challenge link format
```

Use the scopes the history already uses (`game`, `three`, `e2e`) where they
fit. Write the subject in the imperative, lower case, without a full stop,
and use the body to say why. The hooks also format and lint staged files
before a commit, and type-check and run the unit tests before a push.

## Pull requests

- [ ] One change per pull request, on a branch off `main`.
- [ ] `npm run check` and `npm run test:e2e` pass locally, and CI is green.
- [ ] New strings are in both `en.ts` and `tr.ts`, and fit a 320 px phone.
- [ ] Golden-master hashes of existing watches are unchanged, or the
      watch's `RULES_REVISION` is bumped with them; `DAILY_ROTATIONS` is
      only appended to.
- [ ] New controls have accessible names, and work by keyboard and touch.
- [ ] Screenshots or a short clip for visible changes; the Vercel preview
      link helps reviewers try it.
- [ ] `CHANGELOG.md` (under **Unreleased**) is updated when players will
      notice the change.

By contributing, you agree that your work is released under the
[MIT License](LICENSE).
