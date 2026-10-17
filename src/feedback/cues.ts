import type { SoundName } from '../audio';
import type { GameEvent } from '../game';
import type { VibrationPattern } from './haptics';

// Which sound and vibration answer each moment of play. Perfect feedback is
// stronger than a plain hit, and the multiplier switching on stronger still.

interface Cue {
  readonly sound: SoundName;
  /** Sounds layered on the first: a pusher under a hit, the multiplier going. */
  readonly accents?: readonly SoundName[];
  readonly vibration: VibrationPattern | null;
}

export const VIBRATIONS = {
  hit: 12,
  perfect: [24, 40, 24],
  multiplier: [18, 30, 18, 30, 40],
  /** Passing the best mid-round: a nudge, so the round plays on. */
  pass: 10,
  miss: [60, 40, 90],
  unlock: [20, 40, 20, 40, 60],
} as const satisfies Record<string, VibrationPattern>;

/** The pause before passing a milestone's nudge, after the hit's buzz. */
const PASS_PAUSE_MS = 60;

/**
 * The cue for one transition's events, or `null` if it makes no sound.
 * `passed`: its hit passed a milestone (the best, a certificate), which
 * adds a quiet note and, after the hit's buzz, a nudge.
 */
export function cueFor(
  events: readonly GameEvent[],
  passed = false
): Cue | null {
  const multiplier = events.find(event => event.type === 'multiplier');
  const multiplierOn = multiplier !== undefined && multiplier.factor > 1;
  for (const event of events) {
    if (event.type === 'miss') {
      return { sound: 'miss', vibration: VIBRATIONS.miss };
    }
    // A practice miss plays on: the soft sound of a streak let go.
    if (event.type === 'slip') {
      return { sound: 'release', vibration: VIBRATIONS.hit };
    }
    if (event.type === 'hit') {
      const accents: SoundName[] = [];
      // Both ends of a chronograph pair press a pusher too, as a real
      // stopwatch clicks to start and again to stop.
      if (event.leg !== 'single') accents.push('pusher');
      // A plain hit after a streak lets the multiplier go, softly.
      if (multiplier && !multiplierOn) accents.push('release');
      if (passed) accents.push('pass');
      const sound = multiplierOn
        ? 'multiplier'
        : event.quality === 'perfect'
          ? 'perfect'
          : 'hit';
      return {
        sound,
        ...(accents.length > 0 && { accents }),
        // One pattern: a second call would cut the first one short.
        vibration: passed
          ? [VIBRATIONS[sound], PASS_PAUSE_MS, VIBRATIONS.pass].flat()
          : VIBRATIONS[sound],
      };
    }
  }
  return null;
}
