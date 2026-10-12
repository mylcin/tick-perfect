import type { Dictionary } from '../i18n';
import type { DailyOutcome } from '../state/daily';
import type { BeatStatus } from '../state/modes';

/** The score to beat, beaten or how far off, as a sentence. */
export function beatText(t: Dictionary, beat: BeatStatus): string {
  return beat.beaten
    ? t.announce.beaten(beat.toBeat)
    : `${t.gameOver.toBeatShort(beat.short, beat.toBeat)}.`;
}

/**
 * A Daily round's result as screen readers hear it. A round that was not
 * counted (an older Daily than the saved one) claims no day's best.
 */
export function dailyResultText(
  t: Dictionary,
  number: number,
  score: number,
  daily: DailyOutcome,
  beat: BeatStatus | null
): string {
  return [
    daily.best === null
      ? t.announce.roundOver(score)
      : t.announce.dailyOver(number, score, daily.best, daily.isNewBest),
    beat ? beatText(t, beat) : '',
  ]
    .filter(Boolean)
    .join(' ');
}
