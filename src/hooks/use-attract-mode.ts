import { useCallback, useMemo, useRef } from 'react';

import {
  centerTime,
  closingSpeed,
  createRng,
  MS_PER_SECOND,
  nextFloat,
  type GameAction,
  type GameRules,
  type RngState,
} from '../game';
import { createGameController } from '../state/game-controller';
import type { PoseSource } from '../three/pose';
import type { Observable } from '../utils/observable';

const BOT_SEED = 2026;
/** The bot lands within this many ms of the centre. */
const BOT_SPREAD_MS = 22;
const BOT_HITS_PER_ROUND = 18;
const RESTART_AFTER_MS = 1600;
/**
 * A longer gap between poses means the demo wasn't on screen (someone was
 * playing); its round is stale, so it starts over instead of catching up.
 */
const STALE_AFTER_MS = 250;

/**
 * Plays the real engine with a bot that taps near each target's centre and
 * misses on purpose after a while. Drives the watch on screens where nobody
 * is playing, and shows every mechanic in motion. It runs inside the scene's
 * frame loop, so it stops whenever the watch isn't drawn.
 */
export function useAttractMode(rules: GameRules): {
  pose: PoseSource;
  score: Observable<number>;
} {
  const controller = useMemo(
    () => createGameController(rules, { cracks: false }),
    [rules]
  );
  const bot = useRef<{
    rng: RngState;
    nextTapAt: number;
    endedAt: number;
    rounds: number;
    posedAt: number;
  }>({
    rng: createRng(BOT_SEED),
    nextTapAt: Number.POSITIVE_INFINITY,
    endedAt: Number.NEGATIVE_INFINITY,
    rounds: 0,
    posedAt: Number.NEGATIVE_INFINITY,
  });

  const plan = useCallback(() => {
    const { state } = controller.snapshot();
    if (state.phase !== 'playing') return;
    const [roll, rng] = nextFloat(bot.current.rng);
    bot.current.rng = rng;
    const { segment } = state.round;
    const missOnPurpose = state.round.hits >= BOT_HITS_PER_ROUND;
    // At a GMT gate it keeps to the Perfect zone, which is never covered.
    const spread =
      segment.twist?.kind === 'gmt'
        ? Math.min(
            BOT_SPREAD_MS,
            (segment.target.perfectWindow / closingSpeed(segment)) *
              MS_PER_SECOND *
              0.9
          )
        : BOT_SPREAD_MS;
    const offset = missOnPurpose ? -400 : (roll - 0.5) * 2 * spread;
    bot.current.nextTapAt = centerTime(segment) + offset;
  }, [controller]);

  const pose = useCallback<PoseSource>(
    now => {
      const player = bot.current;
      const apply = (action: GameAction) => {
        const events = controller.dispatch(action);
        if (events.some(event => event.type === 'miss')) player.endedAt = now;
      };
      const phase = () => controller.snapshot().state.phase;

      // Back from a game: rest the hands (they ease home), then start anew.
      if (now - player.posedAt > STALE_AFTER_MS && phase() !== 'idle') {
        controller.dispatch({ type: 'exit' });
        player.endedAt = now;
      }
      player.posedAt = now;

      if (
        (phase() === 'idle' || phase() === 'gameOver') &&
        now - player.endedAt > RESTART_AFTER_MS
      ) {
        apply({ type: 'start', time: now, seed: BOT_SEED + player.rounds++ });
        plan();
      }
      if (phase() === 'playing' && now >= player.nextTapAt) {
        apply({ type: 'tap', time: player.nextTapAt });
        plan();
      }
      apply({ type: 'tick', time: now });
      return controller.pose(now);
    },
    [controller, plan]
  );

  return { pose, score: controller.score };
}
