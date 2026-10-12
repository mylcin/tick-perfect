# Vision

Tick Perfect should be a game people come back to because they want to, not
because they are made to. Players return out of curiosity (what does the
next watch do?) and for mastery (can I be more precise?), never because of
pressure. Every system below draws on real watchmaking, so the game stays
one coherent object instead of a mobile game wearing a watch skin.

The loops run on four time scales, from a single round to months of play.

## 1. One session: "one more time"

The core loop already works: a round lasts 30–60 seconds, Retry is instant
and the best score is always visible. One thing pulls players back harder
than anything else, and that is how close the miss was.

- **Near-miss line.** The results say how far off the tap was and how far
  the player is from their next goal. The engine measures the offset of
  every tap, so the results only have to show it.

_Delivered in Phase 5._ The results give the miss in milliseconds ("27 ms
too early") and the nearest goal: the next unlock, certificate or best
("3 points to unlock the GMT", "5 points to your best").

## 2. Mastery: certification

A score says how long a player lasted. Precision says how well they played.
Watchmakers measure a movement on a _timegrapher_; Tick Perfect measures the
player the same way.

- **Certificates per watch.** There are three tiers, named after real
  chronometer testing:
  - **Adjusted:** 15 points, the score on a watch that, with a level,
    unlocks the next one.
  - **Chronometer:** 40 points.
  - **Observatory:** 75 points. The name comes from the observatory
    precision trials of the past.

  A certificate is printed on that watch's dial, so the watch itself shows
  how far the player has taken it.

- **Timegrapher.** Every hit records its timing error in milliseconds. The
  statistics screen draws these errors as a timegrapher trace: the average
  error (does the player tap early or late?) and the spread (how consistent
  are they?). This gives players a goal beyond the score: become steadier.

  _Delivered in Phase 6b._ Every hit of a finished round counts, in every
  mode, since timing measures skill rather than score; the title's demo
  never does. Each watch keeps running sums (for the rate and spread) and
  its latest 120 errors (for the trace). The trace has a zero line but no
  Perfect band: the Perfect zone narrows as a round speeds up, so no
  single band in milliseconds would be true.

## 3. Collection: the watch box

- **Five watches, each a new rule.** Diver (the bezel turns), Chronograph
  (start and stop taps), GMT (a second hand that blocks the target), Moonphase
  (the target hides) and Tourbillon (the whole watch rocks on the wrist while
  the timing stays the same). Each is drawn after an icon of its kind. Every
  collection round's score adds to the player's points, which reach a
  **watchmaker's level**; scoring 15 on a watch and reaching the next level
  unlocks the next watch, so the collection opens with time at the bench,
  never with one lucky run. A finished collection unlocks **Endless**,
  played on a Grand Complication that mixes every rule.
- **The second series.** After Endless come tool watches, each a new rule
  and each unlocked from the one before it by a score of 15 and the next
  level (7, 8 and 9): the Field (the seconds hand hacks: it stops dead short
  of the marker, then runs on), the Pilot (cloud drifts over the dial
  ahead of the marker, the hand flying on through it) and the Digital (its
  display counts down 3, 2, 1 with a beep to the marker, for fun). Endless keeps to the first series' rules,
  so its season and board never change under it.
- **Variants.** Certificates and milestones unlock cosmetic variants: dial
  colours, bezels and straps. A watch is data (a `WatchSpec`), so a variant
  is a few lines of configuration and never new geometry.
- **No purchases.** Everything is earned by playing.

_Delivered in Phase 6b._ Each watch has two variants besides its standard
look, earned by its Chronometer and Observatory certificates and picked on
the title. Each is a colourway that really exists on watches of its kind,
and only colours (and a dial's finish) change: a test holds every variant
to its watch's geometry and rules, and to the same contrast checks. A pick
that is not earned yet shows the standard, and is kept.

## 4. A daily habit: Daily and power reserve

- **Daily.** Every player gets the same target sequence each day, from a
  deterministic seed. The share text adds a compact trace of the run (one
  mark per hit, Perfect or plain), like the squares of a word game, without
  revealing the targets.
- **Power reserve.** This replaces the usual "streak". Each Daily played
  winds the watch by one day, up to seven. Missing a day does not reset
  anything; the reserve only runs down a little, the way a mechanical watch
  does. It rewards coming back and never punishes a day off.
- **Challenge link.** The target sequence comes from the seed, so "beat this
  run" is just a link carrying the seed. A friend who opens it plays the
  same sequence. No server is needed.

_Delivered in Phase 6._ A Daily day is the player's local date, numbered
from #1 on 1 October 2026, and its seed is a fixed hash of that number. The
five watches of the first series take turns as the Daily's watch, and from
#26 (26 October 2026) the second series' three with them; like any round,
it can only be played once the collection has unlocked that watch, and a
challenge on a locked watch waits the same way. A Daily can be replayed
all day; the best round is the
one shared, and the day's first round winds the reserve. Daily and
challenge rounds never count towards bests, certificates or unlocks, since
a fixed sequence can be learnt.

## 5. After launch

New content arrives without new systems. A new watch is a spec plus a rule
module:

- **Worldtimer:** the target jumps between time zones.
- **Perpetual calendar:** the target is the date aperture.
- **Minute repeater:** a chime announces the target. It is playable without
  sight, so it doubles as an accessibility mode.
- **Skeleton:** no dial, only the movement.

Endless can get a weekly modifier, as an event on its own board.

An online side was added before launch: leaderboards per watch season and
per Daily, sign-in only to post scores, and rules an admin can tune without a
deploy (see docs/BACKEND.md). Accounts stay optional, and the game stays
fully playable offline.

## What we will not do

- No ads, energy systems, loot boxes, purchases or required accounts.
- No push notifications and no streaks that wipe progress after one missed
  day.
- Rounds stay 30–60 seconds, and the game stays fully playable offline.
- Progress lives on the player's device and can never be lost to another tab
  or an update.

## Roadmap

| Phase            | From the brief                                     | Continuity additions                                            |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| 5 · Collection ✓ | Chronograph, GMT, Moonphase, Tourbillon, unlocking | Endless on the Grand Complication, certificates, near-miss line |
| 6 · Daily ✓      | Daily seed, deterministic sequence, share card     | Power reserve, share trace, challenge link                      |
| 6b · Mastery ✓   | –                                                  | Timegrapher statistics, cosmetic variants                       |
| 7 · Polish ✓     | Accessibility, performance, docs                   | –                                                               |
| 8 · Online ✓     | –                                                  | Leaderboards, sign-in, server-checked scores, admin panel       |
| Launch           | Vercel deployment                                  | Portfolio card and the console `play` command                   |
| After launch     | –                                                  | New watches, weekly Endless modifier                            |

✓ marks the phases already in the game.

The public release waited until Phase 7 was complete, so that players meet a
finished game, not an alpha.
