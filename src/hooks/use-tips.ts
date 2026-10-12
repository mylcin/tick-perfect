import { useEffect, useRef, useState } from 'react';

import type { Dictionary } from '../i18n';
import { tipText, twistHintFor } from '../screens/hud-hint';
import { appStore } from '../state/app';
import type { GameController } from '../state/game-controller';
import { tipFor, trailingPerfects, type RoundTip } from '../state/tips';
import { announce } from '../utils/announcer';

/** How long a tip holds the line under the watch. */
const TIP_MS = 2500;

/**
 * Brings up each scoring tip once, the first time play shows its rule: on
 * the line under the watch for a moment, and read out. One at a time, and
 * never over a twist's hint, which the sweep coming up needs; a tip with no
 * room waits for its rule to come up again.
 */
export function useTips(
  controller: GameController,
  t: Dictionary,
  /** Twists' hints are on (the watch is still being learnt). */
  twistHints: boolean
): RoundTip | null {
  const [tip, setTip] = useState<RoundTip | null>(null);
  const showing = useRef(false);

  useEffect(
    () =>
      controller.subscribe((events, { state, qualities }) => {
        if (state.phase !== 'playing' || events[0]?.type === 'started') {
          setTip(null);
          return;
        }
        if (showing.current) return;
        if (twistHints && twistHintFor(state.round.segment)) return;
        const { scoring } = controller.rules;
        const { tips, markTip } = appStore.getState();
        // The hit is the last of `qualities`: the streak it grew or broke
        // ran up to it.
        const next = tipFor(
          events,
          trailingPerfects(qualities.slice(0, -1)),
          tips,
          scoring
        );
        if (!next) return;
        showing.current = true;
        markTip(next);
        setTip(next);
        // After this moment's own announcements (the multiplier's), which
        // would otherwise replace it: the tip says as much, and more.
        const text = tipText(t, next, scoring);
        setTimeout(() => {
          announce(text);
        }, 0);
      }),
    [controller, t, twistHints]
  );

  useEffect(() => {
    showing.current = tip !== null;
    if (!tip) return;
    const timer = setTimeout(() => {
      setTip(null);
    }, TIP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [tip]);

  return tip;
}
