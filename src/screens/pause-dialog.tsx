import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/buttons';
import { Modal } from '../components/modal';
import type { Dictionary } from '../i18n';
import type { SceneFailure, SceneStatus } from '../state/session';
import { sceneFailureText } from './watch-status';

/** Where the player asked to go, while they are asked if they're sure. */
type Leaving = 'restart' | 'menu';

/**
 * The pause menu. While the watch is away (the GPU took it back, or it
 * can't be drawn at all) it says so, and Resume waits: a round can't go on
 * unseen. Escape then goes to the title, the one way out that always works.
 *
 * A round is only saved when it ends in a miss, so Restart and Main menu
 * ask first when the round has scored. Escape steps back out of the
 * question, which was opened by a press, so the browser lets it.
 */
export function PauseDialog({
  t,
  open,
  scene,
  sceneFailure,
  score,
  onResume,
  onRestart,
  onMenu,
}: {
  t: Dictionary;
  open: boolean;
  scene: SceneStatus;
  sceneFailure: SceneFailure | null;
  /** The paused round's score: what leaving it would throw away. */
  score: number;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const away = scene !== 'ready';
  const resume = () => {
    if (!away) onResume();
  };
  const reason =
    scene === 'failed' ? sceneFailureText(t, sceneFailure) : t.pause.restoring;

  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // Each pause opens on the menu, never on a question left from the last.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLeaving(null);
  }
  const leave = (to: Leaving) => {
    if (score === 0) {
      (to === 'restart' ? onRestart : onMenu)();
      return;
    }
    setLeaving(to);
  };

  // The question replaces the buttons that asked it, so focus moves with
  // it, and back to the same button when the player stays.
  const stay = useRef<HTMLButtonElement>(null);
  const restart = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const asked = useRef<Leaving | null>(null);
  useEffect(() => {
    if (leaving) stay.current?.focus();
    else if (asked.current === 'restart') restart.current?.focus();
    else if (asked.current === 'menu') menu.current?.focus();
    asked.current = leaving;
  }, [leaving]);

  const cancel = () => {
    if (leaving) setLeaving(null);
    else if (away) onMenu();
    else resume();
  };

  return (
    <Modal
      open={open}
      labelledBy="pause-heading"
      {...(away && { describedBy: 'pause-away' })}
      onCancel={cancel}
      testId="pause-dialog"
    >
      <div className="absolute inset-0 grid animate-fade place-items-center bg-surface/75 px-6">
        <div className="flex w-full max-w-xs flex-col items-stretch gap-3 text-center">
          <h2
            id="pause-heading"
            className="mb-4 text-xs tracking-[0.5em] text-ink-2 uppercase"
          >
            {t.pause.title}
          </h2>
          {away && (
            <p
              id="pause-away"
              role="status"
              data-testid="pause-restoring"
              data-scene={scene}
              className="-mt-2 mb-2 text-sm text-balance text-ink-2"
            >
              {reason}
            </p>
          )}
          {leaving ? (
            <>
              <p
                id="pause-leaving"
                className="-mt-2 mb-2 text-sm text-balance text-ink-2"
              >
                {t.pause.leaveQuestion(score)}
              </p>
              <Button
                ref={stay}
                variant="primary"
                aria-describedby="pause-leaving"
                onClick={() => {
                  setLeaving(null);
                }}
              >
                {t.pause.stay}
              </Button>
              <Button
                aria-describedby="pause-leaving"
                onClick={leaving === 'restart' ? onRestart : onMenu}
              >
                {t.pause.leave}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                data-autofocus
                aria-disabled={away}
                className="aria-disabled:cursor-not-allowed!"
                onClick={resume}
              >
                {t.pause.resume}
              </Button>
              <Button
                ref={restart}
                onClick={() => {
                  leave('restart');
                }}
              >
                {t.pause.restart}
              </Button>
              <Button
                ref={menu}
                variant="quiet"
                onClick={() => {
                  leave('menu');
                }}
              >
                {t.pause.menu}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
