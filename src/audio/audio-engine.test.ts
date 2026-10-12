import { describe, expect, it, vi } from 'vitest';

import { createAudioEngine } from './audio-engine';
import { DESIGNS } from './sounds';

interface Played {
  readonly buffer: { readonly samples: Float32Array };
  readonly rate: number;
  readonly gain: number;
  readonly at: number;
}

/** A running context that records every buffer it is asked to play. */
function fakeContext() {
  const played: Played[] = [];
  const buffers: { samples: Float32Array }[] = [];
  const node = () => ({ connect: () => undefined });
  const context = {
    state: 'running',
    sampleRate: 8000,
    currentTime: 0,
    destination: {},
    resume: () => Promise.resolve(),
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: { value: 0 },
      ratio: { value: 0 },
    }),
    createBuffer: () => {
      const buffer = {
        samples: new Float32Array() as Float32Array,
        copyToChannel(samples: Float32Array) {
          buffer.samples = samples;
        },
      };
      buffers.push(buffer);
      return buffer;
    },
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createBufferSource() {
      const source = {
        ...node(),
        buffer: null as Played['buffer'] | null,
        playbackRate: { value: 1 },
        output: null as { gain: { value: number } } | null,
        connect(gain: { gain: { value: number } }) {
          source.output = gain;
        },
        start(at: number) {
          played.push({
            buffer: source.buffer ?? { samples: new Float32Array() },
            rate: source.playbackRate.value,
            gain: source.output?.gain.value ?? 1,
            at,
          });
        },
      };
      return source;
    },
  };
  return { context, played, buffers };
}

/** An engine over a fake context, rendering at once rather than later. */
function unlocked(random: () => number = Math.random) {
  const fake = fakeContext();
  const engine = createAudioEngine(
    () => fake.context as unknown as AudioContext,
    random,
    () => undefined
  );
  engine.unlock();
  return { engine, ...fake };
}

describe('createAudioEngine', () => {
  it('creates nothing until unlocked', () => {
    const createContext = vi.fn();
    const engine = createAudioEngine(createContext);
    engine.play('hit');
    expect(createContext).not.toHaveBeenCalled();
  });

  it('stays silent, never throwing, without Web Audio', () => {
    const engine = createAudioEngine(() => {
      throw new ReferenceError('AudioContext is not defined');
    });
    expect(() => {
      engine.unlock();
      engine.unlock();
      engine.play('perfect');
    }).not.toThrow();
  });

  it('creates no context while sound is off', () => {
    const createContext = vi.fn();
    const engine = createAudioEngine(createContext);
    engine.setEnabled(false);
    engine.unlock();
    expect(createContext).not.toHaveBeenCalled();
  });

  it('renders every voice in the idle moments after the unlock', () => {
    const fake = fakeContext();
    const tasks: (() => void)[] = [];
    createAudioEngine(
      () => fake.context as unknown as AudioContext,
      Math.random,
      task => tasks.push(task)
    ).unlock();
    expect(fake.buffers).toHaveLength(0);
    while (tasks.length > 0) tasks.shift()?.();
    const takes = Object.values(DESIGNS).reduce(
      (sum, design) => sum + design.takes,
      0
    );
    expect(fake.buffers).toHaveLength(takes);
  });

  it('renders a voice once and reuses its takes', () => {
    const { engine, buffers } = unlocked();
    engine.play('hit');
    engine.play('hit');
    engine.play('hit');
    expect(buffers).toHaveLength(DESIGNS.hit.takes);
  });

  it('never plays the same take twice in a row', () => {
    const { engine, played } = unlocked(() => 0);
    for (let index = 0; index < 6; index++) engine.play('hit');
    played.slice(1).forEach((sound, index) => {
      expect(sound.buffer).not.toBe(played[index]?.buffer);
    });
  });

  it('alternates tick and tock', () => {
    const { engine, played, buffers } = unlocked();
    for (let index = 0; index < 4; index++) engine.beat('diver');
    // The tick's takes are rendered first, the tock's after them.
    const ticks = buffers.slice(0, DESIGNS['tick:diver'].takes);
    const tocks = buffers.slice(DESIGNS['tick:diver'].takes);
    expect(tocks).toHaveLength(DESIGNS['tock:diver'].takes);
    played.forEach((sound, index) => {
      expect(index % 2 === 0 ? ticks : tocks).toContain(sound.buffer);
    });
  });

  it("beats each watch in its own movement's voice", () => {
    const { engine, played, buffers } = unlocked();
    engine.beat('diver');
    engine.beat('diver');
    engine.beat('grandComplication');
    engine.beat('grandComplication');
    // Each voice's takes are rendered as it is first wanted, in this order.
    const voices = [
      'tick:diver',
      'tock:diver',
      'tick:grandComplication',
      'tock:grandComplication',
    ] as const;
    let from = 0;
    voices.forEach((voice, index) => {
      const bank = buffers.slice(from, from + DESIGNS[voice].takes);
      from += DESIGNS[voice].takes;
      expect(bank).toContain(played[index]?.buffer);
    });
    expect(buffers).toHaveLength(from);
  });

  it('detunes and levels each play within its design', () => {
    for (const random of [() => 0, () => 0.999_999]) {
      const { engine, played } = unlocked(random);
      engine.play('hit');
      const [sound] = played;
      const { cents, db } = DESIGNS.hit.play;
      expect(Math.abs(1200 * Math.log2(sound?.rate ?? 1))).toBeCloseTo(
        cents,
        3
      );
      expect(Math.abs(20 * Math.log10(sound?.gain ?? 1))).toBeCloseTo(db, 3);
    }
  });

  it('plays ticks quieter as they come faster', () => {
    const { engine, context, played } = unlocked(() => 0.5);
    for (const at of [0, 0.3, 0.6, 0.65, 0.7]) {
      context.currentTime = at;
      engine.beat('diver');
    }
    const gains = played.map(sound => sound.gain);
    expect(gains[1]).toBeCloseTo(1, 6);
    expect(gains[4]).toBeLessThan(0.5);
  });
});
