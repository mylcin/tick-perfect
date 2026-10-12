import type { MissReason } from '../game';
import type { RestoreOutcome } from '../state/backup';
import type { CertificateTier } from '../state/certificates';
import type { EngravingId } from '../state/engravings';
import type { WatchId } from '../watches/ids';
import type { VariantId } from '../watches/variants';

/**
 * The twists a hint can explain while they are on the dial. A GMT gate
 * has one for each side: wait for the hand to leave, or beat it. `turn` is
 * the ring turning under the marker (the Diver's bezel).
 */
export type TwistHint =
  | 'turn'
  | 'chrono'
  | 'gmtWait'
  | 'gmtBeat'
  | 'moon'
  | 'sway'
  | 'hack'
  | 'cloud'
  | 'countdown';

/**
 * Every string the interface shows, by screen. Each language implements the
 * whole interface, so a missing translation is a type error.
 */
export interface Dictionary {
  /** The language's name in itself, for the language picker. */
  readonly languageName: string;
  /** BCP 47 tag for Intl formatting, e.g. lists of watch names. */
  readonly locale: string;

  readonly title: {
    readonly tagline: string;
    readonly play: string;
    readonly loading: string;
    readonly keyHint: string;
    readonly best: (score: number) => string;
    /** In place of a watch's rule until the player has a best anywhere. */
    readonly firstRule: string;
    readonly settings: string;
    /** The button that opens How to play. */
    readonly help: string;
    /** Why the watch can't be drawn: WebGL is off or blocked here. */
    readonly unsupportedWebgl: string;
    /** Why the watch can't be drawn: its code didn't arrive. */
    readonly loadFailed: string;
    /** Why the watch can't be drawn: it stopped, and a reload may help. */
    readonly stopped: string;
    readonly reload: string;
  };

  /** Said where progress shows while the browser keeps none of it. */
  readonly storage: {
    readonly notSaved: string;
  };

  /** On iOS Safari in a tab, once a watch is earned: keep the save safe. */
  readonly homeScreen: {
    readonly hint: string;
    readonly dismiss: string;
  };

  /** How to play: the rules on four cards, opened from the title. */
  readonly help: {
    readonly title: string;
    readonly close: string;
    readonly tapTitle: string;
    readonly tap: string;
    readonly perfectTitle: string;
    /** What a Perfect and a plain hit score. */
    readonly perfect: (perfect: number, good: number) => string;
    readonly streakTitle: string;
    /** One multiplier and the run that earns it: "3 for ×2". */
    readonly tier: (count: number, factor: number) => string;
    /** `tiers`: every multiplier, already listed. */
    readonly streak: (tiers: string) => string;
    /** The last card: the rule of the watch on show. */
    readonly watchTitle: (watch: string) => string;
  };

  /** The title screen's watch picker. */
  readonly collection: {
    /** The picker's accessible name. */
    readonly label: string;
    readonly locked: string;
    /** Endless's name, the same in every language. */
    readonly endless: string;
    /** Leads the steps that unlock a watch. */
    readonly toUnlock: string;
    readonly scoreStep: (watch: string, score: number) => string;
    readonly levelStep: (level: number) => string;
    readonly progress: (best: number, needed: number) => string;
    readonly pointsProgress: (points: number, needed: number) => string;
    /** A step already taken, as a screen reader hears it. */
    readonly stepDone: string;
    readonly best: (score: number) => string;
    readonly noCertificate: string;
  };

  /** The watchmaker's level, which every collection round's score raises. */
  readonly level: {
    readonly name: (level: number) => string;
    /** Points so far towards the next level; `next` null at the top. */
    readonly points: (points: number, next: number | null) => string;
    /** The whole of it, as a screen reader hears it. */
    readonly summary: (
      level: number,
      points: number,
      next: number | null
    ) => string;
    readonly reached: (level: number) => string;
  };

  /** The Daily and its power reserve. "Daily" is English in every language. */
  readonly daily: {
    /** "Daily #2". */
    readonly name: (number: number) => string;
    /** The day's best, beside the Daily's name on the title. */
    readonly best: (score: number) => string;
    /** The title's Daily button as a screen reader hears it, in parts. */
    readonly button: (number: number, watch: string) => string;
    readonly todaysBest: (score: number) => string;
    readonly reserveOf: (days: number, most: number) => string;
    readonly reserve: (days: number) => string;
    /** Under the reserve, when the round just played wound it. */
    readonly wound: string;
    readonly next: (hours: number, minutes: number) => string;
    /** Instead, when the round ran past midnight into the next Daily. */
    readonly ready: (number: number) => string;
    /** Under the Daily's button until the first one is played. */
    readonly intro: string;
    /** In its place, while the day's watch is still locked. */
    readonly locked: (watch: string) => string;
  };

