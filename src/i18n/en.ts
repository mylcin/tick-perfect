import type { Dictionary } from './dictionary';

const points = (count: number) =>
  `${String(count)} ${count === 1 ? 'point' : 'points'}`;

/** "38 ms", or "1.2 s" past a second. */
function formatMs(ms: number): string {
  return ms < 1000
    ? `${String(Math.max(1, Math.round(ms)))} ms`
    : `${(ms / 1000).toFixed(1)} s`;
}

/** Keeps a short phrase on one line. */
const NBSP = '\u00a0';

/** "9 ms late", "4 ms early" or "on time", from a signed whole ms. */
function rateText(ms: number): string {
  if (ms === 0) return 'on time';
  return `${String(Math.abs(ms))} ms ${ms > 0 ? 'late' : 'early'}`;
}

export const en: Dictionary = {
  languageName: 'English',
  locale: 'en',

  title: {
    tagline: 'A one-tap timing game on a mechanical watch',
    play: 'Tap to play',
    loading: 'Winding the watch…',
    keyHint: 'Space to play · ← → to browse',
    best: score => `Best ${String(score)}`,
    firstRule: 'One miss ends the run · the bright core is Perfect',
    settings: 'Settings',
    help: 'How to play',
    unsupportedWebgl:
      'Your browser has 3D graphics turned off. Turn on hardware acceleration in its settings, then reload.',
    loadFailed: 'The watch couldn’t load. Check your connection and try again.',
    stopped: 'The watch stopped drawing. Reload to bring it back.',
    reload: 'Reload',
  },

  storage: {
    notSaved:
      'This browser isn’t keeping your progress. Allow site data to save it.',
  },

  homeScreen: {
    hint: 'Add to Home Screen to keep your progress safe. It starts afresh there: back up in Settings first, then restore.',
    dismiss: 'Dismiss the tip',
  },

  help: {
    title: 'How to play',
    close: 'Close how to play',
    tapTitle: 'Tap on time',
    tap: 'Tap as the seconds hand meets the marker. Every hit speeds it up; one miss ends the run.',
    perfectTitle: 'Perfect',
    perfect: (perfect, good) =>
      `The marker’s bright core is a Perfect: +${String(perfect)} instead of +${String(good)}.`,
    streakTitle: 'Streak',
    tier: (count, factor) => `${String(count)} for ×${String(factor)}`,
    streak: tiers =>
      `Perfects in a row multiply every score: ${tiers}, until a plain hit.`,
    watchTitle: watch => `The ${watch}’s rule`,
  },

  collection: {
    label: 'Watches',
    locked: 'Locked',
    endless: 'Endless',
    toUnlock: 'To unlock',
    scoreStep: (watch, score) => `Score ${String(score)} on the ${watch}`,
    levelStep: level => `Reach level ${String(level)}`,
    progress: (best, needed) =>
      ['Best', String(best), 'of', String(needed)].join(NBSP),
    pointsProgress: (count, needed) =>
      [String(count), 'of', String(needed), 'points'].join(NBSP),
    stepDone: 'done',
    best: score => `Best ${String(score)}`,
    noCertificate: 'Not yet certified',
  },

  level: {
    name: level => `Level ${String(level)}`,
    points: (count, next) =>
      next === null
        ? points(count)
        : `${String(count)}${NBSP}/${NBSP}${String(next)}`,
    summary: (level, count, next) =>
      `Watchmaker level ${String(level)}, ${
        next === null
          ? points(count)
          : `${String(count)} of ${String(next)} points`
      }`,
    reached: level => `Level ${String(level)} reached`,
  },

  daily: {
    name: number => `Daily #${String(number)}`,
    best: score => `Today ${String(score)}`,
    button: (number, watch) => `Daily #${String(number)}, ${watch}.`,
    todaysBest: score => `Today’s best ${String(score)}.`,
    reserveOf: (days, most) =>
      `Power reserve ${String(days)} of ${String(most)} days.`,
    reserve: days =>
      `Power reserve ${String(days)} ${days === 1 ? 'day' : 'days'}`,
    wound: 'Wound a day',
    next: (hours, minutes) =>
      `Next Daily in ${hours > 0 ? `${String(hours)} h ` : ''}${String(minutes)} min`,
    ready: number => `Daily #${String(number)} is ready`,
    intro: 'Same targets for everyone today · winds the power reserve',
  },

  practice: {
    open: 'Practice',
    paces: { slow: 'Slow', normal: 'Normal' },
    pace: 'Pace',
    good: 'Good',
    miss: 'Miss',
    timing: rateText,
    missed: timing =>
      timing === null
        ? 'Missed. Next target.'
        : `Missed, ${timing}. Next target.`,
    title: 'Practice set',
    hits: (hits, of) => `${String(hits)} of ${String(of)} hit`,
    perfects: 'Perfect',
    misses: 'Missed',
    bestStreak: 'Best streak',
    rate: 'Rate',
    spread: 'Spread',
    note: 'A miss moves on to the next target. Practice counts towards nothing: no best, level, Daily or achievement.',
    again: 'Again',
    menu: 'Main menu',
  },

  ghost: {
    open: 'Race your best',
    title: 'Against your best',
    hud: score => `Ghost ${String(score)}`,
    gap: gap =>
      gap === 0 ? '±0' : gap > 0 ? `+${String(gap)}` : `−${String(-gap)}`,
    against: 'Against your ghost',
    you: 'You',
    them: 'Ghost',
    verdict: gap =>
      gap > 0
        ? `You beat your ghost by ${String(gap)}.`
        : gap < 0
          ? `Your ghost stays ahead by ${String(-gap)}.`
          : 'Level with your ghost.',
  },

  challenge: {
    title: 'Challenge',
    card: (watch, score) => `Challenge · ${watch} · Beat ${String(score)}`,
    beat: score => `Beat ${String(score)}`,
    play: 'Play',
    dismiss: 'Dismiss the challenge',
    invalid: 'This challenge link is incomplete. Ask for it again.',
    earlierRules: 'Set on earlier rules: the targets differ.',
    laterRules: 'Set on newer rules: the targets differ.',
    locked: watch => `Unlock the ${watch} to take it on.`,
  },

  rules: {
    diver: 'Now and then the bezel turns, carrying the marker.',
    chronograph: 'Twin markers: tap the start mark, then the stop mark.',
    gmt: 'Never tap on the shaded part of the marker: the GMT hand covers it.',
    moonphase: 'Some markers fade away. Tap where they were.',
    tourbillon:
      'Now and then the watch rocks on the wrist. The timing stays the same.',
    grandComplication: 'Endless: every rule of the first series, mixed.',
    field:
      'Now and then the hand stops short of the marker. Wait for it to run on.',
    pilot:
      'Now and then cloud drifts over the dial. The hand flies on through it.',
    digital:
      'Now and then the display counts down 3, 2, 1 with a beep. Tap at zero.',
  },

  certificates: {
    adjusted: 'Adjusted',
    chronometer: 'Chronometer',
    observatory: 'Observatory',
  },

  engravings: {
    names: {
      isochronism: 'Isochronism',
      beatError: 'Beat error',
      positionalTest: 'Positional test',
      powerReserve: 'Power reserve',
      escapement: 'Escapement',
    },
    rules: {
      isochronism: '50 taps in a round, spread under 15 ms',
      beatError: '10 Perfects in a row',
      positionalTest: 'Observatory on the first six watches',
      powerReserve: 'Reserve wound to 7 days',
      escapement: '1,000 Perfects in all',
    },
    engraved: names => `${names} engraved on the caseback`,
    show: 'Achievements',
    hide: 'Back to the dial',
    intro: 'Each one is engraved on the caseback.',
    heading: watch => `The ${watch}’s caseback`,
    onThisWatch: 'Earned on this watch',
    onEvery: 'On every caseback',
    done: 'Engraved',
    progress: (now, of) => `${String(now)}${NBSP}/${NBSP}${String(of)}`,
  },

  variants: {
    label: 'Variant',
    names: {
      standard: 'Standard',
      green: 'Green Sunburst',
      blue: 'Blue Sunburst',
      panda: 'White Opaline',
      cream: 'Cream Opaline',
      blueBlack: 'Blue-Black Ceramic',
      burgundyBlack: 'Burgundy-Black Gilt',
      midnightBlue: 'Midnight Sunburst',
      black: 'Black Lacquer',
      yellow: 'Yellow Carbon',
      orangeBlack: 'Orange Carbon',
      silver: 'Silver Opaline',
      navy: 'Navy Rose Gold',
      olive: 'Olive Matte',
      bronze: 'Brown Bronze',
      brownGold: 'Brown Rose Gold',
      red: 'Red Resin',
      gold: 'Gold Steel',
    },
    requirement: (certificate, score) =>
      `${certificate} certificate (${String(score)} points)`,
    earned: (names, count) => `New variant${count === 1 ? '' : 's'}: ${names}`,
  },

  tips: {
    perfect: points => `Perfect: the bright core scores ${String(points)}`,
    streak: (count, factor) => {
      const run = `${String(count)} Perfects in a row`;
      if (factor === 2) return `${run} double every score`;
      if (factor === 3) return `${run} triple every score`;
      return `${run}: ×${String(factor)} on every score`;
    },
    multiplier: factor => `×${String(factor)} until a plain hit`,
    streakBroken: 'A plain hit ends the streak',
  },

  game: {
    twistHints: {
      turn: 'Follow the marker as it turns',
      chrono: 'Tap at ▶, then again at ■',
      gmtWait: 'Tap past the line, once the GMT hand has left',
      gmtBeat: 'Tap before the line, before the GMT hand lands',
      moon: 'Remember where it was',
      sway: 'The watch rocks; the timing stays the same',
      hack: 'The hand stops; wait for it to run on',
      cloud: 'Through the cloud: keep your eye on the hand',
      countdown: 'Count down with the beeps: tap at zero',
    },
    heading: watch => `Tick Perfect, ${watch}`,
    surface: 'Tap when the seconds hand reaches the marker',
    hint: {
      touch: 'Tap as the hand meets the marker',
      keys: 'Tap or press Space as the hand meets the marker',
    },
    ready: 'Get ready',
    pause: 'Pause',
    perfect: 'Perfect',
    points: points => `+${String(points)}`,
    multiplier: factor => `×${String(factor)}`,
    score: score => `Score ${String(score)}`,
    best: score => `Best ${String(score)}`,
    today: score => `Today ${String(score)}`,
    toBeat: score => `To beat ${String(score)}`,
    practice: (target, of) => `Practice ${String(target)}/${String(of)}`,
    streak: (streak, needed, next) =>
      next === null
        ? 'Perfect streak: top multiplier'
        : `Perfect streak: ${String(streak)} of ${String(needed)} for ×${String(next)}`,
  },

  pause: {
    title: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    menu: 'Main menu',
    countdown: 'Resuming',
    restoring: 'Restoring the watch…',
    leaveQuestion: score => `This round’s ${points(score)} won’t be saved.`,
    leave: 'Leave the round',
    stay: 'Go back',
  },

  gameOver: {
    title: 'Game over',
    reasons: {
      early: 'Too early',
      late: 'Too late',
      passed: 'The hand passed the marker',
      blocked: 'The GMT hand covered the marker',
    },
    score: 'Score',
    best: 'Best',
    today: 'Today',
    toBeat: 'To beat',
    newBest: 'New best',
    beaten: toBeat => `${String(toBeat)} beaten`,
    toBeatShort: (count, toBeat) =>
      `${points(count)} to beat ${String(toBeat)}`,
    retry: 'Retry',
    early: ms => `${formatMs(ms)} too early`,
    late: ms => `${formatMs(ms)} too late`,
    toUnlock: (count, watch) => `${points(count)} to unlock the ${watch}`,
    toCertificate: (count, certificate) => `${points(count)} to ${certificate}`,
    toBest: count => `${points(count)} to your best`,
    toLevel: (count, level) => `${points(count)} to level ${String(level)}`,
    unlocked: watches => `${watches} unlocked`,
    playWatch: watch => `Play the ${watch}`,
    certified: certificate => `${certificate} certificate earned`,
    timing: (rate, spread) =>
      `${rate === 0 ? 'Right on time' : `Timing ${rateText(rate)}`} · ±${String(spread)} ms`,
    share: 'Share',
    copied: 'Copied to the clipboard',
    shareFailed: 'Couldn’t share. Copy the text below.',
    shareManual: 'Text to share',
    image: 'Image',
    imageSaved: 'Image saved',
    imageFailed: 'Couldn’t make the image.',
    menu: 'Main menu',
  },

  settings: {
    title: 'Settings',
    close: 'Close settings',
    sound: 'Sound',
    vibration: 'Vibration',
    vibrationUnsupported: 'Not supported on this device',
    appearance: 'Appearance',
    themes: { system: 'System', light: 'Light', dark: 'Dark' },
    night: 'Night mode',
    nightHint: 'A dark studio and glowing lume',
    reducedMotion: 'Turn off animations',
    reducedMotionHint: 'Only the game’s own motion remains',
    reducedMotionSystem: 'Following your system setting',
    batterySaver: 'Battery saver',
    batterySaverHint: 'Simpler graphics that use less power',
    language: 'Language',
    progress: 'Progress',
    progressHint: 'Kept in this browser. Back it up to a file to keep it safe.',
    backUp: 'Back up progress',
    restore: 'Restore',
    restoreOutcomes: {
      restored: 'Progress restored. Nothing you had was lost.',
      unchanged: 'Nothing new in this backup: you have it all already.',
      unreadable: 'That file couldn’t be read.',
      tooLarge: 'That file is too large to be a backup.',
      foreign: 'That file isn’t a Tick Perfect backup.',
    },
    reset: 'Start over',
    resetHint: 'Settings and progress are reset separately.',
    resetSettings: 'Reset settings',
    settingsReset: 'Settings are back to their defaults.',
    eraseProgress: 'Erase progress',
    eraseConfirm:
      'Erase every score, watch, Daily and achievement on this device? Back it up first if you may want it again.',
    erase: 'Erase',
    keepProgress: 'Keep it',
    progressErased: 'Progress erased. This device starts as new.',
    eraseSignedIn:
      'Your progress is in your account too, so it would come back. Sign out first to erase it from this device.',
    privacy: 'Privacy notice',
  },

  leaderboard: {
    title: 'Leaderboard',
    close: 'Close the leaderboard',
    boards: 'Boards',
    season: watch => `${watch} season`,
    event: name => name,
    daily: number => `Daily #${String(number)}`,
    loading: 'Loading the board…',
    empty: 'No scores yet. Be the first.',
    unreachable: 'The leaderboard can’t be reached right now.',
    closed: 'The leaderboard is closed for now.',
    rank: rank => `#${String(rank)}`,
    you: (rank, score) => `You: #${String(rank)} with ${String(score)}`,
    youMark: 'you',
    notOnBoard: 'You’re not on this board yet.',
    signInPrompt:
      'Sign in to put your scores on the boards. Playing never needs an account.',
    google: 'Continue with Google',
    github: 'Continue with GitHub',
    privacy:
      'We keep your display name, your scores and the taps that made them, to check each one, and your progress, so it follows you. Your name and best scores are public on the boards. Delete it all any time.',
    privacyLink: 'Privacy notice',
    signingIn: 'Signing in…',
    signInFailed: 'Signing in didn’t work. Try again.',
    signedInAs: name => `Signed in as ${name}`,
    rename: 'Change name',
    nameLabel: 'Display name',
    nameRule: '2 to 24 characters.',
    save: 'Save',
    cancel: 'Cancel',
    signOut: 'Sign out',
    deleteAccount: 'Delete my account',
    deleteConfirm:
      'This deletes your account, your scores and your saved progress online. Your progress on this device stays.',
    deleteYes: 'Delete it all',
    deleted: 'Your account is deleted.',
    failed: 'That didn’t work. Try again.',
    posting: 'Posting your score…',
    posted: (rank, best) =>
      `#${String(rank)} on the board, with your best of ${String(best)}.`,
    flagged: 'Your score is waiting for a review.',
    rejected: 'This score couldn’t be checked, so it isn’t on the board.',
    postFailed: 'The leaderboard couldn’t be reached; this score isn’t on it.',
    signInToPost: 'Sign in to post your next rounds',
  },

  timegrapher: {
    title: 'Timegrapher',
    close: 'Close the timegrapher',
    watches: 'Watches',
    intro:
      'Every hit is timed to the millisecond. A steady player draws a straight line on the zero.',
    empty:
      'Nothing measured yet. Play a round and every hit is drawn here, early or late.',
    rate: 'Rate',
    spread: 'Spread',
    perfect: 'Perfect',
    hits: 'Hits',
    rateValue: rateText,
    spreadValue: ms => `±${String(ms)} ms`,
    perfectValue: share =>
      new Intl.NumberFormat('en', {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(share),
    hitsValue: count => new Intl.NumberFormat('en').format(count),
    late: 'late',
    early: 'early',
    trace: (count, rate, spread) =>
      `Trace of the last ${String(count)} ${count === 1 ? 'hit' : 'hits'}: ${rateText(rate)} on average, spread ±${String(spread)} ms.`,
    latest: 'Latest rounds',
    latestNote:
      'On this watch, in every mode, against as many rounds before. Perfect is Perfects over hits; rate is the hits’ average error, late as +; spread is how widely they scatter around it.',
    lastRounds: count => `Last ${String(count)}`,
    roundsSoFar: count =>
      `${String(count)} ${count === 1 ? 'round' : 'rounds'} so far`,
    averageScore: 'Average',
    averageScoreValue: score =>
      new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score),
    change: (change, count) =>
      `${change} on the ${String(count)} rounds before`,
    daily: 'Daily',
    dailyRun: days =>
      days === 1 ? '1 day in a row' : `${String(days)} days in a row`,
    dailyPlayed: (played, days) =>
      `${String(played)} of the last ${String(days)} played`,
    dailyDay: (number, best) =>
      best === null
        ? `Daily #${String(number)}: not played`
        : `Daily #${String(number)}: best ${String(best)}`,
  },

  announce: {
    started:
      'Round started. Tap, or press Space, when the hand reaches the marker.',
    rule: rule => `New rule: ${rule}`,
    locked: requirement => `Locked. ${requirement}.`,
    multiplierOn: factor => `Multiplier ×${String(factor)} on`,
    multiplierOff: 'Multiplier off',
    paused: 'Game paused',
    resumed: 'Game resumed',
    gameOver: (score, best, isNewBest) =>
      `Game over. Score ${String(score)}. ${isNewBest ? 'New best!' : `Best ${String(best)}.`}`,
    roundOver: score => `Game over. Score ${String(score)}.`,
    dailyOver: (number, score, best, isNewBest) =>
      `Daily #${String(number)} over. Score ${String(score)}. ${isNewBest ? 'New best today!' : `Today’s best ${String(best)}.`}`,
    beaten: toBeat => `You beat ${String(toBeat)}!`,
  },
};
