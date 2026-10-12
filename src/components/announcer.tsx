import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { announcementHost, announcements } from '../utils/announcer';
import { WithEnglishNames } from './english';

const NO_BREAK_SPACE = ' ';
/**
 * A message made this close to the move (a pause, as its dialog opens) is
 * said again where the regions move to. Well short of the results' delay,
 * so a miss isn't said twice over the results' own reading.
 */
const REPEAT_WITHIN_MS = 300;
/** Lets the moved regions settle in the tree before they speak. */
const REPEAT_DELAY_MS = 100;

interface Message {
  readonly text: string;
  readonly at: number;
}

const SILENT: Message = { text: '', at: -Infinity };

/**
 * The page's two live regions. Screen readers read polite messages when
 * they finish speaking and urgent ones straight away. While a modal dialog
 * is open they sit inside it, where they can still be heard, and a message
 * made just as they move (a pause, a miss) is said there again.
 */
export function Announcer() {
  const host = useSyncExternalStore(
    listener => announcementHost.subscribe(listener),
    () => announcementHost.get()
  );
  const [state, setState] = useState<{
    polite: Message;
    urgent: Message;
    /** Where the regions are now, and what they held before they moved. */
    host: HTMLElement | null;
    moved: { polite: Message; urgent: Message } | null;
  }>({ polite: SILENT, urgent: SILENT, host, moved: null });

  // Regions that move are new to the screen reader: they start empty, and
  // only what was just said comes back.
  if (state.host !== host) {
    setState({
      polite: SILENT,
      urgent: SILENT,
      host,
      moved: { polite: state.polite, urgent: state.urgent },
    });
  }

  useEffect(
    () =>
      announcements.subscribe(announcement => {
        if (!announcement) return;
        const key = announcement.urgent ? 'urgent' : 'polite';
        setState(current => ({
          ...current,
          [key]: {
            // A changed string is what makes a live region speak, so the
            // same message twice in a row gets a trailing no-break space.
            text:
              current[key].text === announcement.text
                ? `${announcement.text}${NO_BREAK_SPACE}`
                : announcement.text,
            at: announcement.at,
          },
        }));
      }),
    []
  );

  const { moved } = state;
  useEffect(() => {
    if (!moved) return;
    // Fresh as of the move, not of when the regions speak again.
    const movedAt = performance.now();
    const timer = setTimeout(() => {
      const fresh = (message: Message) =>
        movedAt - message.at < REPEAT_WITHIN_MS ? message : SILENT;
      setState(current => ({
        ...current,
        polite: current.polite.text ? current.polite : fresh(moved.polite),
        urgent: current.urgent.text ? current.urgent : fresh(moved.urgent),
        moved: null,
      }));
    }, REPEAT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [moved]);

  const regions = (
    <>
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="announcer-polite"
      >
        <WithEnglishNames>{state.polite.text}</WithEnglishNames>
      </div>
      <div
        className="sr-only"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="announcer-urgent"
      >
        <WithEnglishNames>{state.urgent.text}</WithEnglishNames>
      </div>
    </>
  );
  return host ? createPortal(regions, host) : regions;
}