  /** A friend's challenge link: their round, to beat. */
  readonly challenge: {
    readonly title: string;
    /** The title's card: "Challenge · Chronograph · Beat 23". */
    readonly card: (watch: string, score: number) => string;
    readonly beat: (score: number) => string;
    readonly play: string;
    readonly dismiss: string;
    /** In place of the card, when the link's challenge can't be read. */
    readonly invalid: string;
    /** On the card, when the link was set on earlier rules of its watch. */
    readonly earlierRules: string;
    /** On the card, when it was set on later rules (a newer version's). */
    readonly laterRules: string;
    /** On the card, while the challenge's watch is still locked. */
    readonly locked: (watch: string) => string;
  };

  /** One line on what each watch does differently. */
  readonly rules: Readonly<Record<WatchId, string>>;
  /** Certificate names, the same in every language, as on the dial. */
  readonly certificates: Readonly<Record<CertificateTier, string>>;

  /** The caseback's engravings. Their names are English in every language. */
  readonly engravings: {
    readonly names: Readonly<Record<EngravingId, string>>;
    /** What earns each one. */
    readonly rules: Readonly<Record<EngravingId, string>>;
    /** `names`: already listed ("Beat error and Escapement"). */
    readonly engraved: (names: string) => string;
    /** Turns the watch over to its caseback, and back to its dial. */
    readonly show: string;
    readonly hide: string;
    /** What the caseback is for, in a line. */
    readonly intro: string;
    /** The list of them, on the caseback's side of the title. */
    readonly heading: (watch: string) => string;
    readonly onThisWatch: string;
    readonly onEvery: string;
    readonly done: string;
    readonly progress: (now: number, of: number) => string;
  };

  /** A watch's colourways, earned by its certificates. */
  readonly variants: {
    /** The title's picker, by its accessible name. */
    readonly label: string;
    readonly names: Readonly<Record<VariantId, string>>;
    /** What earns one: "Chronometer certificate (40 points)". */
    readonly requirement: (certificate: string, score: number) => string;
    /** On the results; `names` already listed, `count` of them. */
    readonly earned: (names: string, count: number) => string;
  };

  /**
   * Each said once, under the watch and to screen readers, the first time
   * play shows its rule.
   */
  readonly tips: {
    /** What the bright core scores. */
    readonly perfect: (points: number) => string;
    /** The first multiplier: `count` Perfects in a row for ×`factor`. */
    readonly streak: (count: number, factor: number) => string;
    readonly multiplier: (factor: number) => string;
    readonly streakBroken: string;
  };

  readonly game: {
    /** Shown while a twist is on the dial, until the watch is Adjusted. */
    readonly twistHints: Readonly<Record<TwistHint, string>>;
    readonly heading: (watch: string) => string;
    readonly surface: string;
    /** The first sweep's hint: for touch screens, and for a keyboard too. */
    readonly hint: { readonly touch: string; readonly keys: string };
    readonly ready: string;
    readonly pause: string;
    readonly perfect: string;
    readonly points: (points: number) => string;
    readonly multiplier: (factor: number) => string;
    readonly score: (score: number) => string;
    readonly best: (score: number) => string;
    /** In place of the best on a Daily: the day's best. */
    readonly today: (score: number) => string;
    /** In place of the best on a challenge. */
    readonly toBeat: (score: number) => string;
    /** Perfects towards the next multiplier; `next` is null at the top. */
    readonly streak: (
      streak: number,
      needed: number,
      next: number | null
    ) => string;
  };

  readonly pause: {
    readonly title: string;
    readonly resume: string;
    readonly restart: string;
    readonly menu: string;
    readonly countdown: string;
    /** While the GPU gives the watch back; Resume waits for it. */
    readonly restoring: string;
    /** Asked before Restart or Main menu throw away a round that scored. */
    readonly leaveQuestion: (score: number) => string;
    readonly leave: string;
    readonly stay: string;
  };

  readonly gameOver: {
    readonly title: string;
    readonly reasons: Readonly<Record<MissReason, string>>;
    readonly score: string;
    readonly best: string;
    /** The day's best, in place of the best after a Daily. */
    readonly today: string;
    /** A challenge's score, in place of the best. */
    readonly toBeat: string;
    readonly newBest: string;
    readonly beaten: (toBeat: number) => string;
    readonly toBeatShort: (points: number, toBeat: number) => string;
    readonly retry: string;
    /** How far outside the window the tap landed, in place of the reason. */
    readonly early: (ms: number) => string;
    readonly late: (ms: number) => string;
    readonly toUnlock: (points: number, watch: string) => string;
    readonly toCertificate: (points: number, certificate: string) => string;
    readonly toBest: (points: number) => string;
    readonly toLevel: (points: number, level: number) => string;
    /** `watches`: the names, already listed ("Tourbillon and Endless"). */
    readonly unlocked: (watches: string) => string;
    readonly playWatch: (watch: string) => string;
    readonly certified: (certificate: string) => string;
    /** The round's rate and spread, in whole ms (rate negative early). */
    readonly timing: (rate: number, spread: number) => string;
    readonly share: string;
    readonly copied: string;
    readonly shareFailed: string;
    /** The share text's box, to copy by hand when sharing fails. */
    readonly shareManual: string;
    readonly menu: string;
  };

