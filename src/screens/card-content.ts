import type { HitQuality } from '../game';
import type { Dictionary } from '../i18n';
import { qualitiesOf, type DailyRecord } from '../state/daily';
import type { CardContent } from '../utils/result-card';
import type { RoundOutcome } from './game-over-dialog';

/**
 * What a round's card shows, the same round its share text tells of: on a
 * Daily the day's best run, anywhere else the round itself. Its chips are
 * what the round earned: a new best and a certificate, or a score beaten.
 */
export function cardContent({
  t,
  outcome,
  watchName,
  images,
  score,
  qualities,
  daily,
}: {
  t: Dictionary;
  outcome: RoundOutcome;
  watchName: string;
  images: readonly string[];
  score: number;
  qualities: readonly HitQuality[];
  daily: DailyRecord | null;
}): CardContent {
  const base = { scoreLabel: t.gameOver.score, images };
  switch (outcome.kind) {
    case 'collection':
      return {
        ...base,
        heading: watchName,
        score,
        second: { label: t.gameOver.best, value: outcome.best },
        badges: [
          ...(outcome.isNewBest ? [t.gameOver.newBest] : []),
          ...(outcome.certificate ? [t.certificates[outcome.certificate]] : []),
        ],
        qualities,
      };
    case 'daily': {
      const best = daily?.number === outcome.number ? daily : null;
      return {
        ...base,
        heading: `${t.daily.name(outcome.number)} · ${watchName}`,
        score: best?.best ?? score,
        second: null,
        badges: outcome.beat?.beaten
          ? [t.gameOver.beaten(outcome.beat.toBeat)]
          : [],
        qualities: best ? qualitiesOf(best.marks) : qualities,
      };
    }
    case 'challenge':
    case 'ghost':
      return {
        ...base,
        heading:
          outcome.kind === 'ghost'
            ? `${t.ghost.title} · ${watchName}`
            : `${t.challenge.title} · ${watchName}`,
        score,
        second: { label: t.gameOver.toBeat, value: outcome.beat.toBeat },
        badges: outcome.beat.beaten
          ? [t.gameOver.beaten(outcome.beat.toBeat)]
          : [],
        qualities,
      };
  }
}
