import { isWatchId, type WatchId } from '../watches/ids';
import { RULES_REVISION } from '../watches/revisions';

// "Beat this run" as a link. A round is its watch and its seed, so a link
// carrying both (and the score to beat) lets a friend play the very same
// targets, with no server in between: `/?c=chronograph.1x2y3z.23.1`. The
// last part is the revision of the watch's rules the round was played by,
// since a seed deals the same targets only under the same rules.

export interface Challenge {
  readonly watch: WatchId;
  readonly seed: number;
  /** The score to beat. */
  readonly score: number;
  /** The revision of the watch's rules it was set on (RULES_REVISION). */
  readonly revision: number;
}

/** The query parameter that carries a challenge. */
const CHALLENGE_PARAM = 'c';

/** A uint32 in base 36, without leading zeros: at most 7 digits. */
const SEED = /^(?:0|[1-9a-z][0-9a-z]{0,6})$/;
/** 0–9999, without leading zeros. */
const SCORE = /^(?:0|[1-9]\d{0,3})$/;
/** 1–999, without leading zeros. */
const REVISION = /^[1-9]\d{0,2}$/;
/** The revision of a link from before links carried one. */
const FIRST_REVISION = 1;

/**
 * The challenge as it sits in a link:
 * `<watch>.<seed in base 36>.<score>[.<revision>]`. The first revision is
 * left out, so a link on unchanged rules still opens on a page from before
 * links carried one.
 */
export function encodeChallenge({
  watch,
  seed,
  score,
  revision,
}: Challenge): string {
  const code = `${watch}.${seed.toString(36)}.${String(score)}`;
  return revision === FIRST_REVISION ? code : `${code}.${String(revision)}`;
}

/**
 * Reads a challenge code back. Anything but a known watch, a uint32 seed,
 * a whole score up to 9999 and a revision, written exactly as
 * `encodeChallenge` writes them, is no challenge. A code without the
 * revision, as links were before they carried one, was set on the first.
 */
export function parseChallenge(code: string | null): Challenge | null {
  const parts = code?.split('.') ?? [];
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [watch, seedText = '', scoreText = '', revisionText] = parts;
  if (
    !isWatchId(watch) ||
    !SEED.test(seedText) ||
    !SCORE.test(scoreText) ||
    (revisionText !== undefined && !REVISION.test(revisionText))
  ) {
    return null;
  }
  const seed = Number.parseInt(seedText, 36);
  if (seed > 0xffffffff) return null;
  return {
    watch,
    seed,
    score: Number(scoreText),
    revision:
      revisionText === undefined ? FIRST_REVISION : Number(revisionText),
  };
}

/**
 * How the rules a challenge was set on compare with the ones its watch is
 * played by here: the same, earlier ones (an old link) or later ones (a
 * newer version's link, on a page that hasn't updated yet). Under other
 * rules the seed deals other targets, so the score to beat was made on a
 * different round.
 */
export function challengeRules(
  { watch, revision }: Challenge,
  current: number = RULES_REVISION[watch]
): 'same' | 'earlier' | 'later' {
  if (revision === current) return 'same';
  return revision < current ? 'earlier' : 'later';
}

/** What a link brought: its challenge, or word that it couldn't be read. */
export interface ChallengeLink {
  readonly challenge?: Challenge | null;
  /** The link had a challenge, cut short or garbled on the way. */
  readonly invalid?: boolean;
}

/**
 * Takes the challenge out of a page's query string: what it carried (if
 * anything usable), whether it carried one that can't be used, and the
 * query string left without it, other parameters kept. `rest` is null when
 * there was no challenge parameter at all.
 */
export function takeChallenge(search: string): {
  challenge: Challenge | null;
  invalid: boolean;
  rest: string | null;
} {
  const params = new URLSearchParams(search);
  if (!params.has(CHALLENGE_PARAM)) {
    return { challenge: null, invalid: false, rest: null };
  }
  const challenge = parseChallenge(params.get(CHALLENGE_PARAM));
  params.delete(CHALLENGE_PARAM);
  const query = params.toString();
  return {
    challenge,
    invalid: challenge === null,
    rest: query ? `?${query}` : '',
  };
}