  readonly settings: {
    readonly title: string;
    readonly close: string;
    readonly sound: string;
    readonly vibration: string;
    readonly vibrationUnsupported: string;
    /** The studio's colours: the system's, light or dark. */
    readonly appearance: string;
    readonly themes: {
      readonly system: string;
      readonly light: string;
      readonly dark: string;
    };
    readonly night: string;
    readonly nightHint: string;
    readonly reducedMotion: string;
    readonly reducedMotionHint: string;
    readonly reducedMotionSystem: string;
    /** The cheapest rendering, whatever the device could manage. */
    readonly batterySaver: string;
    readonly batterySaverHint: string;
    readonly language: string;
    /** Backing progress up to a file, and restoring it from one. */
    readonly progress: string;
    readonly progressHint: string;
    readonly backUp: string;
    /** The file picker's label. */
    readonly restore: string;
    readonly restoreOutcomes: Readonly<Record<RestoreOutcome, string>>;
    /** The link to the privacy notice, at the panel's foot. */
    readonly privacy: string;
  };

  /** The online boards, and signing in to be on them. */
  readonly leaderboard: {
    /** Its name; the title's button too. */
    readonly title: string;
    readonly close: string;
    /** The board picker's accessible name. */
    readonly boards: string;
    readonly season: (watch: string) => string;
    readonly event: (name: string) => string;
    readonly daily: (number: number) => string;
    readonly loading: string;
    readonly empty: string;
    readonly unreachable: string;
    readonly closed: string;
    readonly rank: (rank: number) => string;
    /** The caller's own place, under the list. */
    readonly you: (rank: number, score: number) => string;
    readonly youMark: string;
    readonly notOnBoard: string;
    readonly signInPrompt: string;
    readonly google: string;
    readonly github: string;
    readonly privacy: string;
    /** The link to the privacy notice, under the note. */
    readonly privacyLink: string;
    readonly signingIn: string;
    readonly signInFailed: string;
    readonly signedInAs: (name: string) => string;
    readonly rename: string;
    readonly nameLabel: string;
    readonly nameRule: string;
    readonly save: string;
    readonly cancel: string;
    readonly signOut: string;
    readonly deleteAccount: string;
    readonly deleteConfirm: string;
    readonly deleteYes: string;
    readonly deleted: string;
    readonly failed: string;
    /** What became of a ranked round, on the results. */
    readonly posting: string;
    readonly posted: (rank: number, best: number) => string;
    readonly flagged: string;
    readonly rejected: string;
    readonly postFailed: string;
    /**
     * Offered to a guest under the results. The round just played can't be
     * posted (the server never dealt it), so it promises only the next ones.
     */
    readonly signInToPost: string;
  };

  /** The player's timing per watch, drawn as a timegrapher's trace. */
  readonly timegrapher: {
    /** Its name, the same in every language; the title's button too. */
    readonly title: string;
    readonly close: string;
    /** The watch picker's accessible name. */
    readonly watches: string;
    readonly intro: string;
    readonly empty: string;
    readonly rate: string;
    readonly spread: string;
    readonly perfect: string;
    readonly hits: string;
    /** A rate in whole ms, negative early: "9 ms late", "on time". */
    readonly rateValue: (ms: number) => string;
    readonly spreadValue: (ms: number) => string;
    /** A share from 0 to 1, as a whole percentage. */
    readonly perfectValue: (share: number) => string;
    readonly hitsValue: (count: number) => string;
    /** The trace's ends: late above the zero, early below. */
    readonly late: string;
    readonly early: string;
    /** The trace as a screen reader hears it: its hits' rate and spread. */
    readonly trace: (count: number, rate: number, spread: number) => string;
  };

  /** Read out by screen readers as the game changes state. */
  readonly announce: {
    readonly started: string;
    /** Read after `started` while the watch is still new to the player. */
    readonly rule: (rule: string) => string;
    readonly locked: (requirement: string) => string;
    readonly multiplierOn: (factor: number) => string;
    readonly multiplierOff: string;
    readonly paused: string;
    readonly resumed: string;
    readonly gameOver: (
      score: number,
      best: number,
      isNewBest: boolean
    ) => string;
    /** A round with no best to compare with: a challenge's. */
    readonly roundOver: (score: number) => string;
    readonly dailyOver: (
      number: number,
      score: number,
      best: number,
      isNewBest: boolean
    ) => string;
    readonly beaten: (toBeat: number) => string;
  };
}
