// A small seedable PRNG (mulberry32) written as pure functions: the generator
// state is a single unsigned 32-bit integer that lives inside the game state,
// so every run can be replayed from its seed. Daily runs depend on this
// sequence staying identical across releases; the tests pin known outputs.

/** Generator state: an unsigned 32-bit integer. */
export type RngState = number;

const UINT32_RANGE = 2 ** 32;
const MULBERRY_INCREMENT = 0x6d2b79f5;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Turns any integer seed into a generator state. */
export function createRng(seed: number): RngState {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`Seed must be an integer, got ${String(seed)}`);
  }
  return seed >>> 0;
}

/** MurmurHash3's finaliser: spreads small input changes over all 32 bits. */
function mix32(value: number): number {
  let hash = value;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Hashes text (e.g. a date) into a 32-bit seed: FNV-1a plus a final mix. */
export function seedFromString(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return mix32(hash);
}

/** A float in [0, 1) and the state to use for the next draw. */
export function nextFloat(state: RngState): readonly [number, RngState] {
  const next = (state + MULBERRY_INCREMENT) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return [((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE, next];
}

/** An integer in [min, max], both inclusive. */
export function nextInt(
  state: RngState,
  min: number,
  max: number
): readonly [number, RngState] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(
      `Expected integers with min <= max, got ${String(min)}..${String(max)}`
    );
  }
  const [roll, next] = nextFloat(state);
  return [min + Math.floor(roll * (max - min + 1)), next];
}

/** `true` with the given probability; values outside [0, 1] act as 0 or 1. */
export function nextChance(
  state: RngState,
  probability: number
): readonly [boolean, RngState] {
  const [roll, next] = nextFloat(state);
  return [roll < probability, next];
}

/** Spreads consecutive target numbers apart before they are mixed in. */
const GOLDEN_GAMMA = 0x9e3779b9;

/**
 * `count` floats in [0, 1) for one target of a round, from a stream of their
 * own. Rule twists draw from here instead of the round's generator, so the
 * round's own sequence never changes and a target's twist depends only on
 * the round's seed and the target's number, never on how earlier ones were
 * played.
 */
export function targetRolls(
  seed: number,
  target: number,
  count: number
): readonly number[] {
  if (!Number.isInteger(target) || target < 0) {
    throw new RangeError(
      `A target number is an integer ≥ 0, got ${String(target)}`
    );
  }
  let state = mix32(
    createRng(seed) ^ mix32(Math.imul(target + 1, GOLDEN_GAMMA))
  );
  const rolls: number[] = [];
  for (let draw = 0; draw < count; draw++) {
    const [roll, next] = nextFloat(state);
    rolls.push(roll);
    state = next;
  }
  return rolls;
}
