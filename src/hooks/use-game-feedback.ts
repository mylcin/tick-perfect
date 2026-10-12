import { useEffect, useRef } from 'react';

import { audio } from '../audio';
import {
  countdownAt,
  isBlockedAt,
  targetVisibilityAt,
  type Segment,
} from '../game';
import { cueFor } from '../feedback/cues';
import { vibrate } from '../feedback/haptics';
import { tickIndex } from '../feedback/ticks';
import type { Dictionary } from '../i18n';
import { passesMilestone, type Standing } from '../screens/milestones';
import { appStore } from '../state/app';
import type { GameController } from '../state/game-controller';
import { announce } from '../utils/announcer';
import type { WatchId } from '../watches/ids';

/**
 * Answers the game with sound, vibration and screen reader announcements.
 * Returns the per-frame callback that plays the escapement's ticks.
 */
export function useGameFeedback(
  controller: GameController,
  /** Whose movement the ticks are heard in. */
  watch: WatchId,
  t: Dictionary,
  /** Read after the round starts while the watch is still new. */
  rule: string | null,
  /** The score in the corner: passing it (or a certificate) is heard. */
  standing: Standing
): (now: number) => void {
  const { kind, score } = standing;
  useEffect(
    () =>
      controller.subscribe(events => {
        const cue = cueFor(events, passesMilestone(events, { kind, score }));
        if (cue) {
          audio.play(cue.sound);
          cue.accents?.forEach(accent => {
            audio.play(accent);
          });
          if (
            cue.vibration !== null &&
            appStore.getState().settings.vibration
          ) {
            vibrate(cue.vibration);
          }
        }
        for (const event of events) {
          if (event.type === 'started') {
            announce(
              rule
                ? `${t.announce.started} ${t.announce.rule(rule)}`
                : t.announce.started
            );
          }
          if (event.type === 'paused') announce(t.announce.paused);
          if (event.type === 'resumed') announce(t.announce.resumed);
          if (event.type === 'multiplier') {
            announce(
              event.factor > 1
                ? t.announce.multiplierOn(event.factor)
                : t.announce.multiplierOff
            );
          }
        }
      }),
    [controller, t, rule, kind, score]
  );

  const ticks = useRef<{
    segment: Segment | null;
    index: number;
    covered: boolean;
    fading: boolean;
    /** A Digital's countdown last frame: the beats to go, or none. */
    count: number | null;
  }>({ segment: null, index: 0, covered: false, fading: false, count: null });
  /** The sweep `covered` was last measured on. */
  const coveredOn = useRef<Segment | null>(null);

  return (now: number) => {
    const { state } = controller.snapshot();
    const current = ticks.current;
    if (state.phase !== 'playing') {
      current.segment = null;
      return;
    }
    const { segment } = state.round;
    if (segment !== current.segment) {
      // After a hit, a mark crossed since the hit still ticks. Starting or
      // resuming counts from where the hand is now, so nothing ticks at once.
      current.index = tickIndex(
        segment,
        current.segment === null ? now : segment.startTime
      );
      current.segment = segment;
    }
    const index = tickIndex(segment, now);
    if (index !== current.index) {
      current.index = index;
      audio.beat(watch);
    }

    // The twists heard as well as seen: the GMT hand landing on the
    // target and leaving it, and a Moonphase target starting to fade. Only
    // a change within one sweep is heard: one that starts under the GMT
    // hand would land on the hit sound and say nothing.
    const covered = isBlockedAt(segment, now);
    if (coveredOn.current === segment && covered !== current.covered) {
      audio.play(covered ? 'cover' : 'uncover');
    }
    coveredOn.current = segment;
    current.covered = covered;
    const fading = targetVisibilityAt(segment, now) < 1;
    if (fading && !current.fading) audio.play('fade');
    current.fading = fading;
    // A Digital's countdown beeps on every beat, longer on zero.
    const count = countdownAt(segment, now)?.count ?? null;
    if (count !== null && count !== current.count) {
      audio.play(count === 0 ? 'beepZero' : 'beep');
    }
    current.count = count;
  };
}
