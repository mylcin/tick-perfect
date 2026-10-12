import type { WatchId } from '../watches/ids';
import {
  DESIGNS,
  renderTakes,
  type Beat,
  type BeatVoice,
  type SoundName,
  type VoiceName,
} from './sounds';

interface AudioEngine {
  /**
   * Creates or wakes the audio context. Browsers only allow that from a user
   * gesture, so call it from the tap or click that starts a round.
   */
  unlock(): void;
  /** Plays a sound now; silently does nothing until unlocked or when off. */
  play(sound: SoundName): void;
  /**
   * Plays the watch's next beat, tick then tock, in its own movement's
   * voice and softer the sooner it follows the last.
   */
  beat(watch: WatchId): void;
  setEnabled(enabled: boolean): void;
}

/** Each take peaks where its design says; the compressor only reins in overlaps. */
const MASTER_VOLUME = 1;
/** Schedules just ahead of the clock so a sound never starts in the past. */
const LOOKAHEAD_SECONDS = 0.004;
/**
 * Ticks this far apart play at full level; closer, as the hand speeds up,
 * they grow quieter, so a fast round never becomes a drill.
 */
const RELAXED_TICK_SECONDS = 0.25;

interface Output {
  readonly context: AudioContext;
  readonly master: AudioNode;
}

function connect(context: AudioContext): Output {
  // A gentle compressor keeps overlapping sounds (a tick under a Perfect)
  // from clipping.
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.ratio.value = 4;
  compressor.connect(context.destination);
  const master = context.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(compressor);
  return { context, master };
}

function defaultContext(): AudioContext {
  return new AudioContext({ latencyHint: 'interactive' });
}

/** A take of each voice, rendered once, and the one played last. */
interface Bank {
  readonly takes: readonly AudioBuffer[];
  last: number;
}

/**
 * Game audio over Web Audio. Nothing is created until the first unlock, and
 * every failure (no Web Audio, a blocked context) leaves the game silent
 * rather than broken. Every voice's takes are rendered once, in the idle
 * moments after the unlock (or at once if a sound is wanted sooner).
 */
export function createAudioEngine(
  createContext: () => AudioContext = defaultContext,
  random: () => number = Math.random,
  /** Runs `task` when the page has a moment: rendering is spread out. */
  later: (task: () => void) => void = task => setTimeout(task, 0)
): AudioEngine {
  let output: Output | null = null;
  let enabled = true;
  let failed = false;
  const banks = new Map<VoiceName, Bank>();
  let nextBeat: Beat = 'tick';
  let lastTick = Number.NEGATIVE_INFINITY;

  const bankOf = (context: AudioContext, voice: VoiceName): Bank => {
    let bank = banks.get(voice);
    if (!bank) {
      const takes = renderTakes(voice, context.sampleRate).map(samples => {
        const buffer = context.createBuffer(
          1,
          samples.length,
          context.sampleRate
        );
        buffer.copyToChannel(samples, 0);
        return buffer;
      });
      bank = { takes, last: -1 };
      banks.set(voice, bank);
    }
    return bank;
  };

  /** Any take but the last one, so no sample is heard twice in a row. */
  const pick = (bank: Bank): AudioBuffer | undefined => {
    const count = bank.takes.length;
    let take = Math.min(Math.floor(random() * count), count - 1);
    if (count > 1 && take === bank.last) take = (take + 1) % count;
    bank.last = take;
    return bank.takes[take];
  };

  const warm = (context: AudioContext) => {
    // In DESIGNS' order: the beats, wanted soonest, come first.
    const voices = Object.keys(DESIGNS) as VoiceName[];
    const step = () => {
      const voice = voices.shift();
      if (!voice) return;
      try {
        bankOf(context, voice);
      } catch {
        // Rendered on demand instead, or skipped.
      }
      later(step);
    };
    later(step);
  };

  /** How loud a tick is, given how soon it follows the last one. */
  const tickLevel = (now: number) => {
    const interval = now - lastTick;
    lastTick = now;
    return Math.min(1, Math.sqrt(interval / RELAXED_TICK_SECONDS));
  };

  /** Plays a take of `voice` just ahead of now, at `level` of its own. */
  const schedule = (voice: VoiceName, level: (at: number) => number) => {
    if (!enabled || output?.context.state !== 'running') return;
    const { context, master } = output;
    try {
      const buffer = pick(bankOf(context, voice));
      if (!buffer) return;
      const { play } = DESIGNS[voice];
      const at = context.currentTime + LOOKAHEAD_SECONDS;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value =
        2 ** ((play.cents * (random() * 2 - 1)) / 1200);
      const gain = context.createGain();
      gain.gain.value = 10 ** ((play.db * (random() * 2 - 1)) / 20) * level(at);
      source.connect(gain);
      gain.connect(master);
      source.start(at);
    } catch {
      // A sound that can't be scheduled is skipped, never fatal.
    }
  };

  return {
    unlock() {
      if (!enabled || failed) return;
      try {
        if (!output) {
          output = connect(createContext());
          warm(output.context);
        }
        if (output.context.state !== 'running') {
          output.context.resume().catch(() => {
            // Still blocked; the next gesture tries again.
          });
        }
      } catch {
        failed = true;
      }
    },

    play(sound) {
      schedule(sound, () => 1);
    },

    beat(watch) {
      const voice: BeatVoice = `${nextBeat}:${watch}`;
      nextBeat = nextBeat === 'tick' ? 'tock' : 'tick';
      schedule(voice, tickLevel);
    },

    setEnabled(value) {
      enabled = value;
    },
  };
}
